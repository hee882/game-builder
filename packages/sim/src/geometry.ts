import type { Vec } from './types';

// 정수 방향 벡터는 런타임 삼각함수 오차와 대각선 속도 증가를 피한다.
export const DIRECTIONS: readonly Vec[] = [
  {x:0,z:1000},{x:707,z:707},{x:1000,z:0},{x:707,z:-707},
  {x:0,z:-1000},{x:-707,z:-707},{x:-1000,z:0},{x:-707,z:707},
];
export function direction(index: number): Vec { return DIRECTIONS[((index % 8) + 8) % 8] ?? DIRECTIONS[0]!; }
export function distanceSquared(a: Vec, b: Vec): number { return (a.x-b.x)**2 + (a.z-b.z)**2; }
export function heading(from: Vec, to: Vec): number {
  let best = -Infinity; let result = 0;
  DIRECTIONS.forEach((dir, index) => {
    const dot = (to.x-from.x)*dir.x + (to.z-from.z)*dir.z;
    if (dot > best) { best = dot; result = index; }
  });
  return result;
}
export function move(entity: Vec, facing: number, speed: number): void {
  const dir = direction(facing);
  entity.x = Math.max(-11500, Math.min(11500, entity.x + Math.round(dir.x*speed/1000)));
  entity.z = Math.max(-9500, Math.min(9500, entity.z + Math.round(dir.z*speed/1000)));
}
export function inHitbox(from: Vec, facing: number, to: Vec, range: number, shape: string): boolean {
  if (distanceSquared(from, to) > range*range) return false;
  if (shape === 'circle') return true;
  const dir = direction(facing);
  const x = to.x-from.x; const z = to.z-from.z;
  const forward = x*dir.x+z*dir.z;
  const side = Math.abs(x*dir.z-z*dir.x);
  return forward >= -200000 && side <= (shape === 'thrust' ? 650000 : forward + 700000);
}
