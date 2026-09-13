/**
 * 정적 장면 굽기 — 오프스크린 2장.
 *   S0 배경  그리드 «바깥» 해구·수주·광선. 리사이즈·장 변경 시에만
 *   L0 지형  타일 108개. 리사이즈·장·침수 변경 시에만
 *
 * 애니메이션이 붙는 부분(분출구 맥동, 열수 플룸, 코어 창)은 여기서 굽지 않고
 * renderer.ts 의 라이브 레이어가 그린다.
 */

import { GRID_H, GRID_W } from './contract.ts';
import type { ChapterId } from './contract.ts';
import { TERRAIN } from './content.ts';
import type { ViewLayout } from './layout.ts';
import { tileIndex, tileToScreen } from './layout.ts';
import { PALETTE, ROCK, alpha, hash01, mix, polygon } from './render-palette.ts';

// 지형 코드는 content.ts 가 단일 출처다(순수 데이터라 렌더러가 읽어도 안전).
export const TERRAIN_WATER = TERRAIN.water;
export const TERRAIN_ROCK = TERRAIN.rock;
export const TERRAIN_CORE = TERRAIN.core;
export const TERRAIN_VENT = TERRAIN.vent;
export const TERRAIN_WRECK = TERRAIN.wreck;
export const TERRAIN_THERMAL = TERRAIN.thermal;

/** 행 깊이에 따른 물 색. 위(분출구)는 차갑고 어둡게, 아래(기지)는 온광이 스민다 */
export function waterAt(row: number, chapter: ChapterId): string {
  const t = row / (GRID_H - 1);
  const top = chapter === 2 ? '#0b2a34' : PALETTE.mid;
  const belly = chapter === 2 ? '#06171f' : PALETTE.deep;
  const floor = chapter === 2 ? '#14323a' : PALETTE.near;
  return t < 0.55 ? mix(top, belly, t / 0.55) : mix(belly, floor, (t - 0.55) / 0.45);
}

/* ─────────────────────────── S0 배경 ─────────────────────────── */

export function bakeBackground(c: CanvasRenderingContext2D, layout: ViewLayout, chapter: ChapterId): void {
  const { boxWidth: w, boxHeight: h } = layout;
  c.clearRect(0, 0, w, h);
  if (w <= 0 || h <= 0) return;

  // 세로 그라디언트: 위 수주 → 중앙 암부 → 아래 기지 온광
  const base = c.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, chapter === 2 ? '#0d2f38' : '#123a4d');
  base.addColorStop(0.42, PALETTE.abyss);
  base.addColorStop(0.82, chapter === 2 ? '#12303a' : '#0d2836');
  base.addColorStop(1, chapter === 2 ? '#251f2c' : '#1a2632');
  c.fillStyle = base;
  c.fillRect(0, 0, w, h);

  drawLightShafts(c, layout, chapter);
  drawTrenchWalls(c, layout, chapter);
  drawUpperColumn(c, layout);
  drawSeafloor(c, layout, chapter);

  // 가장자리 비네트 — 시선을 판 중앙으로 모은다
  const vignette = c.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.25, w / 2, h * 0.55, Math.max(w, h) * 0.78);
  vignette.addColorStop(0, alpha(PALETTE.abyss, 0));
  vignette.addColorStop(1, alpha(PALETTE.abyss, 0.72));
  c.fillStyle = vignette;
  c.fillRect(0, 0, w, h);
}

function drawLightShafts(c: CanvasRenderingContext2D, layout: ViewLayout, chapter: ChapterId): void {
  const { boxWidth: w, boxHeight: h } = layout;
  const count = 5;
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const seed = hash01(i, chapter, 11);
    const x = (i + 0.35 + seed * 0.35) * (w / count);
    const spread = w * (0.045 + seed * 0.05);
    const reach = h * (0.52 + seed * 0.3);
    const shaft = c.createLinearGradient(x, 0, x + spread * 0.6, reach);
    const tint = chapter === 2 ? PALETTE.arcaneViolet : '#9fd8e8';
    shaft.addColorStop(0, alpha(tint, 0.11));
    shaft.addColorStop(0.55, alpha(tint, 0.045));
    shaft.addColorStop(1, alpha(tint, 0));
    c.fillStyle = shaft;
    polygon(c, [x - spread * 0.35, 0, x + spread * 0.35, 0, x + spread * 1.5, reach, x - spread * 1.2, reach]);
    c.fill();
  }
  c.restore();
}

/** 좌우 해구 벽. 데스크톱에서는 밴드가 236px까지 벌어지므로 여기가 곧 장면이다 */
function drawTrenchWalls(c: CanvasRenderingContext2D, layout: ViewLayout, chapter: ChapterId): void {
  const { boxWidth: w, boxHeight: h, tile } = layout;
  const depth = Math.max(layout.bandX + tile * 0.9, tile * 1.4);

  for (const side of [-1, 1] as const) {
    for (let layer = 0; layer < 3; layer++) {
      const inset = depth * (0.34 + layer * 0.33);
      const shade = mix(chapter === 2 ? '#1d2a30' : PALETTE.rockLo, PALETTE.abyss, 0.55 - layer * 0.22);
      c.fillStyle = shade;
      c.beginPath();
      const edge = side < 0 ? 0 : w;
      c.moveTo(edge, -4);
      const steps = 9;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const wobble = hash01(s, layer * 7 + (side + 1), chapter);
        const reach = inset * (0.55 + wobble * 0.75);
        c.lineTo(side < 0 ? edge + reach : edge - reach, t * (h + 8) - 4);
      }
      c.lineTo(edge, h + 4);
      c.closePath();
      c.fill();

      // 층리 — 벽이 통짜 실루엣으로 보이지 않게
      c.strokeStyle = alpha(PALETTE.rockHi, 0.09 + layer * 0.03);
      c.lineWidth = 1;
      for (let s = 1; s < 7; s++) {
        const y = ((s + hash01(s, layer, side + 3) * 0.6) / 7) * h;
        const reach = inset * (0.5 + hash01(s, layer + 5, side) * 0.6);
        c.beginPath();
        c.moveTo(edge, y);
        c.lineTo(edge + (side < 0 ? reach : -reach), y + tile * 0.22);
        c.stroke();
      }
    }
  }
}

/** 위쪽 밴드 — 어둠 속으로 사라지는 수주와 먼 능선 */
function drawUpperColumn(c: CanvasRenderingContext2D, layout: ViewLayout): void {
  const { boxWidth: w } = layout;
  const bandBottom = layout.originY;
  if (bandBottom <= 2) return;

  // 먼 능선 2겹
  for (let layer = 0; layer < 2; layer++) {
    c.fillStyle = alpha(layer === 0 ? PALETTE.rockLo : PALETTE.deep, 0.5 - layer * 0.18);
    c.beginPath();
    c.moveTo(0, 0);
    const steps = 12;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const hgt = bandBottom * (0.28 + hash01(s, layer, 31) * 0.5);
      c.lineTo(t * w, hgt);
    }
    c.lineTo(w, 0);
    c.closePath();
    c.fill();
  }
}

/** 아래쪽 밴드 — 해구 바닥 퇴적층과 전초기지 기초 배관 */
function drawSeafloor(c: CanvasRenderingContext2D, layout: ViewLayout, chapter: ChapterId): void {
  const { boxWidth: w, boxHeight: h, tile } = layout;
  const top = layout.originY + layout.gridHeight;
  if (top >= h - 2) return;
  const band = h - top;

  const sediment = c.createLinearGradient(0, top - tile * 0.3, 0, h);
  sediment.addColorStop(0, alpha(PALETTE.silt, 0));
  sediment.addColorStop(0.35, alpha(PALETTE.silt, 0.85));
  sediment.addColorStop(1, chapter === 2 ? '#2a2130' : '#16222c');
  c.fillStyle = sediment;
  c.beginPath();
  c.moveTo(0, h);
  c.lineTo(0, top + band * 0.35);
  const steps = 14;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    c.lineTo(t * w, top + band * (0.18 + hash01(s, 3, 77) * 0.34));
  }
  c.lineTo(w, h);
  c.closePath();
  c.fill();

  // 기지 기초 배관 — 코어가 바닥에 «박혀» 있다는 인상
  const pipeY = top + band * 0.55;
  const cx = layout.originX + layout.gridWidth / 2;
  c.strokeStyle = alpha(PALETTE.hullLo, 0.55);
  c.lineWidth = Math.max(2, tile * 0.1);
  for (const dx of [-1.6, -0.6, 0.6, 1.6]) {
    c.beginPath();
    c.moveTo(cx + dx * tile, top - tile * 0.1);
    c.lineTo(cx + dx * tile * 1.35, pipeY + band * 0.3);
    c.stroke();
  }
  c.fillStyle = alpha(PALETTE.coreWarm, 0.1);
  c.beginPath();
  c.ellipse(cx, top, tile * 2.6, band * 0.7, 0, 0, Math.PI * 2);
  c.fill();
}

/* ─────────────────────────── L0 지형 ─────────────────────────── */

export function bakeTerrain(
  c: CanvasRenderingContext2D,
  layout: ViewLayout,
  terrain: Readonly<Int8Array>,
  flooded: Readonly<Int8Array>,
  chapter: ChapterId,
): void {
  c.clearRect(0, 0, layout.boxWidth, layout.boxHeight);
  const tile = layout.tile;
  if (tile <= 0) return;

  // 1) 물 바탕 + 아주 옅은 타일 경계
  for (let y = 0; y < GRID_H; y++) {
    const row = tileToScreen(layout, tileIndex(0, y));
    c.fillStyle = waterAt(y, chapter);
    c.fillRect(layout.originX, row.y, layout.gridWidth, tile);
  }
  c.strokeStyle = alpha(PALETTE.hullHi, 0.055);
  c.lineWidth = 1;
  c.beginPath();
  for (let x = 1; x < GRID_W; x++) {
    const px = Math.round(layout.originX + x * tile) + 0.5;
    c.moveTo(px, layout.originY);
    c.lineTo(px, layout.originY + layout.gridHeight);
  }
  for (let y = 1; y < GRID_H; y++) {
    const py = Math.round(layout.originY + y * tile) + 0.5;
    c.moveTo(layout.originX, py);
    c.lineTo(layout.originX + layout.gridWidth, py);
  }
  c.stroke();

  // 2) 물 타일 장식 — 부유 침전물. 평평한 스프레드시트로 보이지 않게
  for (let i = 0; i < GRID_W * GRID_H; i++) {
    if (terrain[i] !== TERRAIN_WATER) continue;
    const at = tileToScreen(layout, i);
    const n = hash01(i, chapter, 5);
    if (n > 0.62) {
      c.fillStyle = alpha(PALETTE.hullHi, 0.03 + n * 0.03);
      c.beginPath();
      c.ellipse(
        at.x + tile * (0.2 + hash01(i, 1, 9) * 0.6),
        at.y + tile * (0.2 + hash01(i, 2, 9) * 0.6),
        tile * 0.3,
        tile * 0.14,
        n * 3,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
  }

  // 3) 지형 오브젝트
  for (let i = 0; i < GRID_W * GRID_H; i++) {
    const kind = terrain[i];
    const at = tileToScreen(layout, i);
    if (kind === TERRAIN_ROCK) drawRock(c, at.x, at.y, tile, i, terrain);
    else if (kind === TERRAIN_WRECK) drawWreckHull(c, at.x, at.y, tile, i);
    else if (kind === TERRAIN_THERMAL) drawThermalBase(c, at.x, at.y, tile, i);
    else if (kind === TERRAIN_VENT) drawVentMouth(c, at.x, at.y, tile, i);
    else if (kind === TERRAIN_CORE) drawCorePlatform(c, at.x, at.y, tile, i, terrain);
  }

  // 4) 침수 — 그 위에 짓지 못한다는 것이 색으로 읽혀야 한다
  for (let i = 0; i < GRID_W * GRID_H; i++) {
    if (flooded[i] <= 0) continue;
    const at = tileToScreen(layout, i);
    c.fillStyle = alpha('#3d2b4a', 0.55);
    c.fillRect(at.x, at.y, tile, tile);
    c.strokeStyle = alpha(PALETTE.arcaneViolet, 0.35);
    c.lineWidth = 1;
    for (let s = 0; s < 4; s++) {
      const o = (s / 4) * tile;
      c.beginPath();
      c.moveTo(at.x, at.y + o);
      c.lineTo(at.x + o, at.y);
      c.stroke();
    }
  }
}

/** 암반은 타일을 8% 넘겨 그려서 이웃과 «지층»으로 뭉친다 — 격자 느낌 제거 */
function drawRock(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  tile: number,
  index: number,
  terrain: Readonly<Int8Array>,
): void {
  const bleed = tile * 0.08;
  const pts: number[] = [];
  const steps = 8;
  for (let s = 0; s < steps; s++) {
    const a = (s / steps) * Math.PI * 2;
    const wob = 0.42 + hash01(index, s, 17) * 0.2;
    pts.push(x + tile / 2 + Math.cos(a) * (tile * wob + bleed), y + tile / 2 + Math.sin(a) * (tile * wob + bleed));
  }
  polygon(c, pts);
  c.fillStyle = ROCK.mid;
  c.fill();

  c.save();
  c.clip();
  // 상단 하이라이트 + 하단 그림자(3단 램프)
  c.fillStyle = alpha(ROCK.hi, 0.45);
  c.fillRect(x - bleed, y - bleed, tile + bleed * 2, tile * 0.3);
  c.fillStyle = alpha(ROCK.lo, 0.6);
  c.fillRect(x - bleed, y + tile * 0.68, tile + bleed * 2, tile * 0.4 + bleed);
  // 층리 3줄
  c.strokeStyle = alpha(ROCK.lo, 0.5);
  c.lineWidth = Math.max(1, tile * 0.035);
  for (let s = 1; s <= 3; s++) {
    const ly = y + tile * (s / 4 + (hash01(index, s, 23) - 0.5) * 0.08);
    c.beginPath();
    c.moveTo(x - bleed, ly);
    c.quadraticCurveTo(x + tile / 2, ly + tile * 0.06, x + tile + bleed, ly - tile * 0.03);
    c.stroke();
  }
  // 이끼 점묘
  for (let s = 0; s < 6; s++) {
    const n = hash01(index, s, 41);
    if (n < 0.45) continue;
    c.fillStyle = alpha('#4e7a5f', 0.2 + n * 0.2);
    c.beginPath();
    c.arc(x + tile * hash01(index, s, 43), y + tile * hash01(index, s, 47), tile * 0.05, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();

  // 이웃이 암반이 아닌 쪽만 밝은 모서리 — 형태가 읽히게
  const gx = index % GRID_W;
  const gy = Math.floor(index / GRID_W);
  const solid = (ox: number, oy: number): boolean => {
    const nx = gx + ox;
    const ny = gy + oy;
    if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) return true;
    return terrain[ny * GRID_W + nx] === TERRAIN_ROCK;
  };
  c.strokeStyle = alpha(ROCK.hi, 0.4);
  c.lineWidth = Math.max(1, tile * 0.045);
  if (!solid(0, -1)) {
    c.beginPath();
    c.moveTo(x + tile * 0.12, y + tile * 0.06);
    c.quadraticCurveTo(x + tile / 2, y - tile * 0.04, x + tile * 0.88, y + tile * 0.08);
    c.stroke();
  }
}

function drawWreckHull(c: CanvasRenderingContext2D, x: number, y: number, tile: number, index: number): void {
  const cx = x + tile / 2;
  const cy = y + tile * 0.6;
  // 침전 그림자
  c.fillStyle = alpha(PALETTE.abyss, 0.45);
  c.beginPath();
  c.ellipse(cx, y + tile * 0.85, tile * 0.42, tile * 0.13, 0, 0, Math.PI * 2);
  c.fill();

  // 부러진 선체 — 기울어진 사다리꼴
  const tiltDir = hash01(index, 0, 61) > 0.5 ? 1 : -1;
  c.save();
  c.translate(cx, cy);
  c.rotate(tiltDir * 0.22);
  polygon(c, [
    -tile * 0.36, tile * 0.16,
    -tile * 0.28, -tile * 0.2,
    tile * 0.3, -tile * 0.26,
    tile * 0.38, tile * 0.14,
  ]);
  c.fillStyle = mix(PALETTE.hullLo, PALETTE.rockLo, 0.4);
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = alpha(PALETTE.hullMid, 0.35);
  c.fillRect(-tile * 0.4, -tile * 0.28, tile * 0.8, tile * 0.14);
  c.restore();

  // 늑재(갈비뼈) — 고갈 시 더 드러나는 구조
  c.strokeStyle = alpha(PALETTE.hullHi, 0.3);
  c.lineWidth = Math.max(1, tile * 0.03);
  for (let s = -2; s <= 2; s++) {
    c.beginPath();
    c.moveTo(s * tile * 0.13, -tile * 0.22);
    c.lineTo(s * tile * 0.13, tile * 0.14);
    c.stroke();
  }
  // 찢긴 단면
  c.strokeStyle = alpha(PALETTE.rockLo, 0.8);
  c.lineWidth = Math.max(1, tile * 0.05);
  c.beginPath();
  c.moveTo(tile * 0.3, -tile * 0.26);
  c.lineTo(tile * 0.22, -tile * 0.05);
  c.lineTo(tile * 0.36, tile * 0.05);
  c.stroke();
  c.restore();
}

function drawThermalBase(c: CanvasRenderingContext2D, x: number, y: number, tile: number, index: number): void {
  const cx = x + tile / 2;
  const baseY = y + tile * 0.86;
  // 광물 침전 링
  c.fillStyle = alpha('#6d5334', 0.55);
  c.beginPath();
  c.ellipse(cx, baseY, tile * 0.4, tile * 0.13, 0, 0, Math.PI * 2);
  c.fill();
  // 굴뚝 — 좌우 비대칭으로 유기적으로
  const lean = (hash01(index, 0, 71) - 0.5) * tile * 0.16;
  polygon(c, [
    cx - tile * 0.19, baseY,
    cx - tile * 0.1 + lean, y + tile * 0.34,
    cx + tile * 0.08 + lean, y + tile * 0.3,
    cx + tile * 0.2, baseY,
  ]);
  c.fillStyle = '#4a3a2e';
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = alpha('#7d6248', 0.6);
  c.fillRect(cx - tile * 0.2, y + tile * 0.3, tile * 0.16, tile * 0.6);
  c.restore();
  // 분출 입구 — 여기서 라이브 플룸이 나온다
  c.fillStyle = alpha('#2a1a12', 0.9);
  c.beginPath();
  c.ellipse(cx - tile * 0.01 + lean, y + tile * 0.32, tile * 0.09, tile * 0.035, 0, 0, Math.PI * 2);
  c.fill();
}

/** 분출구 = 상단 암벽의 갈라진 틈. 정적 부분만(발광은 라이브) */
function drawVentMouth(c: CanvasRenderingContext2D, x: number, y: number, tile: number, index: number): void {
  const cx = x + tile / 2;
  // 주변 암반 입술
  polygon(c, [
    x - tile * 0.06, y - tile * 0.06,
    x + tile * 1.06, y - tile * 0.06,
    x + tile * 1.02, y + tile * 0.62,
    x + tile * 0.66, y + tile * 0.9,
    x + tile * 0.3, y + tile * 0.78,
    x - tile * 0.02, y + tile * 0.66,
  ]);
  c.fillStyle = ROCK.lo;
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = alpha(ROCK.hi, 0.3);
  c.fillRect(x - tile * 0.1, y - tile * 0.1, tile * 1.2, tile * 0.22);
  c.restore();

  // 균열 — 들쭉날쭉한 어두운 틈
  const pts: number[] = [cx - tile * 0.05, y + tile * 0.72];
  for (let s = 1; s <= 4; s++) {
    const t = s / 5;
    pts.push(cx + (hash01(index, s, 83) - 0.5) * tile * 0.34, y + tile * (0.72 - t * 0.62));
  }
  pts.push(cx + tile * 0.06, y + tile * 0.06);
  for (let s = 4; s >= 1; s--) {
    const t = s / 5;
    pts.push(cx + (hash01(index, s, 89) - 0.5) * tile * 0.34 + tile * 0.14, y + tile * (0.72 - t * 0.62));
  }
  polygon(c, pts);
  c.fillStyle = '#050c14';
  c.fill();
}

/** 코어 2×2 토대. 바깥 경계에만 테두리를 그려 4타일이 한 덩어리로 보이게 */
function drawCorePlatform(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  tile: number,
  index: number,
  terrain: Readonly<Int8Array>,
): void {
  const gx = index % GRID_W;
  const gy = Math.floor(index / GRID_W);
  const isCore = (ox: number, oy: number): boolean => {
    const nx = gx + ox;
    const ny = gy + oy;
    if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) return false;
    return terrain[ny * GRID_W + nx] === TERRAIN_CORE;
  };

  c.fillStyle = mix(PALETTE.hullLo, PALETTE.abyss, 0.35);
  c.fillRect(x, y, tile, tile);
  c.fillStyle = alpha(PALETTE.hullMid, 0.18);
  c.fillRect(x, y, tile, tile * 0.3);

  // 바닥 격자판
  c.strokeStyle = alpha(PALETTE.hullHi, 0.1);
  c.lineWidth = 1;
  for (let s = 1; s < 3; s++) {
    c.beginPath();
    c.moveTo(x + (s / 3) * tile, y);
    c.lineTo(x + (s / 3) * tile, y + tile);
    c.moveTo(x, y + (s / 3) * tile);
    c.lineTo(x + tile, y + (s / 3) * tile);
    c.stroke();
  }

  c.strokeStyle = alpha(PALETTE.hullHi, 0.45);
  c.lineWidth = Math.max(1.5, tile * 0.05);
  c.beginPath();
  if (!isCore(0, -1)) {
    c.moveTo(x, y);
    c.lineTo(x + tile, y);
  }
  if (!isCore(0, 1)) {
    c.moveTo(x, y + tile);
    c.lineTo(x + tile, y + tile);
  }
  if (!isCore(-1, 0)) {
    c.moveTo(x, y);
    c.lineTo(x, y + tile);
  }
  if (!isCore(1, 0)) {
    c.moveTo(x + tile, y);
    c.lineTo(x + tile, y + tile);
  }
  c.stroke();
}

/** 코어 2×2 의 중심 화면 좌표. 없으면 그리드 하단 중앙 */
export function coreCenter(layout: ViewLayout, terrain: Readonly<Int8Array>): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < GRID_W * GRID_H; i++) {
    if (terrain[i] !== TERRAIN_CORE) continue;
    sx += (i % GRID_W) + 0.5;
    sy += Math.floor(i / GRID_W) + 0.5;
    n++;
  }
  if (n === 0) {
    return { x: layout.originX + layout.gridWidth / 2, y: layout.originY + layout.gridHeight * 0.9 };
  }
  return {
    x: layout.originX + (sx / n) * layout.tile,
    y: layout.originY + (sy / n) * layout.tile,
  };
}

/** 침수 상태 체크섬 — 재굽기 판정용(전체 비교 대신) */
export function floodChecksum(flooded: Readonly<Int8Array>): number {
  let h = 2166136261;
  for (let i = 0; i < flooded.length; i++) {
    h ^= flooded[i] + i;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 오프스크린 캔버스 준비. 크기가 같으면 재할당하지 않는다 */
export function ensureSurface(
  existing: HTMLCanvasElement | null,
  width: number,
  height: number,
  dpr: number,
): HTMLCanvasElement {
  const canvas = existing ?? document.createElement('canvas');
  const pw = Math.max(1, Math.round(width * dpr));
  const ph = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  return canvas;
}

/** 굽기 전 컨텍스트 초기화 — CSS 픽셀 좌표계로 맞춘다 */
export function prepareSurface(canvas: HTMLCanvasElement, dpr: number): CanvasRenderingContext2D | null {
  const c = canvas.getContext('2d');
  if (!c) return null;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return c;
}

/** 잔해 노드 위 회수 반짝임 개수(유한 리저브 가시화) */
export function salvageGlints(yieldPerSecond: number, forward: boolean): number {
  if (yieldPerSecond <= 0.01) return 0;
  const base = forward ? 3 : 2;
  if (yieldPerSecond < 1.5) return 1;
  if (yieldPerSecond < 3.5) return Math.min(base, 2);
  return base;
}
