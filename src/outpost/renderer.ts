/**
 * Canvas 2D 렌더러. 시뮬레이션을 읽기만 하고 절대 바꾸지 않는다.
 *
 * 레이어(docs/outpost-art-review.md §3)
 *   S0 배경   오프스크린. 리사이즈·장 변경 시에만          — 해구 벽·수주·광선
 *   L0 지형   오프스크린. 리사이즈·장·침수 변경 시에만      — 물·암반·잔해·열수·분출구·코어 토대
 *   L1 라이브 지형 매 프레임 — 분출구 맥동, 열수 플룸, 잔해 반짝임, 코어
 *   L2 구조물 매 프레임 — 조준·충전·티어 실루엣
 *   L3 유닛   매 프레임 — 적·잠수정·드론(prev→pos 보간, y 정렬)
 *   L4 투사체·FX  매 프레임 — 궤적·폭발·플로팅 수치
 *   L5 오버레이   입력 시 — 고스트·사거리·경로 미리보기·침입 예고
 *
 * 캔버스는 자기 CSS 박스를 그대로 받는다. HUD를 다시 빼지 않는다(layout.ts 참조).
 */

import { GRID_H, GRID_W } from './contract.ts';
import type {
  BuildingId,
  BuildingView,
  CreateRenderer,
  GhostState,
  OutpostRenderer,
  SimEvent,
  SimView,
  TileIndex,
  Vec2,
  ViewportInsets,
} from './contract.ts';
import { BUILDINGS } from './content.ts';
import { BUILDING_LABELS, DISCOVERY_LABELS } from './format.ts';
import type { ViewLayout } from './layout.ts';
import {
  NO_INSETS,
  fitView,
  screenToTile,
  screenToWorld,
  clampToGrid,
  tileCenterToScreen,
  tileToScreen,
  worldToScreen,
} from './layout.ts';
import { EffectField, RevealBanner } from './render-fx.ts';
import { PALETTE, alpha, glow, hash01, lamp, ring, roundedRect } from './render-palette.ts';
import {
  drawBuilding as drawBuildingShape,
  drawCore as drawCoreShape,
  drawDrone as drawDroneShape,
  drawEnemy as drawEnemyShape,
  drawSub as drawSubShape,
} from './render-shapes.ts';
import {
  TERRAIN_THERMAL,
  TERRAIN_VENT,
  bakeBackground,
  bakeTerrain,
  coreCenter,
  ensureSurface,
  floodChecksum,
  prepareSurface,
  salvageGlints,
} from './render-scene.ts';

const ROLE_TINT = {
  drifter: PALETTE.fleshPale,
  swarm: PALETTE.chitin,
  breacher: PALETTE.alertAmber,
  glider: PALETTE.energyCyan,
  leviathan: PALETTE.arcaneViolet,
} as const;

const SORT_CAP = 160;
const KIND_ENEMY = 0;
const KIND_DRONE = 1;
const KIND_SUB = 2;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

class Renderer implements OutpostRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly c: CanvasRenderingContext2D | null;

  private layout: ViewLayout = fitView(0, 0, NO_INSETS);
  private dpr = 1;

  private bg: HTMLCanvasElement | null = null;
  private terrain: HTMLCanvasElement | null = null;
  private bgKey = '';
  private terrainKey = '';

  private readonly fx = new EffectField();
  private readonly reveal = new RevealBanner();

  private ghost: GhostState | null = null;
  private reduced = false;
  private frameSkip = false;
  private parity = 0;
  private destroyed = false;

  private clock = 0;
  private lastStamp = -1;
  private subHeading = Math.PI / 2;

  private readonly sortKey = new Float32Array(SORT_CAP);
  private readonly sortRef = new Int32Array(SORT_CAP);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.c = canvas.getContext('2d');
  }

  /* ─────────────────────────── 공개 API ─────────────────────────── */

  resize(cssWidth: number, cssHeight: number, dpr: number, insets: ViewportInsets = NO_INSETS): void {
    if (this.destroyed) return;
    this.dpr = Math.min(2, Math.max(1, Number.isFinite(dpr) ? dpr : 1));
    this.layout = fitView(cssWidth, cssHeight, insets);

    const pw = Math.max(1, Math.round(this.layout.boxWidth * this.dpr));
    const ph = Math.max(1, Math.round(this.layout.boxHeight * this.dpr));
    if (this.canvas.width !== pw) this.canvas.width = pw;
    if (this.canvas.height !== ph) this.canvas.height = ph;
    this.canvas.style.width = `${this.layout.boxWidth}px`;
    this.canvas.style.height = `${this.layout.boxHeight}px`;

    // 캐시 무효화 — 다음 draw 에서 다시 굽는다
    this.bgKey = '';
    this.terrainKey = '';
    this.fx.clear();
    this.seedAmbient();
  }

  setGhost(ghost: GhostState | null): void {
    this.ghost = ghost;
  }

  setReducedMotion(value: boolean): void {
    this.reduced = value;
    this.fx.reduced = value;
    if (value) this.fx.clear();
    else this.seedAmbient();
  }

  setFrameSkip(skip: boolean): void {
    this.frameSkip = skip;
  }

  pickTile(cssX: number, cssY: number): TileIndex {
    return screenToTile(this.layout, cssX, cssY);
  }

  pickPoint(cssX: number, cssY: number): Vec2 {
    return clampToGrid(screenToWorld(this.layout, cssX, cssY));
  }

  destroy(): void {
    this.destroyed = true;
    this.fx.clear();
    this.bg = null;
    this.terrain = null;
    this.ghost = null;
  }

  /* ─────────────────────────── 프레임 ─────────────────────────── */

  draw(view: SimView, events: readonly SimEvent[], interp: number): void {
    const c = this.c;
    if (!c || this.destroyed) return;
    if (this.layout.boxWidth <= 0 || this.layout.boxHeight <= 0) return;

    // 렌더 전용 시계. 시뮬레이션 결정성과 무관하다(고정 스텝은 sim 쪽에서만 보장).
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const dt = this.lastStamp < 0 ? 1 / 60 : Math.min(0.05, (now - this.lastStamp) / 1000);
    this.lastStamp = now;
    this.clock += dt;

    // 이벤트는 프레임을 건너뛰어도 반드시 소비한다(연출 유실 방지)
    for (const event of events) this.consume(event, view);
    this.fx.update(dt, this.layout.boxWidth, this.layout.boxHeight);
    this.reveal.update(dt);

    this.parity ^= 1;
    if (this.frameSkip && this.parity === 1) return;

    this.refreshSurfaces(view);

    const alphaStep = Math.min(1, Math.max(0, interp));
    const tile = this.layout.tile;
    const shake = this.fx.shakeOffset(this.clock);

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.layout.boxWidth, this.layout.boxHeight);

    if (this.bg) c.drawImage(this.bg, 0, 0, this.layout.boxWidth, this.layout.boxHeight);
    // 마린 스노우는 배경 위, 지형 아래 — 깊이감을 만든다
    this.fx.drawParticles(c);

    c.save();
    c.translate(shake.x, shake.y);
    if (this.terrain) c.drawImage(this.terrain, 0, 0, this.layout.boxWidth, this.layout.boxHeight);

    this.drawLiveTerrain(c, view);
    this.drawCoreAssembly(c, view);
    if (view.phase === 'build') this.drawPathPreview(c, view);
    this.drawBuildings(c, view);
    this.drawUnits(c, view, alphaStep);
    this.drawShots(c, view);
    this.fx.drawRings(c);
    this.drawIncoming(c, view);
    this.drawGhost(c);
    this.fx.drawTexts(c, Math.max(11, tile * 0.32));
    this.reveal.draw(c, tile);
    c.restore();
  }

  /* ─────────────────────────── 캐시 ─────────────────────────── */

  private seedAmbient(): void {
    if (this.reduced) return;
    const { boxWidth: w, boxHeight: h, tile } = this.layout;
    if (w <= 0 || h <= 0) return;
    const count = Math.min(70, Math.round((w * h) / 9000));
    this.fx.seedSnow(w, h, Math.max(18, tile), count);
  }

  private refreshSurfaces(view: SimView): void {
    const l = this.layout;
    const geometry = `${l.boxWidth}x${l.boxHeight}@${l.tile}+${l.originX},${l.originY}#${this.dpr}`;

    const bgKey = `${geometry}|${view.chapter}`;
    if (bgKey !== this.bgKey) {
      this.bg = ensureSurface(this.bg, l.boxWidth, l.boxHeight, this.dpr);
      const bc = prepareSurface(this.bg, this.dpr);
      if (bc) bakeBackground(bc, l, view.chapter);
      this.bgKey = bgKey;
    }

    // 구조물은 라이브 레이어라 fieldVersion 으로 다시 굽지 않는다. 침수만 지형을 바꾼다.
    const terrainKey = `${geometry}|${view.chapter}|${floodChecksum(view.flooded)}`;
    if (terrainKey !== this.terrainKey) {
      this.terrain = ensureSurface(this.terrain, l.boxWidth, l.boxHeight, this.dpr);
      const tc = prepareSurface(this.terrain, this.dpr);
      if (tc) bakeTerrain(tc, l, view.terrain, view.flooded, view.chapter);
      this.terrainKey = terrainKey;
    }
  }

  /* ─────────────────────────── 라이브 지형 ─────────────────────────── */

  private drawLiveTerrain(c: CanvasRenderingContext2D, view: SimView): void {
    const l = this.layout;
    const tile = l.tile;
    const t = this.clock;

    for (let i = 0; i < GRID_W * GRID_H; i++) {
      const kind = view.terrain[i];
      if (kind === TERRAIN_VENT) {
        const at = tileToScreen(l, i);
        const cx = at.x + tile / 2;
        const cy = at.y + tile * 0.42;
        const breathe = this.reduced ? 0.55 : 0.42 + Math.sin(t * 0.8 + i) * 0.24;
        glow(c, cx, cy, tile * 0.3, '#3fd6c8', breathe);
        // 틈 안쪽의 차가운 심부광
        c.fillStyle = alpha('#7ff0e2', 0.25 + breathe * 0.35);
        c.beginPath();
        c.ellipse(cx, cy, tile * 0.07, tile * 0.3, 0, 0, Math.PI * 2);
        c.fill();
        if (!this.reduced && Math.sin(t * 0.5 + i * 2.1) > 0.985) {
          this.fx.bubbles(cx, at.y + tile * 0.6, tile, 2);
        }
      } else if (kind === TERRAIN_THERMAL) {
        const at = tileToScreen(l, i);
        const cx = at.x + tile / 2;
        const mouth = at.y + tile * 0.32;
        // 플룸 — 위로 흔들리며 흩어진다
        const steps = 5;
        for (let s = 0; s < steps; s++) {
          const p = s / steps;
          const sway = this.reduced ? 0 : Math.sin(t * 1.7 + p * 3 + i) * tile * 0.09 * p;
          c.fillStyle = alpha('#d9c39a', 0.16 * (1 - p));
          c.beginPath();
          c.ellipse(cx + sway, mouth - p * tile * 0.7, tile * (0.06 + p * 0.14), tile * 0.09, 0, 0, Math.PI * 2);
          c.fill();
        }
        glow(c, cx, mouth, tile * 0.11, PALETTE.oreGold, 0.45);
      }
    }

    // 잔해 — 남은 인양량이 반짝임 개수로 읽힌다
    for (const wreck of view.wrecks) {
      const at = tileToScreen(l, wreck.tile);
      const glints = salvageGlints(wreck.yieldPerSecond, wreck.forward);
      if (glints === 0) {
        // 고갈 — 무광 회색으로 가라앉힌다
        c.fillStyle = alpha('#2a3338', 0.45);
        c.fillRect(at.x, at.y, tile, tile);
        continue;
      }
      for (let g = 0; g < glints; g++) {
        const gx = at.x + tile * (0.28 + hash01(wreck.tile, g, 13) * 0.44);
        const gy = at.y + tile * (0.34 + hash01(wreck.tile, g, 17) * 0.34);
        const twinkle = this.reduced ? 0.7 : 0.45 + Math.sin(this.clock * 3.1 + g * 2 + wreck.tile) * 0.45;
        lamp(c, gx, gy, tile * 0.035, wreck.forward ? PALETTE.oreGold : '#cbb277', twinkle);
      }
      if (wreck.forward) {
        // 전방 고수익 노드 — 위험한 곳에 있다는 표시
        ring(c, at.x + tile / 2, at.y + tile / 2, tile * 0.42, 1.5, PALETTE.oreGold, 0.22);
      }
    }
  }

  private drawCoreAssembly(c: CanvasRenderingContext2D, view: SimView): void {
    const center = coreCenter(this.layout, view.terrain);
    const ratio = view.core.hp / Math.max(1, view.core.maxHp);
    // drawCore 는 render-shapes 에 있다(형태 어휘는 한곳에 모은다)
    drawCoreShape(c, center.x, center.y, this.layout.tile, ratio, this.clock, this.reduced);
  }

  /** 경로 미리보기 — pathHint 로 «적이 어디로 오는가»를 건설 단계에 보여준다 */
  private drawPathPreview(c: CanvasRenderingContext2D, view: SimView): void {
    const l = this.layout;
    const tile = l.tile;
    const hint = view.pathHint;
    const drift = (this.clock * 0.6) % 1;

    c.save();
    c.strokeStyle = alpha(PALETTE.energyCyan, 0.16);
    c.lineWidth = Math.max(1, tile * 0.05);
    c.lineCap = 'round';
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const i = y * GRID_W + x;
        const here = hint[i];
        if (here < 0) continue;
        // 흐름 방향 = 가장 낮은 dist 이웃
        let bestX = 0;
        let bestY = 0;
        let best = here;
        if (y > 0 && hint[i - GRID_W] >= 0 && hint[i - GRID_W] < best) {
          best = hint[i - GRID_W];
          bestX = 0;
          bestY = -1;
        }
        if (x > 0 && hint[i - 1] >= 0 && hint[i - 1] < best) {
          best = hint[i - 1];
          bestX = -1;
          bestY = 0;
        }
        if (x < GRID_W - 1 && hint[i + 1] >= 0 && hint[i + 1] < best) {
          best = hint[i + 1];
          bestX = 1;
          bestY = 0;
        }
        if (y < GRID_H - 1 && hint[i + GRID_W] >= 0 && hint[i + GRID_W] < best) {
          best = hint[i + GRID_W];
          bestX = 0;
          bestY = 1;
        }
        if (bestX === 0 && bestY === 0) continue;
        const at = tileCenterToScreen(l, i);
        const slide = this.reduced ? 0 : (drift - 0.5) * tile * 0.3;
        const px = at.x + bestX * slide;
        const py = at.y + bestY * slide;
        const len = tile * 0.16;
        c.beginPath();
        c.moveTo(px - bestX * len, py - bestY * len);
        c.lineTo(px + bestX * len, py + bestY * len);
        c.stroke();
      }
    }
    c.lineCap = 'butt';
    c.restore();
  }

  /* ─────────────────────────── 구조물·유닛 ─────────────────────────── */

  private drawBuildings(c: CanvasRenderingContext2D, view: SimView): void {
    const l = this.layout;
    const count = Math.min(view.buildingCount, view.buildings.length);
    for (let i = 0; i < count; i++) {
      const b = view.buildings[i];
      const at = tileCenterToScreen(l, b.tile);
      drawBuildingShape(c, b, at.x, at.y, l.tile, this.clock, this.reduced);
    }
  }

  /** 적·드론·잠수정을 y 로 정렬해 그린다(할당 없이 삽입 정렬) */
  private drawUnits(c: CanvasRenderingContext2D, view: SimView, step: number): void {
    const l = this.layout;
    let n = 0;
    const enemyCount = Math.min(view.enemyCount, view.enemies.length);
    for (let i = 0; i < enemyCount && n < SORT_CAP; i++) {
      const e = view.enemies[i];
      this.sortKey[n] = lerp(e.prev.y, e.pos.y, step);
      this.sortRef[n] = (KIND_ENEMY << 20) | i;
      n++;
    }
    const droneCount = Math.min(view.droneCount, view.drones.length);
    for (let i = 0; i < droneCount && n < SORT_CAP; i++) {
      const d = view.drones[i];
      this.sortKey[n] = lerp(d.prev.y, d.pos.y, step);
      this.sortRef[n] = (KIND_DRONE << 20) | i;
      n++;
    }
    if (n < SORT_CAP) {
      this.sortKey[n] = lerp(view.sub.prev.y, view.sub.pos.y, step);
      this.sortRef[n] = KIND_SUB << 20;
      n++;
    }

    for (let i = 1; i < n; i++) {
      const key = this.sortKey[i];
      const ref = this.sortRef[i];
      let j = i - 1;
      while (j >= 0 && this.sortKey[j] > key) {
        this.sortKey[j + 1] = this.sortKey[j];
        this.sortRef[j + 1] = this.sortRef[j];
        j--;
      }
      this.sortKey[j + 1] = key;
      this.sortRef[j + 1] = ref;
    }

    for (let s = 0; s < n; s++) {
      const ref = this.sortRef[s];
      const kind = ref >>> 20;
      const index = ref & 0xfffff;
      if (kind === KIND_ENEMY) {
        const e = view.enemies[index];
        const at = worldToScreen(l, {
          x: lerp(e.prev.x, e.pos.x, step),
          y: lerp(e.prev.y, e.pos.y, step),
        });
        drawEnemyShape(c, e, at.x, at.y, l.tile, this.clock, this.reduced);
      } else if (kind === KIND_DRONE) {
        const d = view.drones[index];
        const at = worldToScreen(l, {
          x: lerp(d.prev.x, d.pos.x, step),
          y: lerp(d.prev.y, d.pos.y, step),
        });
        drawDroneShape(c, d, at.x, at.y, l.tile, this.clock, this.reduced);
      } else {
        const sub = view.sub;
        const dx = sub.pos.x - sub.prev.x;
        const dy = sub.pos.y - sub.prev.y;
        const moving = Math.abs(dx) + Math.abs(dy) > 0.0005;
        if (moving) this.subHeading = Math.atan2(dy, dx);
        const at = worldToScreen(l, {
          x: lerp(sub.prev.x, sub.pos.x, step),
          y: lerp(sub.prev.y, sub.pos.y, step),
        });
        drawSubShape(c, sub, at.x, at.y, l.tile, this.clock, this.reduced, moving, this.subHeading);
      }
    }
  }

  private drawShots(c: CanvasRenderingContext2D, view: SimView): void {
    const l = this.layout;
    const tile = l.tile;
    const count = Math.min(view.shotCount, view.shots.length);
    for (let i = 0; i < count; i++) {
      const s = view.shots[i];
      const from = worldToScreen(l, s.from);
      const to = worldToScreen(l, s.to);
      const t = 1 - Math.min(1, Math.max(0, s.life));

      if (s.kind === 'harpoon') {
        c.strokeStyle = alpha(PALETTE.energyCyan, 0.35 + s.life * 0.5);
        c.lineWidth = Math.max(1.5, tile * 0.045);
        c.beginPath();
        c.moveTo(from.x, from.y);
        c.lineTo(to.x, to.y);
        c.stroke();
        const hx = lerp(from.x, to.x, t);
        const hy = lerp(from.y, to.y, t);
        lamp(c, hx, hy, tile * 0.05, PALETTE.energyCyan, 0.9);
      } else if (s.kind === 'mortar') {
        // 포물선 — 지상 전용 무기임이 궤적으로 보인다
        const arc = Math.hypot(to.x - from.x, to.y - from.y) * 0.32;
        const px = lerp(from.x, to.x, t);
        const py = lerp(from.y, to.y, t) - Math.sin(t * Math.PI) * arc;
        c.strokeStyle = alpha(PALETTE.alertAmber, 0.22);
        c.lineWidth = Math.max(1, tile * 0.03);
        c.setLineDash([tile * 0.08, tile * 0.1]);
        c.beginPath();
        c.moveTo(from.x, from.y);
        c.quadraticCurveTo((from.x + to.x) / 2, (from.y + to.y) / 2 - arc * 2, to.x, to.y);
        c.stroke();
        c.setLineDash([]);
        lamp(c, px, py, tile * 0.065, PALETTE.alertAmber, 1);
      } else if (s.kind === 'resonator') {
        ring(c, to.x, to.y, tile * (0.2 + t * 1.1), Math.max(2, tile * 0.06), PALETTE.arcaneViolet, s.life * 0.8);
        c.strokeStyle = alpha(PALETTE.arcaneViolet, s.life * 0.4);
        c.lineWidth = Math.max(1, tile * 0.03);
        c.beginPath();
        c.moveTo(from.x, from.y);
        c.lineTo(to.x, to.y);
        c.stroke();
      } else {
        ring(c, to.x, to.y, tile * (0.3 + t * 2.2), Math.max(2, tile * 0.08), PALETTE.energyCyan, s.life * 0.7);
      }
    }
  }

  /* ─────────────────────────── 오버레이 ─────────────────────────── */

  /** 침입 예고 — 경고는 «항상 방향을 가진다». 세기는 셰브런 개수로 */
  private drawIncoming(c: CanvasRenderingContext2D, view: SimView): void {
    const l = this.layout;
    const tile = l.tile;
    for (const warn of view.wave.incoming) {
      if (warn.strength <= 0) continue;
      const at = tileToScreen(l, warn.vent);
      const cx = at.x + tile / 2;
      const pulse = this.reduced ? 0.7 : 0.45 + Math.sin(this.clock * 3.4) * 0.35;
      glow(c, cx, at.y + tile * 0.5, tile * 0.34, PALETTE.alertAmber, pulse * 0.5);
      for (let s = 0; s < warn.strength; s++) {
        const drop = this.reduced ? 0 : ((this.clock * 0.9 + s * 0.33) % 1) * tile * 0.35;
        const y = at.y + tile * (0.9 + s * 0.32) + drop;
        const fade = 1 - s / (warn.strength + 0.6);
        c.strokeStyle = alpha(PALETTE.alertAmber, 0.35 + fade * 0.5);
        c.lineWidth = Math.max(2, tile * 0.07);
        c.beginPath();
        c.moveTo(cx - tile * 0.22, y);
        c.lineTo(cx, y + tile * 0.16);
        c.lineTo(cx + tile * 0.22, y);
        c.stroke();
      }
    }
  }

  private drawGhost(c: CanvasRenderingContext2D): void {
    const ghost = this.ghost;
    if (!ghost) return;
    const l = this.layout;
    const tile = l.tile;
    if (ghost.tile < 0 || ghost.tile >= GRID_W * GRID_H) return;
    const at = tileCenterToScreen(l, ghost.tile);
    const preview = ghost.preview;
    const ok = preview.result.ok;

    // 경로가 달라지는 타일 — 점선으로 «막으면 이렇게 돈다»
    if (preview.changedTiles.length > 0) {
      const dash = this.reduced ? 0 : (this.clock * 22) % (tile * 0.36);
      c.save();
      c.strokeStyle = alpha(PALETTE.energyCyan, 0.6);
      c.lineWidth = Math.max(1.5, tile * 0.05);
      c.setLineDash([tile * 0.18, tile * 0.18]);
      c.lineDashOffset = -dash;
      for (const t of preview.changedTiles) {
        if (t < 0 || t >= GRID_W * GRID_H) continue;
        const p = tileToScreen(l, t);
        c.strokeRect(p.x + tile * 0.14, p.y + tile * 0.14, tile * 0.72, tile * 0.72);
      }
      c.setLineDash([]);
      c.restore();
    }

    // 사거리 — content.ts 카탈로그가 단일 출처(렌더러가 수치를 복제하지 않는다)
    const spec = BUILDINGS[ghost.building];
    if (spec.range > 0) {
      c.strokeStyle = alpha(PALETTE.energyCyan, 0.45);
      c.lineWidth = Math.max(1, tile * 0.035);
      c.setLineDash([tile * 0.12, tile * 0.12]);
      c.beginPath();
      c.arc(at.x, at.y, spec.range * tile, 0, Math.PI * 2);
      c.stroke();
      if (spec.minRange > 0) {
        c.strokeStyle = alpha(PALETTE.threatRed, 0.4);
        c.beginPath();
        c.arc(at.x, at.y, spec.minRange * tile, 0, Math.PI * 2);
        c.stroke();
      }
      c.setLineDash([]);
    }

    // 고스트 본체 — 실제 크기, 알파 0.6
    c.save();
    c.globalAlpha = ok ? 0.62 : 0.35;
    drawBuildingShape(c, ghostView(ghost.tile, ghost.building), at.x, at.y, tile, this.clock, this.reduced);
    c.restore();

    if (!ok) {
      // 붉은 해칭 — 못 짓는 이유는 HUD 토스트가 말한다
      c.save();
      c.beginPath();
      c.rect(at.x - tile / 2, at.y - tile / 2, tile, tile);
      c.clip();
      c.strokeStyle = alpha(PALETTE.threatRed, 0.75);
      c.lineWidth = Math.max(1.5, tile * 0.05);
      for (let o = -tile; o < tile * 2; o += tile * 0.22) {
        c.beginPath();
        c.moveTo(at.x - tile / 2 + o, at.y - tile / 2);
        c.lineTo(at.x - tile / 2 + o - tile, at.y + tile / 2);
        c.stroke();
      }
      c.restore();
    }

    c.strokeStyle = alpha(ok ? PALETTE.energyCyan : PALETTE.threatRed, 0.9);
    c.lineWidth = Math.max(1.5, tile * 0.05);
    roundedRect(c, at.x - tile / 2 + 1, at.y - tile / 2 + 1, tile - 2, tile - 2, tile * 0.1);
    c.stroke();

    // 완전 봉쇄 — 적이 때릴 벽에 조준 레티클
    if (preview.sealsPath && preview.breachTile >= 0) {
      const b = tileCenterToScreen(l, preview.breachTile);
      const pulse = this.reduced ? 0.8 : 0.5 + Math.sin(this.clock * 6) * 0.5;
      ring(c, b.x, b.y, tile * 0.44, Math.max(2, tile * 0.06), PALETTE.threatRed, 0.5 + pulse * 0.4);
      c.strokeStyle = alpha(PALETTE.threatRed, 0.9);
      c.lineWidth = Math.max(1.5, tile * 0.045);
      for (const [ax, ay] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        c.beginPath();
        c.moveTo(b.x + ax * tile * 0.44, b.y + ay * tile * 0.24);
        c.lineTo(b.x + ax * tile * 0.44, b.y + ay * tile * 0.44);
        c.lineTo(b.x + ax * tile * 0.24, b.y + ay * tile * 0.44);
        c.stroke();
      }
    }

    // 경로 지연 — 미로가 실제로 얼마나 버는지 숫자로
    if (ok && Math.abs(preview.pathDeltaSeconds) >= 0.05) {
      const gain = preview.pathDeltaSeconds > 0;
      const size = Math.max(11, tile * 0.3);
      c.font = `700 ${size}px "IBM Plex Sans KR", system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const label = `${gain ? '+' : ''}${preview.pathDeltaSeconds.toFixed(1)}초`;
      const y = at.y - tile * 0.72;
      c.lineWidth = 3;
      c.strokeStyle = alpha(PALETTE.abyss, 0.9);
      c.strokeText(label, at.x, y);
      c.fillStyle = gain ? PALETTE.energyCyan : PALETTE.alertAmber;
      c.fillText(label, at.x, y);
    }
  }

  /* ─────────────────────────── 이벤트 → 연출 ─────────────────────────── */

  private consume(event: SimEvent, view: SimView): void {
    const l = this.layout;
    const tile = l.tile;
    if (tile <= 0) return;

    switch (event.kind) {
      case 'built': {
        const at = tileCenterToScreen(l, event.tile);
        this.fx.pushRing(at.x, at.y, tile * 0.2, tile * 0.85, 0.4, PALETTE.energyCyan, Math.max(2, tile * 0.07));
        this.fx.bubbles(at.x, at.y, tile, 4);
        break;
      }
      case 'destroyed': {
        const at = tileCenterToScreen(l, event.tile);
        this.fx.burst(at.x, at.y, tile * 0.6, PALETTE.hullMid, 14);
        this.fx.addShake(0.28);
        break;
      }
      case 'enemyKilled': {
        const at = worldToScreen(l, event.at);
        this.fx.burst(at.x, at.y, tile * 0.5, ROLE_TINT[event.role], event.role === 'leviathan' ? 22 : 10);
        if (event.biomass > 0) this.fx.float(at.x, at.y, `+${event.biomass}`, PALETTE.arcaneViolet, 0.9);
        if (event.role === 'leviathan') this.fx.addShake(0.6);
        break;
      }
      case 'coreHit': {
        const center = coreCenter(l, view.terrain);
        this.fx.pushRing(center.x, center.y, tile * 0.4, tile * 1.6, 0.45, PALETTE.threatRed, Math.max(2, tile * 0.09));
        this.fx.sparks(center.x, center.y - tile * 0.3, tile * 0.5, 0, -1, PALETTE.threatRed, 8);
        this.fx.float(center.x, center.y - tile * 0.6, `-${event.damage}`, PALETTE.threatRed, 1);
        this.fx.addShake(0.5);
        break;
      }
      case 'gain': {
        const at = worldToScreen(l, event.at);
        const tint = event.resource === 'scrap' ? PALETTE.oreGold : PALETTE.arcaneViolet;
        this.fx.float(at.x, at.y, `+${Math.round(event.amount)}`, tint, 0.85);
        break;
      }
      case 'salvageExhausted': {
        const at = worldToScreen(l, event.at);
        this.fx.pushRing(at.x, at.y, tile * 0.2, tile * 1.4, 0.6, PALETTE.alertAmber, Math.max(2, tile * 0.06));
        this.fx.float(at.x, at.y, '리저브 고갈', PALETTE.alertAmber, 1.4);
        break;
      }
      case 'salvageRefilled': {
        const center = coreCenter(l, view.terrain);
        this.fx.pushRing(center.x, center.y, tile * 0.3, tile * 2, 0.7, PALETTE.oreGold, Math.max(2, tile * 0.05));
        break;
      }
      case 'abilityCast': {
        const at = worldToScreen(l, event.at);
        if (event.ability === 'sonarPulse') {
          this.fx.pushRing(at.x, at.y, tile * 0.2, tile * 2.6, 0.5, PALETTE.energyCyan, Math.max(2, tile * 0.1));
          if (event.perfect) {
            this.fx.pushRing(at.x, at.y, tile * 0.2, tile * 3.2, 0.7, PALETTE.arcaneViolet, Math.max(2, tile * 0.06));
            this.fx.float(at.x, at.y, '정밀', PALETTE.arcaneViolet, 0.9);
          }
        } else {
          this.fx.pushRing(at.x, at.y, tile * 0.15, tile * 1.1, 0.45, PALETTE.glassWarm, Math.max(2, tile * 0.08));
          this.fx.sparks(at.x, at.y, tile * 0.4, 0, -1, PALETTE.glassWarm, 6);
          if (event.perfect) this.fx.float(at.x, at.y, '정밀 용접', PALETTE.glassWarm, 0.9);
        }
        break;
      }
      case 'subDowned': {
        const at = worldToScreen(l, event.at);
        this.fx.burst(at.x, at.y, tile * 0.7, PALETTE.threatRed, 16);
        this.fx.addShake(0.45);
        break;
      }
      case 'waveStart': {
        for (const warn of view.wave.incoming) {
          if (warn.strength <= 0) continue;
          const at = tileCenterToScreen(l, warn.vent);
          this.fx.pushRing(at.x, at.y, tile * 0.2, tile * 1.5, 0.6, PALETTE.threatRed, Math.max(2, tile * 0.08));
        }
        this.fx.addShake(0.2);
        break;
      }
      case 'waveClear': {
        const center = coreCenter(l, view.terrain);
        this.fx.pushRing(center.x, center.y, tile * 0.4, tile * 3, 0.9, PALETTE.energyCyan, Math.max(2, tile * 0.07));
        this.fx.float(center.x, center.y - tile * 0.8, `+${event.rewardScrap} 고철`, PALETTE.oreGold, 1.5);
        if (event.flawless) this.fx.float(center.x, center.y - tile * 1.3, '무손실', PALETTE.arcaneViolet, 1.6);
        break;
      }
      case 'discovered': {
        const at = worldToScreen(l, event.at);
        this.reveal.fire(at.x, at.y, DISCOVERY_LABELS[event.id].name, PALETTE.arcaneViolet, this.fx);
        break;
      }
      case 'unlocked': {
        const at = worldToScreen(l, event.at);
        this.reveal.fire(at.x, at.y, `${BUILDING_LABELS[event.building].name} 해금`, PALETTE.energyCyan, this.fx);
        break;
      }
      case 'automationUnlocked': {
        const center = coreCenter(l, view.terrain);
        this.reveal.fire(center.x, center.y - tile, '자동화 해금', PALETTE.energyCyan, this.fx);
        break;
      }
      case 'flooded': {
        for (const t of event.tiles) {
          if (t < 0 || t >= GRID_W * GRID_H) continue;
          const at = tileCenterToScreen(l, t);
          this.fx.pushRing(at.x, at.y, tile * 0.1, tile * 0.8, 0.5, PALETTE.arcaneViolet, Math.max(2, tile * 0.06));
        }
        this.fx.addShake(0.35);
        break;
      }
      case 'chapterEntered': {
        // 팔레트·레이아웃이 함께 바뀐다 — 두 오프스크린을 모두 다시 굽는다
        this.bgKey = '';
        this.terrainKey = '';
        const center = coreCenter(l, view.terrain);
        this.reveal.fire(center.x, center.y - tile, `${event.chapter}장`, PALETTE.arcaneViolet, this.fx);
        break;
      }
      case 'collapsed': {
        const center = coreCenter(l, view.terrain);
        this.fx.burst(center.x, center.y, tile * 1.2, PALETTE.threatRed, 24);
        this.fx.addShake(1);
        break;
      }
      case 'victory': {
        const center = coreCenter(l, view.terrain);
        for (let i = 0; i < 3; i++) {
          this.fx.pushRing(center.x, center.y, tile * (0.3 + i), tile * (3 + i), 1.2, PALETTE.oreGold, Math.max(2, tile * 0.06));
        }
        break;
      }
    }
  }
}

/** 고스트용 임시 뷰. sim 을 건드리지 않고 형태만 빌린다 */
function ghostView(tile: TileIndex, building: BuildingId): BuildingView {
  return {
    tile,
    id: building,
    level: 0,
    hp: 1,
    maxHp: 1,
    charge: 0.35,
    aim: -Math.PI / 2,
    policy: 'nearest',
    onThermal: false,
  };
}

export const createRenderer: CreateRenderer = (canvas: HTMLCanvasElement): OutpostRenderer => new Renderer(canvas);
