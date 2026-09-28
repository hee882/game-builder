/**
 * 형태 어휘 — 건물 6종(3티어) · 적 5종(정예 변형) · 잠수정 · 드론.
 *
 * 판독 규칙(docs/outpost-art-review.md §6)
 *   - 티어는 «색»이 아니라 «부품 수와 높이»로 읽는다. 발자국은 1타일 고정.
 *   - 적은 색을 지운 실루엣만으로 구분되어야 한다.
 *   - 정예는 실루엣 유지 + 셰브런 장갑판 3장 + 바이올렛 림.
 */

import type { BuildingId, BuildingView, DroneView, EnemyView, SubView } from './contract.ts';
import { HULL, PALETTE, alpha, glow, lamp, mix, polygon, roundedRect, shadedRect } from './render-palette.ts';

/* ─────────────────────────── 건물 ─────────────────────────── */

export function drawBuilding(
  c: CanvasRenderingContext2D,
  b: BuildingView,
  cx: number,
  cy: number,
  tile: number,
  time: number,
  reduced: boolean,
): void {
  const hurt = b.hp / Math.max(1, b.maxHp);

  // 접지 그림자 — 물속에 놓인 물체로 만든다
  c.fillStyle = alpha(PALETTE.abyss, 0.42);
  c.beginPath();
  c.ellipse(cx, cy + tile * 0.36, tile * 0.4, tile * 0.13, 0, 0, Math.PI * 2);
  c.fill();

  if (b.onThermal) {
    glow(c, cx, cy + tile * 0.28, tile * 0.22, PALETTE.oreGold, 0.5 + (reduced ? 0 : Math.sin(time * 2.2) * 0.12));
  }

  c.save();
  c.translate(cx, cy);
  switch (b.id) {
    case 'bulkhead':
      drawBulkhead(c, tile, b.level, hurt);
      break;
    case 'collector':
      drawCollector(c, tile, b.level, time, reduced);
      break;
    case 'harpoon':
      drawHarpoon(c, tile, b.level, b.aim, b.charge);
      break;
    case 'mortar':
      drawMortar(c, tile, b.level, b.aim, b.charge);
      break;
    case 'droneBay':
      drawDroneBay(c, tile, b.level, time, reduced);
      break;
    case 'resonator':
      drawResonator(c, tile, b.level, b.charge, time, reduced);
      break;
  }
  c.restore();

  if (hurt < 0.995) drawHealthBar(c, cx, cy - tile * 0.46, tile * 0.62, hurt);
}

function drawHealthBar(c: CanvasRenderingContext2D, cx: number, y: number, w: number, ratio: number): void {
  const h = Math.max(2, w * 0.09);
  c.fillStyle = alpha(PALETTE.abyss, 0.75);
  roundedRect(c, cx - w / 2, y, w, h, h / 2);
  c.fill();
  c.fillStyle = ratio > 0.5 ? PALETTE.energyCyan : ratio > 0.25 ? PALETTE.alertAmber : PALETTE.threatRed;
  roundedRect(c, cx - w / 2, y, Math.max(h, w * ratio), h, h / 2);
  c.fill();
}

/** 격벽 — 장갑판. L0 1판 / L1 2판+가새 / L2 버팀벽+앵커볼트 */
function drawBulkhead(c: CanvasRenderingContext2D, tile: number, level: number, hurt: number): void {
  const w = tile * 0.86;
  const h = tile * (0.5 + level * 0.09);
  shadedRect(c, -w / 2, -h / 2, w, h, tile * 0.06, HULL, PALETTE.energyCyan);

  // 세로 리브
  c.strokeStyle = alpha(PALETTE.hullLo, 0.75);
  c.lineWidth = Math.max(1, tile * 0.035);
  for (let i = -1; i <= 1; i++) {
    c.beginPath();
    c.moveTo(i * w * 0.26, -h / 2 + tile * 0.04);
    c.lineTo(i * w * 0.26, h / 2 - tile * 0.04);
    c.stroke();
  }

  if (level >= 1) {
    // 두 번째 판 + 대각 가새
    shadedRect(c, -w / 2, -h / 2 - tile * 0.15, w, tile * 0.16, tile * 0.04, HULL, PALETTE.energyCyan);
    c.strokeStyle = alpha(PALETTE.hullHi, 0.55);
    c.lineWidth = Math.max(1, tile * 0.04);
    c.beginPath();
    c.moveTo(-w * 0.4, h / 2);
    c.lineTo(w * 0.4, -h / 2);
    c.moveTo(w * 0.4, h / 2);
    c.lineTo(-w * 0.4, -h / 2);
    c.stroke();
  }
  if (level >= 2) {
    // 버팀벽 + 앵커 볼트
    for (const s of [-1, 1]) {
      polygon(c, [s * w * 0.5, -h / 2, s * w * 0.66, h * 0.1, s * w * 0.5, h / 2]);
      c.fillStyle = PALETTE.hullLo;
      c.fill();
    }
    c.fillStyle = alpha(PALETTE.oreGold, 0.8);
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        c.beginPath();
        c.arc(s * w * 0.36, t * h * 0.3, tile * 0.035, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  if (hurt < 0.6) {
    // 균열 — 체력이 형태로도 읽힌다
    c.strokeStyle = alpha(PALETTE.abyss, 0.8);
    c.lineWidth = Math.max(1, tile * 0.03);
    c.beginPath();
    c.moveTo(-w * 0.2, -h / 2);
    c.lineTo(-w * 0.05, 0);
    c.lineTo(-w * 0.24, h / 2);
    c.stroke();
  }
}

/** 수집기 — 호퍼 + 흡입 팔. L0 팔1 / L1 팔2+호퍼 / L2 회전 드럼 */
function drawCollector(c: CanvasRenderingContext2D, tile: number, level: number, time: number, reduced: boolean): void {
  const swing = reduced ? 0 : Math.sin(time * 1.6) * 0.22;
  const arms = level >= 1 ? 2 : 1;
  c.strokeStyle = PALETTE.hullLo;
  c.lineWidth = Math.max(2, tile * 0.075);
  c.lineCap = 'round';
  for (let i = 0; i < arms; i++) {
    const base = -0.5 + i * 1.0;
    const a = base + swing * (i === 0 ? 1 : -1);
    c.beginPath();
    c.moveTo(0, tile * 0.02);
    c.lineTo(Math.cos(a) * tile * 0.42, tile * 0.02 + Math.sin(a) * tile * 0.3 - tile * 0.16);
    c.stroke();
    // 집게
    c.fillStyle = PALETTE.hullMid;
    c.beginPath();
    c.arc(Math.cos(a) * tile * 0.42, tile * 0.02 + Math.sin(a) * tile * 0.3 - tile * 0.16, tile * 0.06, 0, Math.PI * 2);
    c.fill();
  }
  c.lineCap = 'butt';

  // 본체 호퍼(사다리꼴)
  const w = tile * 0.56;
  polygon(c, [-w / 2, tile * 0.26, -w * 0.36, -tile * 0.12, w * 0.36, -tile * 0.12, w / 2, tile * 0.26]);
  c.fillStyle = HULL.mid;
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = alpha(HULL.hi, 0.45);
  c.fillRect(-w, -tile * 0.14, w * 2, tile * 0.12);
  c.fillStyle = alpha(HULL.lo, 0.5);
  c.fillRect(-w, tile * 0.14, w * 2, tile * 0.2);
  c.restore();

  if (level >= 1) {
    shadedRect(c, -w * 0.42, -tile * 0.3, w * 0.84, tile * 0.18, tile * 0.04, HULL);
  }
  if (level >= 2) {
    // 회전 드럼
    const spin = reduced ? 0 : time * 2.4;
    c.save();
    c.translate(0, -tile * 0.34);
    c.rotate(spin);
    c.strokeStyle = alpha(PALETTE.oreGold, 0.85);
    c.lineWidth = Math.max(1.5, tile * 0.05);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      c.beginPath();
      c.moveTo(Math.cos(a) * tile * 0.05, Math.sin(a) * tile * 0.05);
      c.lineTo(Math.cos(a) * tile * 0.16, Math.sin(a) * tile * 0.16);
      c.stroke();
    }
    c.restore();
  }
  lamp(c, 0, tile * 0.06, tile * 0.055, PALETTE.oreGold, 0.7);
}

/** 작살 — 회전 포탑. 배럴 1 / 2 / 4. charge 로 배럴이 뒤로 당겨졌다 나간다 */
function drawHarpoon(c: CanvasRenderingContext2D, tile: number, level: number, aim: number, charge: number): void {
  // 받침대
  shadedRect(c, -tile * 0.3, tile * 0.04, tile * 0.6, tile * 0.3, tile * 0.06, HULL);
  c.save();
  c.rotate(aim);
  const recoil = (1 - charge) * tile * 0.1;
  const barrels = level >= 2 ? 4 : level >= 1 ? 2 : 1;
  const spread = tile * 0.075;
  for (let i = 0; i < barrels; i++) {
    const off = (i - (barrels - 1) / 2) * spread;
    c.fillStyle = mix(HULL.mid, HULL.lo, 0.3);
    roundedRect(c, -tile * 0.1 - recoil, off - tile * 0.035, tile * 0.5, tile * 0.07, tile * 0.03);
    c.fill();
    // 작살 촉
    c.fillStyle = alpha(PALETTE.energyCyan, 0.55 + charge * 0.45);
    polygon(c, [
      tile * 0.4 - recoil, off - tile * 0.035,
      tile * 0.52 - recoil, off,
      tile * 0.4 - recoil, off + tile * 0.035,
    ]);
    c.fill();
  }
  // 짐벌 링
  c.strokeStyle = alpha(HULL.hi, 0.6);
  c.lineWidth = Math.max(1, tile * 0.035);
  c.beginPath();
  c.arc(0, 0, tile * 0.16, 0, Math.PI * 2);
  c.stroke();
  c.restore();

  c.fillStyle = HULL.mid;
  c.beginPath();
  c.arc(0, 0, tile * 0.13, 0, Math.PI * 2);
  c.fill();
  if (charge > 0.75) glow(c, 0, 0, tile * 0.1, PALETTE.energyCyan, (charge - 0.75) * 3);
}

/** 박격포 — 각진 포신. charge 로 포신이 서고 총구가 달아오른다 */
function drawMortar(c: CanvasRenderingContext2D, tile: number, level: number, aim: number, charge: number): void {
  shadedRect(c, -tile * 0.34, tile * 0.06, tile * 0.68, tile * 0.28, tile * 0.05, HULL);
  // 삼각 지지대
  polygon(c, [-tile * 0.3, tile * 0.1, 0, -tile * 0.1, tile * 0.3, tile * 0.1]);
  c.fillStyle = HULL.lo;
  c.fill();

  const tubes = level >= 2 ? 2 : 1;
  const elevate = -1.05 + charge * 0.28;
  c.save();
  c.rotate(Math.cos(aim) >= 0 ? elevate : -elevate + Math.PI);
  const len = tile * (0.34 + level * 0.07);
  for (let i = 0; i < tubes; i++) {
    const off = (i - (tubes - 1) / 2) * tile * 0.11;
    c.fillStyle = mix(HULL.mid, HULL.lo, 0.45);
    roundedRect(c, off - tile * 0.06, -len, tile * 0.12, len + tile * 0.08, tile * 0.04);
    c.fill();
    c.fillStyle = alpha(PALETTE.hullHi, 0.35);
    c.fillRect(off - tile * 0.06, -len, tile * 0.035, len);
    if (charge > 0.6) {
      lamp(c, off, -len + tile * 0.03, tile * 0.05, PALETTE.alertAmber, (charge - 0.6) * 2.5);
    }
  }
  if (level >= 1) {
    // 폭풍 차폐판
    c.fillStyle = alpha(HULL.lo, 0.9);
    roundedRect(c, -tile * 0.2, -tile * 0.14, tile * 0.4, tile * 0.09, tile * 0.03);
    c.fill();
  }
  c.restore();

  if (level >= 2) {
    // 자동 장전 드럼
    c.fillStyle = HULL.lo;
    c.beginPath();
    c.arc(tile * 0.24, tile * 0.02, tile * 0.11, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = alpha(PALETTE.alertAmber, 0.7);
    c.lineWidth = Math.max(1, tile * 0.03);
    c.beginPath();
    c.arc(tile * 0.24, tile * 0.02, tile * 0.06, 0, Math.PI * 2);
    c.stroke();
  }
}

/** 드론 정비고 — 도어 1/2/3 + 착륙등 */
function drawDroneBay(c: CanvasRenderingContext2D, tile: number, level: number, time: number, reduced: boolean): void {
  const w = tile * 0.84;
  shadedRect(c, -w / 2, -tile * 0.22, w, tile * 0.56, tile * 0.07, HULL);
  const doors = 1 + level;
  const dw = (w * 0.82) / doors;
  for (let i = 0; i < doors; i++) {
    const x = -w * 0.41 + i * dw + dw * 0.08;
    c.fillStyle = alpha(PALETTE.abyss, 0.85);
    roundedRect(c, x, -tile * 0.12, dw * 0.84, tile * 0.3, tile * 0.03);
    c.fill();
    // 격납고 안쪽 빛
    const blink = reduced ? 0.6 : 0.45 + Math.sin(time * 2.6 + i * 1.7) * 0.25;
    c.fillStyle = alpha(PALETTE.energyCyan, 0.18 * blink);
    c.fillRect(x, -tile * 0.12, dw * 0.84, tile * 0.06);
  }
  // 착륙등
  for (let i = 0; i < doors; i++) {
    const x = -w * 0.41 + i * dw + dw * 0.5;
    const phase = reduced ? 1 : 0.5 + Math.sin(time * 3.4 + i) * 0.5;
    lamp(c, x, tile * 0.26, tile * 0.035, PALETTE.alertAmber, 0.4 + phase * 0.6);
  }
  // 관제 안테나
  c.strokeStyle = alpha(HULL.hi, 0.7);
  c.lineWidth = Math.max(1, tile * 0.03);
  c.beginPath();
  c.moveTo(w * 0.34, -tile * 0.22);
  c.lineTo(w * 0.34, -tile * 0.4);
  c.stroke();
  lamp(c, w * 0.34, -tile * 0.42, tile * 0.03, PALETTE.energyCyan, 0.8);
}

/** 공명기 — 부양 프리즘. 1 / 3 / 3+헤일로. 방어 무시라 색이 유일하게 보라 */
function drawResonator(
  c: CanvasRenderingContext2D,
  tile: number,
  level: number,
  charge: number,
  time: number,
  reduced: boolean,
): void {
  // 삼각 받침
  polygon(c, [-tile * 0.3, tile * 0.32, 0, tile * 0.04, tile * 0.3, tile * 0.32]);
  c.fillStyle = HULL.lo;
  c.fill();
  c.strokeStyle = alpha(HULL.hi, 0.4);
  c.lineWidth = 1;
  c.stroke();

  const prisms = level >= 1 ? 3 : 1;
  const spin = reduced ? 0 : time * (0.9 + charge * 2.2);
  const bob = reduced ? 0 : Math.sin(time * 1.8) * tile * 0.02;
  for (let i = 0; i < prisms; i++) {
    const a = spin + (i / prisms) * Math.PI * 2;
    const r = prisms === 1 ? 0 : tile * 0.15;
    const px = Math.cos(a) * r;
    const py = -tile * 0.16 + Math.sin(a) * r * 0.42 + bob;
    const s = tile * (0.1 + charge * 0.03);
    c.save();
    c.translate(px, py);
    c.rotate(a * 0.6);
    polygon(c, [0, -s, s * 0.7, 0, 0, s, -s * 0.7, 0]);
    c.fillStyle = alpha(PALETTE.arcaneViolet, 0.85);
    c.fill();
    c.strokeStyle = alpha(PALETTE.fleshPale, 0.8);
    c.lineWidth = 1;
    c.stroke();
    c.restore();
    glow(c, px, py, s * 0.7, PALETTE.arcaneViolet, 0.35 + charge * 0.5);
  }

  if (level >= 2) {
    const halo = tile * (0.26 + Math.sin(reduced ? 0 : time * 2) * 0.015);
    c.strokeStyle = alpha(PALETTE.arcaneViolet, 0.4 + charge * 0.4);
    c.lineWidth = Math.max(1.5, tile * 0.035);
    c.beginPath();
    c.ellipse(0, -tile * 0.16, halo, halo * 0.4, 0, 0, Math.PI * 2);
    c.stroke();
  }
}

/* ─────────────────────────── 적 ─────────────────────────── */

export function drawEnemy(
  c: CanvasRenderingContext2D,
  e: EnemyView,
  cx: number,
  cy: number,
  tile: number,
  time: number,
  reduced: boolean,
): void {
  const elite = e.variant === 'elite';
  const wobble = reduced ? 0 : Math.sin(time * 2.2 + e.id * 1.3);

  // 부유체만 바닥 그림자 — 공중임이 즉시 읽힌다
  if (e.role === 'glider') {
    c.fillStyle = alpha(PALETTE.abyss, 0.4);
    c.beginPath();
    c.ellipse(cx + tile * 0.16, cy + tile * 0.42, tile * 0.3, tile * 0.1, 0, 0, Math.PI * 2);
    c.fill();
  }

  c.save();
  c.translate(cx, cy);
  switch (e.role) {
    case 'drifter':
      drawDrifter(c, tile, wobble, elite);
      break;
    case 'swarm':
      drawSwarm(c, tile, wobble, e.facing, elite);
      break;
    case 'breacher':
      drawBreacher(c, tile, time, reduced, elite);
      break;
    case 'glider':
      drawGlider(c, tile, wobble, elite);
      break;
    case 'leviathan':
      drawLeviathan(c, tile, time, reduced);
      break;
  }
  c.restore();

  if (e.slowTicks > 0) {
    c.strokeStyle = alpha(PALETTE.energyCyan, 0.55);
    c.lineWidth = Math.max(1, tile * 0.04);
    c.beginPath();
    c.arc(cx, cy, tile * 0.36, 0, Math.PI * 2);
    c.stroke();
  }
  if (e.breaching) {
    // 구조물을 때리는 중 — 붉은 충격 표시
    const pulse = reduced ? 0.6 : 0.4 + Math.abs(Math.sin(time * 9)) * 0.6;
    glow(c, cx, cy + tile * 0.2, tile * 0.14, PALETTE.threatRed, pulse);
  }
  const ratio = e.hp / Math.max(1, e.maxHp);
  if (ratio < 0.995) {
    const w = tile * (e.role === 'leviathan' ? 1.6 : 0.5);
    drawHealthBar(c, cx, cy - tile * (e.role === 'leviathan' ? 0.95 : 0.44), w, ratio);
  }
}

/** 정예 표식 — 셰브런 장갑판 3장 + 바이올렛 림. 색만 바꾸지 않는다 */
function eliteArmor(c: CanvasRenderingContext2D, tile: number, spanY: number): void {
  c.strokeStyle = alpha(PALETTE.arcaneViolet, 0.9);
  c.lineWidth = Math.max(1.2, tile * 0.035);
  for (let i = 0; i < 3; i++) {
    const y = spanY * (-0.3 + i * 0.3);
    c.beginPath();
    c.moveTo(-tile * 0.2, y);
    c.lineTo(0, y + tile * 0.09);
    c.lineTo(tile * 0.2, y);
    c.stroke();
  }
}

/** 표류체 — 종 모양 몸통 + 촉수 4. 느린 맥동 */
function drawDrifter(c: CanvasRenderingContext2D, tile: number, wobble: number, elite: boolean): void {
  const r = tile * (0.3 + wobble * 0.02);
  c.beginPath();
  c.moveTo(-r, tile * 0.02);
  c.quadraticCurveTo(-r * 1.05, -r * 1.35, 0, -r * 1.35);
  c.quadraticCurveTo(r * 1.05, -r * 1.35, r, tile * 0.02);
  c.quadraticCurveTo(0, r * 0.34, -r, tile * 0.02);
  c.closePath();
  const bell = c.createLinearGradient(0, -r * 1.3, 0, r * 0.3);
  bell.addColorStop(0, alpha(PALETTE.fleshPale, 0.9));
  bell.addColorStop(1, alpha(PALETTE.fleshDeep, 0.95));
  c.fillStyle = bell;
  c.fill();
  c.strokeStyle = alpha(PALETTE.threatRed, 0.5);
  c.lineWidth = 1;
  c.stroke();

  // 촉수
  c.strokeStyle = alpha(PALETTE.fleshDeep, 0.85);
  c.lineWidth = Math.max(1.2, tile * 0.04);
  for (let i = 0; i < 4; i++) {
    const x = (-1.5 + i) * r * 0.42;
    c.beginPath();
    c.moveTo(x, tile * 0.04);
    c.quadraticCurveTo(x + wobble * tile * 0.08, tile * 0.24, x - wobble * tile * 0.06, tile * 0.42);
    c.stroke();
  }
  glow(c, 0, -r * 0.55, r * 0.3, PALETTE.fleshPale, 0.35);
  if (elite) eliteArmor(c, tile, r * 1.1);
}

/** 군체 — 작고 뾰족한 다트. 방향을 그대로 향한다 */
function drawSwarm(c: CanvasRenderingContext2D, tile: number, wobble: number, facing: number, elite: boolean): void {
  c.rotate(facing + wobble * 0.12);
  const s = tile * 0.19;
  polygon(c, [s * 1.5, 0, -s * 0.8, -s * 0.78, -s * 0.35, 0, -s * 0.8, s * 0.78]);
  c.fillStyle = elite ? mix(PALETTE.chitin, PALETTE.arcaneViolet, 0.45) : PALETTE.chitin;
  c.fill();
  c.strokeStyle = alpha(PALETTE.threatRed, 0.75);
  c.lineWidth = 1;
  c.stroke();
  lamp(c, s * 0.6, 0, s * 0.16, PALETTE.threatRed, 0.6);
}

/** 굴착체 — 낮고 넓은 장갑 쐐기 + 드릴 아가리 */
function drawBreacher(c: CanvasRenderingContext2D, tile: number, time: number, reduced: boolean, elite: boolean): void {
  const w = tile * 0.46;
  const h = tile * 0.3;
  polygon(c, [-w, -h * 0.4, -w * 0.55, -h, w * 0.5, -h * 0.86, w, 0, w * 0.5, h * 0.9, -w * 0.6, h]);
  c.fillStyle = elite ? mix(PALETTE.chitin, PALETTE.arcaneViolet, 0.35) : mix(PALETTE.chitin, PALETTE.rockLo, 0.35);
  c.fill();
  c.strokeStyle = alpha(PALETTE.abyss, 0.8);
  c.lineWidth = Math.max(1, tile * 0.03);
  c.stroke();

  // 등딱지 분절
  c.strokeStyle = alpha(PALETTE.hullHi, 0.22);
  for (let i = -1; i <= 1; i++) {
    c.beginPath();
    c.moveTo(i * w * 0.32, -h * 0.85);
    c.lineTo(i * w * 0.32 - w * 0.12, h * 0.9);
    c.stroke();
  }

  // 드릴 아가리 — 회전
  const spin = reduced ? 0 : time * 6;
  c.save();
  c.translate(w * 0.82, 0);
  c.rotate(spin);
  c.fillStyle = PALETTE.hullLo;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    polygon(c, [0, 0, Math.cos(a) * tile * 0.13, Math.sin(a) * tile * 0.13, Math.cos(a + 0.6) * tile * 0.1, Math.sin(a + 0.6) * tile * 0.1]);
    c.fill();
  }
  c.restore();
  glow(c, w * 0.82, 0, tile * 0.07, PALETTE.alertAmber, 0.4);
  if (elite) eliteArmor(c, tile, h * 1.1);
}

/** 부유체 — 만타 날개. 비행 유일 */
function drawGlider(c: CanvasRenderingContext2D, tile: number, wobble: number, elite: boolean): void {
  const w = tile * 0.44;
  const flap = wobble * tile * 0.08;
  c.beginPath();
  c.moveTo(0, -tile * 0.2);
  c.quadraticCurveTo(-w * 1.5, -tile * 0.06 + flap, -w * 1.2, tile * 0.16 + flap);
  c.quadraticCurveTo(-w * 0.5, tile * 0.06, 0, tile * 0.22);
  c.quadraticCurveTo(w * 0.5, tile * 0.06, w * 1.2, tile * 0.16 - flap);
  c.quadraticCurveTo(w * 1.5, -tile * 0.06 - flap, 0, -tile * 0.2);
  c.closePath();
  const wing = c.createLinearGradient(0, -tile * 0.2, 0, tile * 0.22);
  wing.addColorStop(0, elite ? PALETTE.arcaneViolet : '#4a6b86');
  wing.addColorStop(1, PALETTE.abyss);
  c.fillStyle = wing;
  c.fill();
  c.strokeStyle = alpha(PALETTE.energyCyan, 0.32);
  c.lineWidth = 1;
  c.stroke();

  // 꼬리
  c.strokeStyle = alpha(PALETTE.abyss, 0.85);
  c.lineWidth = Math.max(1, tile * 0.035);
  c.beginPath();
  c.moveTo(0, tile * 0.2);
  c.lineTo(-flap * 0.6, tile * 0.46);
  c.stroke();
  lamp(c, 0, -tile * 0.06, tile * 0.05, PALETTE.threatRed, 0.55);
  if (elite) eliteArmor(c, tile, tile * 0.18);
}

/** 리바이어던 — 다분절 뱀형. 세로 공간을 점유한다 */
function drawLeviathan(c: CanvasRenderingContext2D, tile: number, time: number, reduced: boolean): void {
  const segments = 7;
  const t = reduced ? 0 : time * 1.6;
  c.strokeStyle = alpha(PALETTE.abyss, 0.6);
  for (let i = segments - 1; i >= 0; i--) {
    const p = i / (segments - 1);
    const y = -tile * 0.5 + p * tile * 2.1;
    const x = Math.sin(t + p * 3.1) * tile * 0.34 * p;
    const r = tile * (0.42 - p * 0.24);
    c.beginPath();
    c.ellipse(x, y, r, r * 0.82, 0, 0, Math.PI * 2);
    c.fillStyle = mix('#3b2340', PALETTE.abyss, p * 0.55);
    c.fill();
    c.lineWidth = 1;
    c.stroke();
    if (i % 2 === 0) glow(c, x, y, r * 0.4, PALETTE.arcaneViolet, 0.25);
  }
  // 머리
  const hx = Math.sin(t) * 0;
  polygon(c, [hx - tile * 0.44, -tile * 0.42, hx, -tile * 0.86, hx + tile * 0.44, -tile * 0.42, hx, -tile * 0.24]);
  c.fillStyle = '#4a2b4f';
  c.fill();
  c.strokeStyle = alpha(PALETTE.threatRed, 0.7);
  c.lineWidth = Math.max(1.5, tile * 0.04);
  c.stroke();
  lamp(c, hx - tile * 0.14, -tile * 0.5, tile * 0.06, PALETTE.threatRed, 1);
  lamp(c, hx + tile * 0.14, -tile * 0.5, tile * 0.06, PALETTE.threatRed, 1);
  // 턱
  c.strokeStyle = alpha(PALETTE.hullHi, 0.7);
  c.lineWidth = Math.max(1, tile * 0.03);
  for (let i = -2; i <= 2; i++) {
    c.beginPath();
    c.moveTo(hx + i * tile * 0.11, -tile * 0.3);
    c.lineTo(hx + i * tile * 0.11, -tile * 0.18);
    c.stroke();
  }
}

/* ─────────────────────────── 잠수정 · 드론 ─────────────────────────── */

export function drawSub(
  c: CanvasRenderingContext2D,
  s: SubView,
  cx: number,
  cy: number,
  tile: number,
  time: number,
  reduced: boolean,
  moving: boolean,
  heading: number,
): void {
  const downed = s.downedTicks > 0;
  c.save();
  c.translate(cx, cy);

  // 탐조등 — 실제로 지형을 밝힌다
  if (!downed) {
    c.save();
    c.rotate(heading);
    const cone = c.createLinearGradient(0, 0, tile * 3, 0);
    cone.addColorStop(0, alpha(PALETTE.glassWarm, 0.16));
    cone.addColorStop(1, alpha(PALETTE.glassWarm, 0));
    c.fillStyle = cone;
    polygon(c, [tile * 0.1, -tile * 0.1, tile * 3, -tile * 0.85, tile * 3, tile * 0.85, tile * 0.1, tile * 0.1]);
    c.fill();
    c.restore();
  }

  c.rotate(heading);
  const a = downed ? 0.45 : 1;
  c.globalAlpha = a;

  // 추진 기포
  if (moving && !reduced) {
    for (let i = 0; i < 4; i++) {
      const p = ((time * 1.8 + i * 0.25) % 1);
      c.fillStyle = alpha(PALETTE.hullHi, 0.28 * (1 - p));
      c.beginPath();
      c.arc(-tile * (0.34 + p * 0.5), Math.sin(i * 2.1) * tile * 0.06, tile * 0.05 * (1 - p * 0.5), 0, Math.PI * 2);
      c.fill();
    }
  }

  // 선체 캡슐
  c.beginPath();
  c.ellipse(0, 0, tile * 0.34, tile * 0.19, 0, 0, Math.PI * 2);
  const hull = c.createLinearGradient(0, -tile * 0.19, 0, tile * 0.19);
  hull.addColorStop(0, HULL.hi);
  hull.addColorStop(0.5, HULL.mid);
  hull.addColorStop(1, HULL.lo);
  c.fillStyle = hull;
  c.fill();
  c.strokeStyle = alpha(PALETTE.energyCyan, 0.4);
  c.lineWidth = 1;
  c.stroke();

  // 관측창
  c.fillStyle = alpha(PALETTE.glassWarm, downed ? 0.25 : 0.9);
  c.beginPath();
  c.arc(tile * 0.16, -tile * 0.02, tile * 0.075, 0, Math.PI * 2);
  c.fill();
  if (!downed) glow(c, tile * 0.16, -tile * 0.02, tile * 0.06, PALETTE.glassWarm, 0.6);

  // 상부 핀 + 추진기
  c.fillStyle = HULL.lo;
  polygon(c, [-tile * 0.1, -tile * 0.17, tile * 0.05, -tile * 0.3, tile * 0.1, -tile * 0.16]);
  c.fill();
  c.fillStyle = HULL.lo;
  roundedRect(c, -tile * 0.42, -tile * 0.09, tile * 0.12, tile * 0.18, tile * 0.03);
  c.fill();
  const spin = reduced || !moving ? 0 : Math.sin(time * 18) * tile * 0.07;
  c.strokeStyle = alpha(PALETTE.hullHi, 0.65);
  c.lineWidth = Math.max(1, tile * 0.03);
  c.beginPath();
  c.moveTo(-tile * 0.36, -tile * 0.1 - spin);
  c.lineTo(-tile * 0.36, tile * 0.1 + spin);
  c.stroke();

  c.globalAlpha = 1;
  c.restore();

  if (downed) {
    // 부활 대기 — 깜빡이는 조난 신호
    const blink = reduced ? 0.5 : 0.5 + Math.sin(time * 6) * 0.5;
    glow(c, cx, cy, tile * 0.2, PALETTE.threatRed, 0.4 + blink * 0.4);
  }
  if (s.harvesting) {
    // 인양 중 — 견인 광선
    const pulse = reduced ? 0.6 : 0.45 + Math.sin(time * 5) * 0.35;
    c.strokeStyle = alpha(PALETTE.oreGold, pulse);
    c.lineWidth = Math.max(1.5, tile * 0.05);
    c.setLineDash([tile * 0.1, tile * 0.08]);
    c.beginPath();
    c.arc(cx, cy, tile * 0.44, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
  }
}

export function drawDrone(
  c: CanvasRenderingContext2D,
  d: DroneView,
  cx: number,
  cy: number,
  tile: number,
  time: number,
  reduced: boolean,
): void {
  const tint = d.role === 'harvest' ? PALETTE.oreGold : PALETTE.energyCyan;
  c.save();
  c.translate(cx, cy);
  // 로터 블러
  if (!reduced) {
    c.strokeStyle = alpha(PALETTE.hullHi, 0.3);
    c.lineWidth = 1;
    const w = tile * (0.13 + Math.abs(Math.sin(time * 14)) * 0.04);
    c.beginPath();
    c.ellipse(0, -tile * 0.12, w, tile * 0.03, 0, 0, Math.PI * 2);
    c.stroke();
  }
  c.fillStyle = HULL.mid;
  roundedRect(c, -tile * 0.1, -tile * 0.07, tile * 0.2, tile * 0.14, tile * 0.05);
  c.fill();
  c.fillStyle = alpha(HULL.hi, 0.5);
  c.fillRect(-tile * 0.1, -tile * 0.07, tile * 0.2, tile * 0.04);
  lamp(c, 0, tile * 0.04, tile * 0.035, tint, 0.7);
  if (d.carrying > 0) {
    // 적재물 — 위임한 양이 눈에 보인다
    c.fillStyle = alpha(PALETTE.oreGold, 0.85);
    c.beginPath();
    c.arc(0, tile * 0.14, tile * 0.05, 0, Math.PI * 2);
    c.fill();
    glow(c, 0, tile * 0.14, tile * 0.05, PALETTE.oreGold, 0.5);
  }
  c.restore();
}

/** 코어 — 유일한 따뜻한 광원. 창이 순차 점등하고 체력이 낮으면 붉게 흔들린다 */
export function drawCore(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  tile: number,
  ratio: number,
  time: number,
  reduced: boolean,
): void {
  const span = tile;
  const warm = ratio > 0.35 ? PALETTE.coreWarm : PALETTE.threatRed;
  const flicker = reduced ? 1 : 0.92 + Math.sin(time * 1.7) * 0.08;

  glow(c, cx, cy, span * 0.9, warm, 0.5 * flicker);

  // 압력 용기 본체 — 가로 캡슐 2단
  for (const [dy, w, h] of [
    [-span * 0.34, span * 1.24, span * 0.5],
    [span * 0.3, span * 1.5, span * 0.56],
  ] as const) {
    roundedRect(c, cx - w / 2, cy + dy - h / 2, w, h, h * 0.42);
    const g = c.createLinearGradient(0, cy + dy - h / 2, 0, cy + dy + h / 2);
    g.addColorStop(0, HULL.hi);
    g.addColorStop(0.45, HULL.mid);
    g.addColorStop(1, HULL.lo);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = alpha(PALETTE.energyCyan, 0.3);
    c.lineWidth = 1;
    c.stroke();
  }

  // 늑재
  c.strokeStyle = alpha(HULL.lo, 0.6);
  c.lineWidth = Math.max(1, span * 0.035);
  for (let i = -2; i <= 2; i++) {
    c.beginPath();
    c.moveTo(cx + i * span * 0.26, cy + span * 0.04);
    c.lineTo(cx + i * span * 0.26, cy + span * 0.56);
    c.stroke();
  }

  // 창 — 순차 점등
  for (let i = 0; i < 4; i++) {
    const wx = cx + (-1.5 + i) * span * 0.31;
    const on = reduced ? 1 : 0.55 + Math.sin(time * 1.3 + i * 0.9) * 0.2;
    lamp(c, wx, cy + span * 0.3, span * 0.075, PALETTE.glassWarm, on * (ratio > 0.35 ? 1 : 0.5));
  }
  // 상부 코어 노심
  lamp(c, cx, cy - span * 0.34, span * 0.15, warm, flicker);
  // 도킹 칼라
  c.strokeStyle = alpha(HULL.hi, 0.5);
  c.lineWidth = Math.max(1.5, span * 0.05);
  c.beginPath();
  c.arc(cx, cy - span * 0.34, span * 0.24, 0, Math.PI * 2);
  c.stroke();
}
