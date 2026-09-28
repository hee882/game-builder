/** 큰 수를 한국식 단위로 줄인다. 키우기 장르는 숫자가 커지는 맛이 핵심이라 단위가 바뀌는 순간이 보여야 한다 */
const UNITS: readonly [number, string][] = [
  [1e20, '해'],
  [1e16, '경'],
  [1e12, '조'],
  [1e8, '억'],
  [1e4, '만'],
];

export function formatBig(value: number): string {
  if (!Number.isFinite(value)) return '∞';
  const abs = Math.abs(value);
  if (abs < 1e4) return Math.floor(value).toLocaleString('ko-KR');
  if (abs >= 1e24) return value.toExponential(2).replace('e+', 'e');
  for (const [size, unit] of UNITS) {
    if (abs >= size) {
      const scaled = value / size;
      const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
      return `${scaled.toFixed(digits)}${unit}`;
    }
  }
  return String(Math.floor(value));
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (minutes > 0) return `${minutes}분`;
  return `${total}초`;
}
