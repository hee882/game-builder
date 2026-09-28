/**
 * 아이소메트릭 투영과 복셀(상자) 그리기.
 * 월드 (x, y, z) — x·y 는 바닥 타일 단위, z 는 높이(타일 한 칸 폭의 절반 = 1).
 * 빛은 화면 왼쪽 위에서 온다: 윗면이 가장 밝고, +y 면(왼쪽 앞)이 중간, +x 면(오른쪽 앞)이 가장 어둡다.
 */

export type Ctx = CanvasRenderingContext2D;

export interface Camera {
  /** 화면 중앙에 오는 월드 좌표 */
  x: number;
  y: number;
  /** 타일 한 칸의 화면 폭(px) */
  tile: number;
  width: number;
  height: number;
}

export interface Screen {
  x: number;
  y: number;
}

/** 높이 1 이 화면에서 차지하는 픽셀 = 타일 폭 × 이 값 */
const HEIGHT_RATIO = 0.55;

export function project(cam: Camera, x: number, y: number, z = 0): Screen {
  const half = cam.tile / 2;
  const dx = x - cam.x;
  const dy = y - cam.y;
  return {
    x: cam.width / 2 + (dx - dy) * half,
    y: cam.height / 2 + (dx + dy) * half * 0.5 - z * cam.tile * HEIGHT_RATIO,
  };
}

/** 화면 벡터 → 월드 방향. 조이스틱을 «화면 기준 위»로 밀면 화면 위로 걷게 한다 */
export function screenToWorldDir(sx: number, sy: number): { x: number; y: number } {
  // 투영의 선형 부분 역행렬: sx ∝ (x - y), sy ∝ (x + y) / 2
  const x = sx / 2 + sy;
  const y = sy - sx / 2;
  const len = Math.hypot(x, y);
  return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
}

/* ───────────── 색 ───────────── */

const parsed = new Map<string, [number, number, number]>();

function rgb(hex: string): [number, number, number] {
  let value = parsed.get(hex);
  if (!value) {
    const n = parseInt(hex.slice(1), 16);
    value = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    parsed.set(hex, value);
  }
  return value;
}

/** factor > 1 이면 밝게, < 1 이면 어둡게 */
export function shade(hex: string, factor: number): string {
  const [r, g, b] = rgb(hex);
  const f = (c: number): number => Math.max(0, Math.min(255, Math.round(factor >= 1 ? c + (255 - c) * (factor - 1) : c * factor)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ───────────── 도형 ───────────── */

function poly(ctx: Ctx, points: readonly Screen[], fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fill();
}

export interface BoxStyle {
  readonly color: string;
  /** 피격 번쩍임 등: 0~1 만큼 흰색으로 */
  readonly flash?: number;
  readonly outline?: boolean;
}

/** (x, y) 가 바닥 모서리(최소 x·y), 크기 w(x 방향) × d(y 방향) × h(높이) */
export function box(ctx: Ctx, cam: Camera, x: number, y: number, z: number, w: number, d: number, h: number, style: BoxStyle): void {
  const base = style.flash ? shade(style.color, 1 + style.flash * 0.8) : style.color;
  const top = [project(cam, x, y, z + h), project(cam, x + w, y, z + h), project(cam, x + w, y + d, z + h), project(cam, x, y + d, z + h)];
  const bottomRight = project(cam, x + w, y, z);
  const bottomFront = project(cam, x + w, y + d, z);
  const bottomLeft = project(cam, x, y + d, z);
  poly(ctx, [top[3], top[2], bottomFront, bottomLeft], shade(base, 0.82));
  poly(ctx, [top[1], top[2], bottomFront, bottomRight], shade(base, 0.66));
  poly(ctx, top, shade(base, 1.08));
  if (style.outline) {
    ctx.strokeStyle = 'rgba(20,30,50,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(top[0].x, top[0].y);
    for (const p of [top[1], top[2], top[3], top[0]]) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
}

/** 중심 (cx, cy) 기준으로 놓는 상자 */
export function boxAt(ctx: Ctx, cam: Camera, cx: number, cy: number, z: number, w: number, d: number, h: number, style: BoxStyle): void {
  box(ctx, cam, cx - w / 2, cy - d / 2, z, w, d, h, style);
}

/** 바닥에 붙은 평평한 사각형(타일·패드) */
export function flat(ctx: Ctx, cam: Camera, x: number, y: number, w: number, d: number, fill: string, z = 0): void {
  poly(ctx, [project(cam, x, y, z), project(cam, x + w, y, z), project(cam, x + w, y + d, z), project(cam, x, y + d, z)], fill);
}

export function flatOutline(ctx: Ctx, cam: Camera, x: number, y: number, w: number, d: number, stroke: string, width: number, dash: readonly number[] = []): void {
  const pts = [project(cam, x, y), project(cam, x + w, y), project(cam, x + w, y + d), project(cam, x, y + d)];
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.setLineDash([...dash]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of [pts[1], pts[2], pts[3], pts[0]]) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** 바닥 그림자(타원) */
export function shadow(ctx: Ctx, cam: Camera, x: number, y: number, radius: number, alpha = 0.22): void {
  const c = project(cam, x, y);
  ctx.fillStyle = `rgba(20,40,70,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, radius * cam.tile * 0.5, radius * cam.tile * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** 상자의 한 면(+x 또는 +y 면)에 작은 사각형(눈·코 등)을 붙인다. u: 면 가로 0~1, v: 높이 */
export function faceDot(
  ctx: Ctx,
  cam: Camera,
  face: 'x' | 'y',
  x: number,
  y: number,
  z: number,
  u: number,
  size: number,
  color: string,
): void {
  const half = size / 2;
  const pts =
    face === 'x'
      ? [project(cam, x, y + u - half, z + half), project(cam, x, y + u + half, z + half), project(cam, x, y + u + half, z - half), project(cam, x, y + u - half, z - half)]
      : [project(cam, x + u - half, y, z + half), project(cam, x + u + half, y, z + half), project(cam, x + u + half, y, z - half), project(cam, x + u - half, y, z - half)];
  poly(ctx, pts, color);
}
