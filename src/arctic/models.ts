/**
 * 복셀 모델: 캐릭터·동물·시설. 전부 상자 몇 개로 조립한다.
 * 위치는 발밑 중심(x, y). 치수 단위는 타일.
 */
import { box, boxAt, faceDot, project, shade, shadow, type Camera, type Ctx } from './iso.ts';

export type Facing = 'x' | 'y';
export type Item = 'raw' | 'cooked';

export const PALETTE = {
  snow: '#eef5fa',
  snowShade: '#dde9f1',
  field: '#e4eff6',
  wood: '#c79466',
  woodDark: '#a8764c',
  sea: '#6fb0d8',
  ice: '#cfe7f5',
  pine: '#2f7a5a',
  trunk: '#7a5236',
  skin: '#ffd4a8',
  raw: '#e86a6a',
  fat: '#ffe1dc',
  cooked: '#9c5a2c',
  cookedTop: '#c47a3c',
  money: '#4fbf6a',
  bear: '#f4f6f8',
  penguin: '#2b3242',
  orange: '#ff9f2e',
  steel: '#5b6573',
  fire: '#ff6a2b',
} as const;

export interface CharacterLook {
  readonly coat: string;
  readonly hat: string;
  readonly facing: Facing;
  /** 걷는 모션 위상(초). 0 이면 서 있다 */
  readonly walk: number;
  /** 공격·작업 모션 0~1 */
  readonly lunge: number;
}

/** 사람형(플레이어·직원) */
export function drawPerson(ctx: Ctx, cam: Camera, x: number, y: number, look: CharacterLook): void {
  shadow(ctx, cam, x, y, 0.42);
  const step = look.walk > 0 ? Math.sin(look.walk * 14) * 0.05 : 0;
  const bob = look.walk > 0 ? Math.abs(Math.sin(look.walk * 14)) * 0.04 : 0;
  const lx = look.facing === 'x' ? look.lunge * 0.12 : 0;
  const ly = look.facing === 'y' ? look.lunge * 0.12 : 0;
  boxAt(ctx, cam, x - 0.08 + step, y + 0.06, 0, 0.12, 0.12, 0.2, { color: '#3a4256' });
  boxAt(ctx, cam, x + 0.06 - step, y - 0.08, 0, 0.12, 0.12, 0.2, { color: '#3a4256' });
  boxAt(ctx, cam, x + lx, y + ly, 0.2 + bob, 0.36, 0.34, 0.34, { color: look.coat });
  boxAt(ctx, cam, x + lx, y + ly, 0.54 + bob, 0.32, 0.32, 0.28, { color: PALETTE.skin });
  // 털모자 — 역할별 색
  boxAt(ctx, cam, x + lx, y + ly, 0.8 + bob, 0.36, 0.36, 0.1, { color: look.hat });
  boxAt(ctx, cam, x + lx, y + ly, 0.9 + bob, 0.14, 0.14, 0.08, { color: '#ffffff' });
  drawEyes(ctx, cam, x + lx, y + ly, 0.54 + bob + 0.16, 0.16, look.facing, '#1f2433');
}

function drawEyes(ctx: Ctx, cam: Camera, cx: number, cy: number, z: number, half: number, facing: Facing, color: string): void {
  if (facing === 'x') {
    faceDot(ctx, cam, 'x', cx + half, cy - half, z, half - 0.07, 0.06, color);
    faceDot(ctx, cam, 'x', cx + half, cy - half, z, half + 0.07, 0.06, color);
  } else {
    faceDot(ctx, cam, 'y', cx - half, cy + half, z, half - 0.07, 0.06, color);
    faceDot(ctx, cam, 'y', cx - half, cy + half, z, half + 0.07, 0.06, color);
  }
}

/** 등에 진 고기 탑. 움직이면 살짝 흔들린다 */
export function drawStack(ctx: Ctx, cam: Camera, x: number, y: number, item: Item, count: number, facing: Facing, sway: number): void {
  const ox = facing === 'x' ? 0.3 : -0.02;
  const oy = facing === 'y' ? 0.3 : -0.02;
  for (let i = 0; i < count; i++) {
    const lean = sway * i * 0.012;
    drawItem(ctx, cam, x + ox + lean, y + oy - lean, 0.36 + i * 0.1, item);
  }
}

export function drawItem(ctx: Ctx, cam: Camera, x: number, y: number, z: number, item: Item): void {
  if (item === 'raw') {
    boxAt(ctx, cam, x, y, z, 0.28, 0.22, 0.09, { color: PALETTE.raw });
    boxAt(ctx, cam, x + 0.06, y - 0.02, z + 0.09, 0.08, 0.14, 0.012, { color: PALETTE.fat });
  } else {
    boxAt(ctx, cam, x, y, z, 0.28, 0.22, 0.09, { color: PALETTE.cooked });
    boxAt(ctx, cam, x, y, z + 0.09, 0.2, 0.05, 0.01, { color: '#5a2f14' });
  }
}

/** 펭귄 손님. want 가 있으면 머리 위에 주문 말풍선 */
export function drawPenguin(ctx: Ctx, cam: Camera, x: number, y: number, walk: number, want: number | null): void {
  shadow(ctx, cam, x, y, 0.36);
  const bob = walk > 0 ? Math.abs(Math.sin(walk * 12)) * 0.05 : 0;
  const tilt = walk > 0 ? Math.sin(walk * 12) * 0.03 : 0;
  boxAt(ctx, cam, x + 0.05, y + 0.1, 0, 0.12, 0.1, 0.04, { color: PALETTE.orange });
  boxAt(ctx, cam, x - 0.1, y + 0.05, 0, 0.1, 0.12, 0.04, { color: PALETTE.orange });
  boxAt(ctx, cam, x + tilt, y, 0.04 + bob, 0.36, 0.34, 0.46, { color: PALETTE.penguin });
  // 흰 배 — 앞쪽 두 면에 얇은 판
  box(ctx, cam, x - 0.13 + tilt, y + 0.17, 0.08 + bob, 0.26, 0.02, 0.32, { color: '#f7f9fb' });
  box(ctx, cam, x + 0.18 + tilt, y - 0.12, 0.08 + bob, 0.02, 0.24, 0.32, { color: '#f7f9fb' });
  drawEyes(ctx, cam, x + tilt, y, 0.42 + bob, 0.18, 'y', '#ffffff');
  boxAt(ctx, cam, x + 0.02 + tilt, y + 0.22, 0.34 + bob, 0.08, 0.08, 0.05, { color: PALETTE.orange });
  if (want !== null) drawBubble(ctx, cam, x, y, 0.95 + bob, want);
}

function drawBubble(ctx: Ctx, cam: Camera, x: number, y: number, z: number, want: number): void {
  const p = project(cam, x, y, z);
  const s = cam.tile / 64;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(30,40,60,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(p.x - 22 * s, p.y - 22 * s, 44 * s, 24 * s, 8 * s);
  ctx.moveTo(p.x - 4 * s, p.y + 2 * s);
  ctx.lineTo(p.x, p.y + 8 * s);
  ctx.lineTo(p.x + 4 * s, p.y + 2 * s);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = PALETTE.cooked;
  ctx.beginPath();
  ctx.roundRect(p.x - 17 * s, p.y - 16 * s, 14 * s, 11 * s, 3 * s);
  ctx.fill();
  ctx.fillStyle = '#2b3242';
  ctx.font = `800 ${Math.round(13 * s)}px "Jua", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`×${want}`, p.x + 1 * s, p.y - 10 * s);
}

/** 북극곰. 머리는 가는 방향 쪽 */
export function drawBear(ctx: Ctx, cam: Camera, x: number, y: number, headSign: number, walk: number, flash: number, hp: number, maxHp: number): void {
  shadow(ctx, cam, x, y, 0.75, 0.2);
  const step = walk > 0 ? Math.sin(walk * 8) * 0.05 : 0;
  const style = { color: PALETTE.bear, flash };
  for (const [lx, ly, phase] of [[-0.3, -0.18, 1], [-0.3, 0.14, -1], [0.26, -0.18, -1], [0.26, 0.14, 1]] as const) {
    boxAt(ctx, cam, x + lx + step * phase, y + ly, 0, 0.16, 0.16, 0.22, style);
  }
  boxAt(ctx, cam, x, y, 0.2, 0.86, 0.52, 0.42, style);
  const hx = x + headSign * 0.46;
  boxAt(ctx, cam, hx, y, 0.34, 0.34, 0.36, 0.32, style);
  boxAt(ctx, cam, hx - 0.06, y - 0.12, 0.66, 0.1, 0.08, 0.08, style);
  boxAt(ctx, cam, hx - 0.06, y + 0.12, 0.66, 0.1, 0.08, 0.08, style);
  boxAt(ctx, cam, hx + headSign * 0.18, y, 0.4, 0.1, 0.14, 0.1, { color: '#e9edf1', flash });
  if (headSign > 0) faceDot(ctx, cam, 'x', hx + 0.23, y - 0.07, 0.47, 0.07, 0.06, '#1f2433');
  drawEyes(ctx, cam, hx, y, 0.56, 0.18, 'y', '#1f2433');
  if (hp < maxHp) drawHpBar(ctx, cam, x, y, 1.05, hp / maxHp);
}

function drawHpBar(ctx: Ctx, cam: Camera, x: number, y: number, z: number, ratio: number): void {
  const p = project(cam, x, y, z);
  const w = cam.tile * 0.7;
  const h = Math.max(4, cam.tile * 0.08);
  ctx.fillStyle = 'rgba(20,30,50,0.55)';
  ctx.beginPath();
  ctx.roundRect(p.x - w / 2, p.y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#ff5a6a';
  ctx.beginPath();
  ctx.roundRect(p.x - w / 2, p.y, w * Math.max(0, ratio), h, h / 2);
  ctx.fill();
}

/** 화로: 왼쪽에 날고기, 오른쪽에 구운 고기가 쌓인다 */
export function drawGrill(ctx: Ctx, cam: Camera, x: number, y: number, input: number, output: number, time: number, cooking: boolean): void {
  shadow(ctx, cam, x, y, 0.9, 0.18);
  boxAt(ctx, cam, x, y, 0, 1.0, 0.8, 0.46, { color: PALETTE.steel });
  const glow = cooking ? 0.75 + Math.sin(time * 12) * 0.15 : 0.35;
  boxAt(ctx, cam, x, y, 0.46, 0.84, 0.64, 0.03, { color: shade(PALETTE.fire, glow + 0.3) });
  for (let i = 0; i < 4; i++) boxAt(ctx, cam, x - 0.3 + i * 0.2, y, 0.49, 0.03, 0.62, 0.02, { color: '#2a2f38' });
  pile(ctx, cam, x - 0.24, y - 0.1, 0.52, Math.min(input, 10), 'raw');
  pile(ctx, cam, x + 0.26, y + 0.12, 0.52, Math.min(output, 16), 'cooked');
}

function pile(ctx: Ctx, cam: Camera, x: number, y: number, z: number, count: number, item: Item): void {
  for (let i = 0; i < count; i++) drawItem(ctx, cam, x, y, z + i * 0.09, item);
}

/** 카운터와 위에 진열된 스테이크 */
export function drawCounter(ctx: Ctx, cam: Camera, x: number, y: number, stock: number, registers: number): void {
  shadow(ctx, cam, x, y, 1.1, 0.16);
  boxAt(ctx, cam, x, y, 0, 1.5, 0.7, 0.5, { color: PALETTE.woodDark });
  boxAt(ctx, cam, x, y, 0.5, 1.6, 0.8, 0.06, { color: PALETTE.wood });
  for (let r = 0; r < registers; r++) {
    boxAt(ctx, cam, x + 0.55 - r * 1.1, y - 0.15, 0.56, 0.3, 0.26, 0.2, { color: '#4b5a78' });
    boxAt(ctx, cam, x + 0.55 - r * 1.1, y - 0.15, 0.76, 0.26, 0.2, 0.06, { color: '#9fe0ff' });
  }
  const shown = Math.min(stock, 24);
  for (let i = 0; i < shown; i++) {
    const col = i % 3;
    const layer = Math.floor(i / 3);
    drawItem(ctx, cam, x - 0.45 + col * 0.3, y + 0.12, 0.56 + layer * 0.09, 'cooked');
  }
}

/** 돈다발 더미. 금액이 클수록 높게 */
export function drawMoney(ctx: Ctx, cam: Camera, x: number, y: number, bills: number): void {
  const shown = Math.min(bills, 40);
  for (let i = 0; i < shown; i++) {
    const col = i % 4;
    const layer = Math.floor(i / 4);
    const bx = x + (col % 2) * 0.3 - 0.15;
    const by = y + Math.floor(col / 2) * 0.2 - 0.1;
    boxAt(ctx, cam, bx, by, layer * 0.05, 0.28, 0.16, 0.05, { color: PALETTE.money });
    boxAt(ctx, cam, bx, by, layer * 0.05 + 0.05, 0.08, 0.16, 0.002, { color: '#2e8a45' });
  }
}

export function drawPine(ctx: Ctx, cam: Camera, x: number, y: number, size: number): void {
  shadow(ctx, cam, x, y, 0.5 * size, 0.15);
  boxAt(ctx, cam, x, y, 0, 0.16 * size, 0.16 * size, 0.3 * size, { color: PALETTE.trunk });
  const layers = [[0.8, 0.3], [0.6, 0.62], [0.38, 0.92]] as const;
  for (const [w, z] of layers) {
    boxAt(ctx, cam, x, y, z * size, w * size, w * size, 0.3 * size, { color: PALETTE.pine });
    boxAt(ctx, cam, x, y, (z + 0.3) * size, w * 0.8 * size, w * 0.8 * size, 0.05 * size, { color: '#ffffff' });
  }
}

export function drawIceRock(ctx: Ctx, cam: Camera, x: number, y: number, size: number): void {
  boxAt(ctx, cam, x, y, 0, 0.6 * size, 0.5 * size, 0.28 * size, { color: '#bcd8ea' });
  boxAt(ctx, cam, x + 0.1 * size, y - 0.05 * size, 0.28 * size, 0.34 * size, 0.3 * size, 0.18 * size, { color: '#d6ebf7' });
}

/** 업그레이드 창고 */
export function drawShed(ctx: Ctx, cam: Camera, x: number, y: number): void {
  shadow(ctx, cam, x, y, 1.1, 0.16);
  boxAt(ctx, cam, x, y, 0, 1.2, 1.0, 0.8, { color: '#8c6ad6' });
  boxAt(ctx, cam, x, y, 0.8, 1.3, 1.1, 0.12, { color: '#f4f6f8' });
  boxAt(ctx, cam, x + 0.61, y + 0.1, 0.05, 0.02, 0.4, 0.5, { color: '#4a3585' });
}

/** 아직 못 연 시설 자리의 표지판 */
export function drawSign(ctx: Ctx, cam: Camera, x: number, y: number): void {
  boxAt(ctx, cam, x, y, 0, 0.08, 0.08, 0.5, { color: PALETTE.trunk });
  boxAt(ctx, cam, x, y, 0.45, 0.5, 0.06, 0.3, { color: PALETTE.wood });
}
