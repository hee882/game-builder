/**
 * 렌더 팔레트와 저수준 드로잉 유틸. 색 리터럴은 전부 여기에만 있다.
 *
 * 규칙(docs/outpost-art-review.md)
 *   - 물 배경은 저채도 4단. 고채도는 광원·위협·UI 에만 쓴다.
 *   - 모든 면은 3단 램프(하이라이트/기본/그림자) + 광원 반대편 1px 림라이트.
 *   - 발광은 shadowBlur 가 아니라 다중 알파 스택. ctx.filter 금지.
 */

export interface Ramp {
  readonly hi: string;
  readonly mid: string;
  readonly lo: string;
}

export const PALETTE = {
  abyss: '#04101a',
  deep: '#08202e',
  mid: '#0e3145',
  near: '#154457',
  silt: '#1b3b46',

  rockHi: '#3c5a63',
  rockMid: '#27424e',
  rockLo: '#162b36',

  hullHi: '#dfe9ec',
  hullMid: '#9db2bb',
  hullLo: '#4f6773',
  hullDark: '#2c3f4a',

  glassWarm: '#ffd79a',
  coreWarm: '#ffb765',
  energyCyan: '#5ff2d0',
  alertAmber: '#ffb648',
  threatRed: '#ff4d6d',
  arcaneViolet: '#b06cff',
  oreGold: '#f5c96b',
  fleshDeep: '#6b3f6e',
  fleshPale: '#c9a7d8',
  chitin: '#7d6a52',
} as const;

export const HULL: Ramp = { hi: PALETTE.hullHi, mid: PALETTE.hullMid, lo: PALETTE.hullLo };
export const ROCK: Ramp = { hi: PALETTE.rockHi, mid: PALETTE.rockMid, lo: PALETTE.rockLo };

/** #rrggbb + 알파 → rgba() */
export function alpha(hex: string, a: number): string {
  const value = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const clamped = a < 0 ? 0 : a > 1 ? 1 : a;
  return `rgba(${r},${g},${b},${clamped.toFixed(3)})`;
}

export function mix(from: string, to: string, t: number): string {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const a = from.startsWith('#') ? from.slice(1) : from;
  const b = to.startsWith('#') ? to.slice(1) : to;
  const channel = (i: number): number =>
    Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k);
  const hex = (n: number): string => n.toString(16).padStart(2, '0');
  return `#${hex(channel(0))}${hex(channel(2))}${hex(channel(4))}`;
}

/** 결정적 해시 난수 — Math.random 없이 장식을 흩뿌린다(재굽기해도 같은 그림) */
export function hash01(x: number, y: number, salt = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ─────────────────────────── 형태 유틸 ─────────────────────────── */

/** 네이티브 roundRect 는 경로 연산 1회다(수동 조립은 11회). 한 번만 판정한다 */
let nativeRoundRect: boolean | null = null;

export function roundedRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  if (nativeRoundRect === null) {
    nativeRoundRect = typeof (c as { roundRect?: unknown }).roundRect === 'function';
  }
  if (nativeRoundRect) {
    c.beginPath();
    c.roundRect(x, y, w, h, radius);
    return;
  }
  c.beginPath();
  c.moveTo(x + radius, y);
  c.lineTo(x + w - radius, y);
  c.quadraticCurveTo(x + w, y, x + w, y + radius);
  c.lineTo(x + w, y + h - radius);
  c.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  c.lineTo(x + radius, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - radius);
  c.lineTo(x, y + radius);
  c.quadraticCurveTo(x, y, x + radius, y);
  c.closePath();
}

export function polygon(c: CanvasRenderingContext2D, points: readonly number[]): void {
  c.beginPath();
  c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.closePath();
}

/**
 * 3단 셰이딩 + 림라이트. 평면 도형을 «물속의 물체»로 만드는 핵심 루틴.
 * 광원은 좌상단 고정.
 */
export function shadedRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  ramp: Ramp,
  rim = PALETTE.energyCyan,
): void {
  roundedRect(c, x, y, w, h, r);
  c.fillStyle = ramp.mid;
  c.fill();

  // 상단 1/3 하이라이트
  c.save();
  c.clip();
  c.fillStyle = alpha(ramp.hi, 0.5);
  c.fillRect(x, y, w, h * 0.34);
  c.fillStyle = alpha(ramp.lo, 0.55);
  c.fillRect(x, y + h * 0.72, w, h * 0.28);
  c.restore();

  // 광원 반대편(우하단) 림라이트 1px
  c.strokeStyle = alpha(rim, 0.35);
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.stroke();
}

/**
 * 발광 스프라이트 캐시. 알파 스택 3겹(9 연산)을 drawImage 1회로 줄인다.
 * 색은 팔레트 12종뿐이라 캐시가 작고, 스프라이트는 앱 수명 동안 재사용된다.
 */
const GLOW_PX = 64;
const glowCache = new Map<string, HTMLCanvasElement | null>();

function glowSprite(color: string): HTMLCanvasElement | null {
  const cached = glowCache.get(color);
  if (cached !== undefined) return cached;
  if (typeof document === 'undefined') {
    glowCache.set(color, null);
    return null;
  }
  const sprite = document.createElement('canvas');
  sprite.width = GLOW_PX;
  sprite.height = GLOW_PX;
  const g = sprite.getContext('2d');
  if (!g) {
    glowCache.set(color, null);
    return null;
  }
  const half = GLOW_PX / 2;
  const grad = g.createRadialGradient(half, half, 0, half, half, half);
  // 기존 3단 스택과 같은 감쇠를 한 번의 그라디언트로 재현
  grad.addColorStop(0, alpha(color, 0.5));
  grad.addColorStop(0.31, alpha(color, 0.22));
  grad.addColorStop(0.56, alpha(color, 0.08));
  grad.addColorStop(1, alpha(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, GLOW_PX, GLOW_PX);
  glowCache.set(color, sprite);
  return sprite;
}

/** 부드러운 발광. shadowBlur·ctx.filter 를 쓰지 않는다 */
export function glow(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  strength = 1,
): void {
  if (radius <= 0 || strength <= 0) return;
  const sprite = glowSprite(color);
  const outer = radius * 3.2;
  const prevOp = c.globalCompositeOperation;
  const prevAlpha = c.globalAlpha;
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = prevAlpha * Math.min(1, strength);
  if (sprite) {
    c.drawImage(sprite, x - outer, y - outer, outer * 2, outer * 2);
  } else {
    // 스프라이트를 만들 수 없는 환경(SSR 등)의 최소 대체
    c.fillStyle = alpha(color, 0.35);
    c.beginPath();
    c.arc(x, y, radius, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = prevAlpha;
  c.globalCompositeOperation = prevOp;
}

/** 광원 코어 — 작은 점광원(창문·계기) */
export function lamp(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  strength = 1,
): void {
  glow(c, x, y, radius, color, strength * 0.8);
  c.fillStyle = alpha(color, Math.min(1, 0.85 * strength));
  c.beginPath();
  c.arc(x, y, radius * 0.55, 0, Math.PI * 2);
  c.fill();
}

/** 확산 링(충격파·발견 연출) */
export function ring(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  width: number,
  color: string,
  a: number,
): void {
  if (radius <= 0 || a <= 0) return;
  c.strokeStyle = alpha(color, a);
  c.lineWidth = width;
  c.beginPath();
  c.arc(x, y, radius, 0, Math.PI * 2);
  c.stroke();
}
