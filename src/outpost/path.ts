/**
 * 가중 벽 돌파 흐름장.
 *
 * 핵심 규칙(docs/outpost-decisions.md C4): **모든 타일은 통행 가능하고, 벽은 통행 비용이 비쌀 뿐이다.**
 * 그래서 완전 봉쇄는 자동으로 "가장 싼 벽을 부수고 들어오기"가 되고, wallCost 한 숫자만으로
 * 같은 레이아웃에서 역할마다 다른 경로를 고른다(굴착체 40 ≪ 표류체 400).
 *
 * 정수 전용 Dijkstra + 버킷 큐 → 부동소수 오차·정렬 불안정성이 없다.
 * 타이브레이크는 방향 인덱스(상→좌→우→하) → 타일 인덱스 순으로 고정한다.
 */
import { GRID_H, GRID_W, TILE_COUNT, type TileIndex } from './contract.ts';
import { PATH_COST, TERRAIN } from './content.ts';

export const UNREACHABLE = 0x7fffffff;

/** 이동 방향. 타이브레이크 순서가 이 배열 순서다: 상 → 좌 → 우 → 하 */
export const DIRECTIONS: readonly { readonly dx: number; readonly dy: number }[] = [
  { dx: 0, dy: -1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
];

export interface FlowField {
  /** 코어까지의 누적 비용. UNREACHABLE이면 도달 불가(암반으로 둘러싸인 칸) */
  readonly dist: Int32Array;
  /** 다음 이동 방향 인덱스(DIRECTIONS). -1이면 없음(코어 자신 또는 고립) */
  readonly flow: Int8Array;
  /** 이 필드를 만들 때 쓴 격벽 추가 비용 */
  readonly wallCost: number;
  /** 장애물을 전부 무시하는 비행 필드인가 */
  readonly flying: boolean;
}

/** 타일별 통행 비용을 계산하는 입력. sim이 자기 상태에서 채워 넘긴다. */
export interface CostInput {
  readonly terrain: Readonly<Int8Array>;
  /** 타일에 격벽이 있으면 true */
  readonly walls: Readonly<Uint8Array>;
  /** 타일에 격벽 아닌 구조물이 있으면 true */
  readonly structures: Readonly<Uint8Array>;
}

function enterCost(input: CostInput, tile: TileIndex, wallCost: number, flying: boolean): number {
  const terrain = input.terrain[tile];
  if (flying) return PATH_COST.open; // 비행은 암반·벽·구조물을 전부 무시한다
  if (terrain === TERRAIN.rock) return UNREACHABLE;
  if (input.walls[tile] === 1) return PATH_COST.open + wallCost;
  if (input.structures[tile] === 1) return PATH_COST.open + PATH_COST.structure;
  return PATH_COST.open;
}

/**
 * 코어 타일들에서 역방향 전파하는 Dijkstra. 비용이 정수이고 상한이 작아 버킷 큐로 충분하다.
 * 출력 버퍼를 받아 재사용한다(프레임당 할당 0).
 */
export function buildField(
  input: CostInput,
  coreTiles: readonly TileIndex[],
  wallCost: number,
  flying: boolean,
  out?: { dist: Int32Array; flow: Int8Array },
): FlowField {
  const dist = out?.dist ?? new Int32Array(TILE_COUNT);
  const flow = out?.flow ?? new Int8Array(TILE_COUNT);
  dist.fill(UNREACHABLE);
  flow.fill(-1);

  // 최대 비용 상한: 모든 칸을 최악 비용으로 지나도 이 안에 들어온다.
  const maxStep = PATH_COST.open + Math.max(wallCost, PATH_COST.structure);
  const buckets: TileIndex[][] = [];
  const push = (tile: TileIndex, cost: number): void => {
    let bucket = buckets[cost];
    if (bucket === undefined) {
      bucket = [];
      buckets[cost] = bucket;
    }
    bucket.push(tile);
  };

  for (const tile of coreTiles) {
    if (tile < 0 || tile >= TILE_COUNT) continue;
    dist[tile] = 0;
    push(tile, 0);
  }

  const limit = TILE_COUNT * maxStep + 1;
  for (let cost = 0; cost < limit; cost++) {
    const bucket = buckets[cost];
    if (bucket === undefined) continue;
    // 버킷 안에서는 타일 인덱스 순으로 처리해 결정성을 보장한다.
    bucket.sort((a, b) => a - b);
    for (const tile of bucket) {
      if (dist[tile] !== cost) continue; // 더 싼 경로로 이미 갱신됨
      const x = tile % GRID_W;
      const y = (tile - x) / GRID_W;
      for (let dir = 0; dir < DIRECTIONS.length; dir++) {
        const step = DIRECTIONS[dir];
        const nx = x + step.dx;
        const ny = y + step.dy;
        if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
        const next = ny * GRID_W + nx;
        const enter = enterCost(input, next, wallCost, flying);
        if (enter >= UNREACHABLE) continue;
        const candidate = cost + enter;
        if (candidate >= dist[next]) continue;
        dist[next] = candidate;
        // next에서 tile로 가는 방향 = step의 반대
        const back = dir === 0 ? 3 : dir === 1 ? 2 : dir === 2 ? 1 : 0;
        flow[next] = back;
        push(next, candidate);
      }
    }
    buckets[cost] = undefined as unknown as TileIndex[];
  }
  return { dist, flow, wallCost, flying };
}

/**
 * 여러 wallCost를 한 번에 유지하는 캐시. 레이아웃이 바뀔 때만 rebuild가 불린다.
 * 필드 수 = 서로 다른 wallCost 개수 + 비행 1. 9×12 기준 전체 재계산이 수백 연산이다.
 */
export class FieldCache {
  private readonly fields = new Map<number, { dist: Int32Array; flow: Int8Array }>();
  private readonly flyingBuffers = { dist: new Int32Array(TILE_COUNT), flow: new Int8Array(TILE_COUNT) };
  private readonly costs: readonly number[];
  /** 실제 Dijkstra를 돈 횟수. 테스트가 "스텝당 1회 병합"을 검증한다. */
  rebuildCount = 0;

  constructor(costs: readonly number[]) {
    this.costs = [...costs];
    for (const cost of this.costs) {
      this.fields.set(cost, { dist: new Int32Array(TILE_COUNT), flow: new Int8Array(TILE_COUNT) });
    }
  }

  rebuild(input: CostInput, coreTiles: readonly TileIndex[]): void {
    for (const cost of this.costs) {
      const buffers = this.fields.get(cost);
      if (buffers) buildField(input, coreTiles, cost, false, buffers);
    }
    buildField(input, coreTiles, 0, true, this.flyingBuffers);
    this.rebuildCount++;
  }

  ground(wallCost: number): { dist: Int32Array; flow: Int8Array } {
    const exact = this.fields.get(wallCost);
    if (exact) return exact;
    // 콘텐츠에 없는 비용이 들어오면 가장 가까운 캐시를 쓴다(크래시보다 낫다).
    let best = this.costs[0];
    for (const cost of this.costs) if (Math.abs(cost - wallCost) < Math.abs(best - wallCost)) best = cost;
    return this.fields.get(best) ?? this.flyingBuffers;
  }

  flying(): { dist: Int32Array; flow: Int8Array } {
    return this.flyingBuffers;
  }
}

/** 한 타일에서 흐름장을 따라 코어까지 가는 경로. 테스트·미리보기용(루프 방지 상한 포함). */
export function tracePath(field: { dist: Int32Array; flow: Int8Array }, from: TileIndex): TileIndex[] {
  const path: TileIndex[] = [];
  let tile = from;
  for (let guard = 0; guard < TILE_COUNT * 2; guard++) {
    path.push(tile);
    const dir = field.flow[tile];
    if (dir < 0) break;
    const step = DIRECTIONS[dir];
    const x = (tile % GRID_W) + step.dx;
    const y = Math.floor(tile / GRID_W) + step.dy;
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) break;
    tile = y * GRID_W + x;
    if (field.dist[tile] === 0) {
      path.push(tile);
      break;
    }
  }
  return path;
}
