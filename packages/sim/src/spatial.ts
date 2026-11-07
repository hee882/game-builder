import type { Enemy, Vec } from './types';

// 2m 격자 공간 해시. 몹 100마리 이상에서 적-적 분리와 광역 판정을 O(N²)에서 떼어내기 위해 쓴다.
const CELL = 2;
const key = (cx: number, cz: number): number => cx * 4096 + cz;

export class SpatialHash {
  private cells = new Map<number, Enemy[]>();
  rebuild(enemies: readonly Enemy[]): void {
    this.cells.clear();
    for (const enemy of enemies) {
      if (enemy.hp <= 0) continue;
      const k = key(Math.floor(enemy.x / CELL), Math.floor(enemy.z / CELL));
      const bucket = this.cells.get(k);
      if (bucket) bucket.push(enemy); else this.cells.set(k, [enemy]);
    }
  }
  /** 중심에서 radius(+적 반경) 안의 살아 있는 적. 결과 순서는 삽입 순서 기반이라 결정적이다. */
  query(center: Vec, radius: number): Enemy[] {
    const result: Enemy[] = [];
    const reach = radius + 1.2;
    const x0 = Math.floor((center.x - reach) / CELL); const x1 = Math.floor((center.x + reach) / CELL);
    const z0 = Math.floor((center.z - reach) / CELL); const z1 = Math.floor((center.z + reach) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const bucket = this.cells.get(key(cx, cz));
      if (!bucket) continue;
      for (const enemy of bucket) {
        if (enemy.hp > 0 && Math.hypot(enemy.x - center.x, enemy.z - center.z) <= radius + enemy.radius) result.push(enemy);
      }
    }
    return result.sort((a, b) => a.id - b.id);
  }
}
