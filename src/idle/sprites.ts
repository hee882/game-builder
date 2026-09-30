/**
 * 용사·동료·몬스터를 코드로 그린다(외부 이미지 없음).
 * 좌표 (x, y)는 발밑 중앙, s는 배율(1이면 용사 키 약 60px).
 * 성장이 눈에 보여야 하므로 무기·갑옷·망토·오라가 전부 수치 단계에 묶여 있다.
 */
import { WEAPONS, type ZoneSpec } from './content.ts';

type Ctx = CanvasRenderingContext2D;

export interface HeroLook {
  readonly weapon: number;
  readonly armor: number;
  readonly cape: boolean;
  readonly aura: boolean;
}

const ARMOR = ['#5b8def', '#3fb37f', '#aab4c2', '#e0b04a', '#c84ad6', '#ff5a5a'];
const SKIN = '#ffd9b3';
const HAIR = '#5a3a22';

export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number): number => {
    const va = (pa >> shift) & 255;
    const vb = (pb >> shift) & 255;
    return Math.round(va + (vb - va) * t);
  };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function eyes(ctx: Ctx, x: number, y: number, gap: number, r: number, angry = false): void {
  for (const side of [-1, 1]) {
    ellipse(ctx, x + side * gap, y, r, r * 1.15, '#ffffff');
    ellipse(ctx, x + side * gap - r * 0.35, y + r * 0.1, r * 0.55, r * 0.65, '#1b1b2a');
    if (angry) {
      ctx.strokeStyle = '#1b1b2a';
      ctx.lineWidth = r * 0.45;
      ctx.beginPath();
      ctx.moveTo(x + side * gap - r * 1.1, y - r * (side < 0 ? 1.6 : 1.1));
      ctx.lineTo(x + side * gap + r * 1.1, y - r * (side < 0 ? 1.1 : 1.6));
      ctx.stroke();
    }
  }
}

/* ───────────── 용사 ───────────── */

/** swing: 0이면 대기 자세, 0→1 동안 칼을 내려친다 */
export function drawHero(ctx: Ctx, x: number, y: number, s: number, look: HeroLook, swing: number, walk: number): void {
  const bob = Math.sin(walk * 12) * 1.5 * s;
  ellipse(ctx, x, y, 22 * s, 6 * s, 'rgba(0,0,0,0.22)');
  if (look.cape) drawCape(ctx, x, y + bob, s, look.aura, walk);
  drawLegs(ctx, x, y, s, walk);
  const armor = ARMOR[Math.min(ARMOR.length - 1, look.armor)];
  ctx.fillStyle = armor;
  ctx.beginPath();
  ctx.roundRect(x - 12 * s, y - 34 * s + bob, 24 * s, 23 * s, 7 * s);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x - 12 * s, y - 17 * s + bob, 24 * s, 3 * s);
  drawHead(ctx, x, y - 47 * s + bob, s, look.armor);
  drawWeapon(ctx, x + 9 * s, y - 26 * s + bob, s, look.weapon, swing);
}

function drawLegs(ctx: Ctx, x: number, y: number, s: number, walk: number): void {
  const step = Math.sin(walk * 12) * 3 * s;
  ctx.fillStyle = '#3b3f55';
  ctx.beginPath();
  ctx.roundRect(x - 9 * s + step, y - 13 * s, 7 * s, 13 * s, 3 * s);
  ctx.roundRect(x + 2 * s - step, y - 13 * s, 7 * s, 13 * s, 3 * s);
  ctx.fill();
}

function drawCape(ctx: Ctx, x: number, y: number, s: number, royal: boolean, walk: number): void {
  const wave = Math.sin(walk * 6) * 3 * s;
  ctx.fillStyle = royal ? '#7b3fe4' : '#c0392b';
  ctx.beginPath();
  ctx.moveTo(x - 8 * s, y - 33 * s);
  ctx.quadraticCurveTo(x - 26 * s + wave, y - 18 * s, x - 22 * s + wave, y - 4 * s);
  ctx.lineTo(x - 4 * s, y - 10 * s);
  ctx.closePath();
  ctx.fill();
}

function drawHead(ctx: Ctx, x: number, y: number, s: number, armor: number): void {
  ellipse(ctx, x, y, 15 * s, 14 * s, SKIN);
  // 머리카락 또는 투구 — 갑옷 단계 2부터 투구가 생긴다
  ctx.fillStyle = armor >= 2 ? '#c9d2dc' : HAIR;
  ctx.beginPath();
  ctx.ellipse(x, y - 3 * s, 15.5 * s, 12 * s, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  if (armor >= 2) {
    ctx.fillStyle = ARMOR[Math.min(ARMOR.length - 1, armor)];
    ctx.beginPath();
    ctx.ellipse(x - 2 * s, y - 17 * s, 4 * s, 7 * s, -0.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(x + 6 * s, y - 6 * s, 7 * s, 4 * s, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  eyes(ctx, x + 2 * s, y + 1 * s, 5.5 * s, 2.2 * s);
  ellipse(ctx, x - 7 * s, y + 6 * s, 3 * s, 1.8 * s, 'rgba(255,120,120,0.45)');
  ellipse(ctx, x + 10 * s, y + 6 * s, 3 * s, 1.8 * s, 'rgba(255,120,120,0.45)');
}

function drawWeapon(ctx: Ctx, px: number, py: number, s: number, tier: number, swing: number): void {
  const spec = WEAPONS[Math.min(WEAPONS.length - 1, tier)];
  // 대기 -0.5rad, 휘두르는 순간 뒤로 젖혔다가(-2.1) 앞으로(1.2) 내려친다
  const t = Math.min(1, Math.max(0, swing));
  const angle = swing <= 0 ? -0.5 : t < 0.25 ? -0.5 - (t / 0.25) * 1.6 : -2.1 + ((t - 0.25) / 0.75) * 3.3;
  const length = (20 + tier * 3) * s;
  const width = (3.5 + tier * 0.35) * s;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle);
  if (spec.glow) {
    for (const [alpha, extra] of [[0.12, 7], [0.2, 4], [0.3, 2]] as const) {
      ctx.strokeStyle = hexAlpha(spec.glow, alpha);
      ctx.lineWidth = width + extra * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -6 * s);
      ctx.lineTo(0, -6 * s - length);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#6b4424';
  ctx.fillRect(-1.5 * s, -2 * s, 3 * s, 8 * s);
  ctx.fillStyle = '#e8c163';
  ctx.fillRect(-5 * s, -6 * s, 10 * s, 3 * s);
  ctx.fillStyle = spec.color;
  ctx.beginPath();
  ctx.moveTo(-width / 2, -6 * s);
  ctx.lineTo(-width / 2, -6 * s - length + width);
  ctx.lineTo(0, -6 * s - length);
  ctx.lineTo(width / 2, -6 * s - length + width);
  ctx.lineTo(width / 2, -6 * s);
  ctx.closePath();
  ctx.fill();
  ellipse(ctx, 0, 0, 3.5 * s, 3.5 * s, SKIN);
  ctx.restore();
}

export function hexAlpha(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

/* ───────────── 동료 요정 ───────────── */

export function drawFairy(ctx: Ctx, x: number, y: number, s: number, time: number): void {
  const hover = Math.sin(time * 3) * 4 * s;
  const flap = Math.abs(Math.sin(time * 18));
  ellipse(ctx, x, y + hover, 14 * s, 14 * s, 'rgba(120,255,200,0.14)');
  ctx.fillStyle = 'rgba(210,255,245,0.8)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + side * 6 * s, y - 3 * s + hover, 6 * s * (0.4 + flap * 0.6), 4 * s, side * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ellipse(ctx, x, y + hover, 5 * s, 5.5 * s, '#7ff5c8');
  ellipse(ctx, x - 1.5 * s, y - 1 * s + hover, 1 * s, 1.2 * s, '#1b1b2a');
  ellipse(ctx, x + 1.5 * s, y - 1 * s + hover, 1 * s, 1.2 * s, '#1b1b2a');
}

/* ───────────── 몬스터 ───────────── */

/** flash: 피격 직후 1 → 0 으로 줄며 몸이 하얗게 번쩍인다 */
export function drawMonster(ctx: Ctx, x: number, y: number, s: number, zone: ZoneSpec, boss: boolean, flash: number, time: number): void {
  const scale = s * (boss ? 1.7 : 1);
  const body = mix(zone.body, '#ffffff', Math.min(1, flash) * 0.75);
  ellipse(ctx, x, y, 20 * scale, 5 * scale, 'rgba(0,0,0,0.22)');
  const draw = SHAPES[zone.shape];
  draw(ctx, x, y, scale, body, time);
  if (boss) drawCrown(ctx, x, y - CROWN_Y[zone.shape] * scale, scale);
}

type ShapeFn = (ctx: Ctx, x: number, y: number, s: number, body: string, time: number) => void;

const CROWN_Y: Readonly<Record<ZoneSpec['shape'], number>> = {
  slime: 30, mushroom: 44, bat: 48, rock: 50, imp: 44, wolf: 40, ghost: 50,
};

function drawCrown(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.fillStyle = '#ffd84a';
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 1.2 * s;
  ctx.beginPath();
  ctx.moveTo(x - 9 * s, y);
  ctx.lineTo(x - 9 * s, y - 8 * s);
  ctx.lineTo(x - 4.5 * s, y - 4 * s);
  ctx.lineTo(x, y - 10 * s);
  ctx.lineTo(x + 4.5 * s, y - 4 * s);
  ctx.lineTo(x + 9 * s, y - 8 * s);
  ctx.lineTo(x + 9 * s, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

const slime: ShapeFn = (ctx, x, y, s, body, time) => {
  const squash = 1 + Math.sin(time * 5) * 0.06;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(x - 20 * s * squash, y);
  ctx.bezierCurveTo(x - 20 * s * squash, y - 30 * s / squash, x + 20 * s * squash, y - 30 * s / squash, x + 20 * s * squash, y);
  ctx.closePath();
  ctx.fill();
  ellipse(ctx, x - 8 * s, y - 18 * s / squash, 4 * s, 2.5 * s, 'rgba(255,255,255,0.45)');
  eyes(ctx, x - 3 * s, y - 11 * s, 5 * s, 2.6 * s);
};

const mushroom: ShapeFn = (ctx, x, y, s, body, time) => {
  const bob = Math.abs(Math.sin(time * 4)) * 2 * s;
  ctx.fillStyle = '#f3e3c3';
  ctx.beginPath();
  ctx.roundRect(x - 10 * s, y - 20 * s - bob, 20 * s, 20 * s + bob, 6 * s);
  ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(x, y - 22 * s - bob, 22 * s, 16 * s, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  for (const [dx, dy, r] of [[-10, -28, 3.5], [4, -33, 3], [12, -25, 2.5]] as const) {
    ellipse(ctx, x + dx * s, y + dy * s - bob, r * s, r * s, '#ffffff');
  }
  eyes(ctx, x - 2 * s, y - 12 * s - bob, 4.5 * s, 2.2 * s);
};

const bat: ShapeFn = (ctx, x, y, s, body, time) => {
  const fy = y - 32 * s + Math.sin(time * 4) * 4 * s;
  const flap = Math.sin(time * 16) * 0.6;
  ctx.fillStyle = body;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * 6 * s, fy);
    ctx.lineTo(x + side * 28 * s, fy - 12 * s + flap * 14 * s);
    ctx.lineTo(x + side * 22 * s, fy + 4 * s);
    ctx.lineTo(x + side * 14 * s, fy + 2 * s);
    ctx.closePath();
    ctx.fill();
  }
  ellipse(ctx, x, fy, 11 * s, 11 * s, body);
  eyes(ctx, x - 2 * s, fy - 1 * s, 4 * s, 2.2 * s, true);
};

const rock: ShapeFn = (ctx, x, y, s, body) => {
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(x - 18 * s, y - 26 * s, 36 * s, 26 * s, 8 * s);
  ctx.roundRect(x - 13 * s, y - 44 * s, 26 * s, 20 * s, 7 * s);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(x - 6 * s, y - 18 * s, 14 * s, 3 * s);
  ellipse(ctx, x - 7 * s, y - 35 * s, 3 * s, 2.2 * s, '#ffb030');
  ellipse(ctx, x + 3 * s, y - 35 * s, 3 * s, 2.2 * s, '#ffb030');
};

const imp: ShapeFn = (ctx, x, y, s, body, time) => {
  const hop = Math.abs(Math.sin(time * 6)) * 3 * s;
  ctx.fillStyle = mix('#ffd84a', '#ff6a3d', 0.5);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * 8 * s, y - 34 * s - hop);
    ctx.lineTo(x + side * 14 * s, y - 46 * s - hop);
    ctx.lineTo(x + side * 3 * s, y - 36 * s - hop);
    ctx.fill();
  }
  ellipse(ctx, x, y - 20 * s - hop, 16 * s, 17 * s, body);
  eyes(ctx, x - 2 * s, y - 24 * s - hop, 5 * s, 2.5 * s, true);
  ctx.strokeStyle = '#1b1b2a';
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.arc(x - 2 * s, y - 15 * s - hop, 4 * s, 0.2, Math.PI - 0.2);
  ctx.stroke();
};

const wolf: ShapeFn = (ctx, x, y, s, body, time) => {
  const pant = Math.sin(time * 8) * 1 * s;
  ellipse(ctx, x + 6 * s, y - 16 * s, 20 * s, 11 * s, body);
  ctx.fillStyle = body;
  ctx.fillRect(x - 6 * s, y - 10 * s, 5 * s, 10 * s);
  ctx.fillRect(x + 14 * s, y - 10 * s, 5 * s, 10 * s);
  ellipse(ctx, x - 12 * s, y - 26 * s + pant, 12 * s, 11 * s, body);
  for (const dx of [-18, -7]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * s, y - 32 * s + pant);
    ctx.lineTo(x + (dx + 3) * s, y - 44 * s + pant);
    ctx.lineTo(x + (dx + 7) * s, y - 33 * s + pant);
    ctx.fill();
  }
  ellipse(ctx, x - 22 * s, y - 23 * s + pant, 4 * s, 3 * s, '#2a2a3a');
  eyes(ctx, x - 12 * s, y - 28 * s + pant, 4 * s, 2 * s, true);
};

const ghost: ShapeFn = (ctx, x, y, s, body, time) => {
  const fy = y - 6 * s + Math.sin(time * 2.5) * 5 * s;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(x - 18 * s, fy);
  ctx.bezierCurveTo(x - 18 * s, fy - 48 * s, x + 18 * s, fy - 48 * s, x + 18 * s, fy);
  for (let i = 0; i < 4; i++) {
    const wx = x + 18 * s - (i + 0.5) * 9 * s;
    ctx.quadraticCurveTo(wx, fy + (i % 2 === 0 ? 7 : -3) * s + Math.sin(time * 6 + i) * 2 * s, wx - 4.5 * s, fy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  eyes(ctx, x - 3 * s, fy - 24 * s, 5 * s, 2.6 * s);
};

const SHAPES: Readonly<Record<ZoneSpec['shape'], ShapeFn>> = { slime, mushroom, bat, rock, imp, wolf, ghost };
