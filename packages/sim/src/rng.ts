// 상태에 정수 하나만 저장하는 결정적 난수기(mulberry32). 저장·재현이 쉬워서 고른다.
export interface RngHolder { rng: number }

export function nextFloat(holder: RngHolder): number {
  holder.rng = (holder.rng + 0x6d2b79f5) | 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function nextInt(holder: RngHolder, min: number, max: number): number {
  return min + Math.floor(nextFloat(holder) * (max - min + 1));
}
export function chance(holder: RngHolder, probability: number): boolean {
  return nextFloat(holder) < probability;
}
export function pick<T>(holder: RngHolder, list: readonly T[]): T {
  const value = list[Math.floor(nextFloat(holder) * list.length)];
  if (value === undefined) throw new Error('빈 목록에서 고를 수 없다');
  return value;
}
