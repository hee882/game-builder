import type { Vec } from './types';

export function dist2(a: Vec, b: Vec): number { return (a.x - b.x) ** 2 + (a.z - b.z) ** 2; }
export function dist(a: Vec, b: Vec): number { return Math.sqrt(dist2(a, b)); }
export function normalize(x: number, z: number): Vec {
  const length = Math.hypot(x, z);
  return length < 1e-6 ? { x: 0, z: 1 } : { x: x / length, z: z / length };
}
export function direction(from: Vec, to: Vec): Vec { return normalize(to.x - from.x, to.z - from.z); }

/** 부채꼴 판정. dir은 단위 벡터, halfAngle은 라디안. */
export function inCone(origin: Vec, dir: Vec, target: Vec, range: number, halfAngle: number, targetRadius = 0): boolean {
  const dx = target.x - origin.x; const dz = target.z - origin.z;
  const d = Math.hypot(dx, dz);
  if (d > range + targetRadius) return false;
  if (d < 0.6 + targetRadius) return true; // 붙어 있는 적은 방향과 무관하게 맞는다.
  return (dx * dir.x + dz * dir.z) / d >= Math.cos(halfAngle);
}
/** 점과 선분 사이 거리 — 돌진 경로 판정용 */
export function segmentDistance(a: Vec, b: Vec, p: Vec): number {
  const abx = b.x - a.x; const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
  return Math.hypot(a.x + abx * t - p.x, a.z + abz * t - p.z);
}
export function round3(value: number): number { return Math.round(value * 1000) / 1000; }
