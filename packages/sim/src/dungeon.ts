import { nextInt } from './rng';
import type { RngHolder } from './rng';
import type { Vec } from './types';

export type RoomKind = 'start' | 'normal' | 'elite' | 'boss';
export interface Room { x: number; z: number; w: number; h: number; kind: RoomKind; cx: number; cz: number }
/** 던전은 생성 후 바뀌지 않는다. 상태 복제·저장 대상에서 빠지도록 RunState와 분리한다. */
export interface Dungeon { seed: number; width: number; height: number; floor: Uint8Array; rooms: Room[] }

export const GRID = 72;

export function isFloor(d: Dungeon, x: number, z: number): boolean {
  const tx = Math.floor(x); const tz = Math.floor(z);
  if (tx < 0 || tz < 0 || tx >= d.width || tz >= d.height) return false;
  return d.floor[tz * d.width + tx] === 1;
}
/** 반경을 가진 몸체가 서 있을 수 있는가 — 네 귀퉁이만 본다(반경 < 1타일 가정). */
export function canStand(d: Dungeon, x: number, z: number, radius: number): boolean {
  return isFloor(d, x - radius, z - radius) && isFloor(d, x + radius, z - radius)
    && isFloor(d, x - radius, z + radius) && isFloor(d, x + radius, z + radius);
}

function overlaps(a: Room, b: Room, margin: number): boolean {
  return a.x - margin < b.x + b.w && b.x - margin < a.x + a.w && a.z - margin < b.z + b.h && b.z - margin < a.z + a.h;
}
function carve(d: Dungeon, x0: number, z0: number, x1: number, z1: number): void {
  for (let z = Math.max(1, z0); z <= Math.min(d.height - 2, z1); z++)
    for (let x = Math.max(1, x0); x <= Math.min(d.width - 2, x1); x++) d.floor[z * d.width + x] = 1;
}
function corridor(d: Dungeon, a: Room, b: Room, horizontalFirst: boolean): void {
  // 폭 3 복도: 몹 무리가 끼지 않고 지나갈 수 있는 최소 폭(가설).
  const ax = Math.floor(a.cx); const az = Math.floor(a.cz); const bx = Math.floor(b.cx); const bz = Math.floor(b.cz);
  if (horizontalFirst) { carve(d, Math.min(ax, bx), az - 1, Math.max(ax, bx), az + 1); carve(d, bx - 1, Math.min(az, bz), bx + 1, Math.max(az, bz)); }
  else { carve(d, ax - 1, Math.min(az, bz), ax + 1, Math.max(az, bz)); carve(d, Math.min(ax, bx), bz - 1, Math.max(ax, bx), bz + 1); }
}

function placeRooms(holder: RngHolder, target: number): Room[] {
  const rooms: Room[] = [];
  for (let attempt = 0; attempt < 400 && rooms.length < target; attempt++) {
    const w = nextInt(holder, 9, 15); const h = nextInt(holder, 9, 15);
    const room: Room = { x: nextInt(holder, 2, GRID - w - 2), z: nextInt(holder, 2, GRID - h - 2), w, h, kind: 'normal', cx: 0, cz: 0 };
    room.cx = room.x + w / 2; room.cz = room.z + h / 2;
    if (!rooms.some(other => overlaps(room, other, 3))) rooms.push(room);
  }
  return rooms;
}

export function generateDungeon(seed: number): Dungeon {
  const holder: RngHolder = { rng: seed ^ 0x5eed };
  const rooms = placeRooms(holder, nextInt(holder, 6, 9));
  const d: Dungeon = { seed, width: GRID, height: GRID, floor: new Uint8Array(GRID * GRID), rooms };
  for (const room of rooms) carve(d, room.x, room.z, room.x + room.w - 1, room.z + room.h - 1);
  // 각 방을 이전 방 중 가장 가까운 방에 잇는다 → 트리 구조라 모두 연결된다.
  for (let i = 1; i < rooms.length; i++) {
    const room = rooms[i]!;
    let best = rooms[0]!; let bestD = Infinity;
    for (let j = 0; j < i; j++) {
      const other = rooms[j]!; const dd = (other.cx - room.cx) ** 2 + (other.cz - room.cz) ** 2;
      if (dd < bestD) { bestD = dd; best = other; }
    }
    corridor(d, best, room, nextInt(holder, 0, 1) === 0);
  }
  assignKinds(d, holder);
  return d;
}

function assignKinds(d: Dungeon, holder: RngHolder): void {
  const start = d.rooms[0]!; start.kind = 'start';
  const distances = d.rooms.map(room => pathLength(d, { x: start.cx, z: start.cz }, { x: room.cx, z: room.cz }));
  let bossIndex = 1;
  distances.forEach((value, index) => { if (value > (distances[bossIndex] ?? -1)) bossIndex = index; });
  d.rooms[bossIndex]!.kind = 'boss';
  const middle = d.rooms.map((_, index) => index).filter(index => index !== 0 && index !== bossIndex);
  const eliteCount = d.rooms.length >= 8 ? 2 : 1;
  for (let n = 0; n < eliteCount && middle.length > 0; n++) {
    const index = middle.splice(nextInt(holder, 0, middle.length - 1), 1)[0]!;
    d.rooms[index]!.kind = 'elite';
  }
}

const NEIGHBORS: readonly [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
];

/** 8방향 타일 A*. 모서리 끼어 통과는 막는다. 도달 불가면 null. */
export function findPath(d: Dungeon, from: Vec, to: Vec): Vec[] | null {
  const w = d.width;
  const start = Math.floor(from.z) * w + Math.floor(from.x);
  const goal = Math.floor(to.z) * w + Math.floor(to.x);
  if (!isFloor(d, to.x, to.z) || !isFloor(d, from.x, from.z)) return null;
  if (start === goal) return [{ x: to.x, z: to.z }];
  const g = new Float32Array(w * d.height).fill(Infinity);
  const parent = new Int32Array(w * d.height).fill(-1);
  const closed = new Uint8Array(w * d.height);
  const heap = new MinHeap();
  const gx = goal % w; const gz = Math.floor(goal / w);
  const h = (index: number): number => {
    const dx = Math.abs(index % w - gx); const dz = Math.abs(Math.floor(index / w) - gz);
    return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
  };
  g[start] = 0; heap.push(start, h(start));
  while (heap.size > 0) {
    const current = heap.pop();
    if (current === goal) break;
    if (closed[current]) continue;
    closed[current] = 1;
    const cx = current % w; const cz = Math.floor(current / w);
    for (const [dx, dz, cost] of NEIGHBORS) {
      const nx = cx + dx; const nz = cz + dz;
      if (!isFloor(d, nx, nz)) continue;
      if (dx !== 0 && dz !== 0 && (!isFloor(d, cx + dx, cz) || !isFloor(d, cx, cz + dz))) continue;
      const next = nz * w + nx; const score = g[current]! + cost;
      if (score < g[next]!) { g[next] = score; parent[next] = current; heap.push(next, score + h(next)); }
    }
  }
  if (parent[goal] === -1) return null;
  const tiles: Vec[] = [];
  for (let at = goal; at !== start && at !== -1; at = parent[at]!) tiles.push({ x: at % w + 0.5, z: Math.floor(at / w) + 0.5 });
  tiles.reverse();
  tiles[tiles.length - 1] = { x: to.x, z: to.z };
  return smooth(d, from, tiles);
}

/** 시야가 트인 중간 지점을 건너뛰어 지그재그 이동을 없앤다. */
function smooth(d: Dungeon, from: Vec, tiles: Vec[]): Vec[] {
  const result: Vec[] = [];
  let anchor = from; let i = 0;
  while (i < tiles.length) {
    let far = i;
    while (far + 1 < tiles.length && lineOfSight(d, anchor, tiles[far + 1]!, 0.35)) far++;
    const point = tiles[far]!; result.push(point); anchor = point; i = far + 1;
  }
  return result;
}

export function lineOfSight(d: Dungeon, a: Vec, b: Vec, radius = 0): boolean {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(length / 0.25));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps; const x = a.x + (b.x - a.x) * t; const z = a.z + (b.z - a.z) * t;
    if (radius > 0 ? !canStand(d, x, z, radius) : !isFloor(d, x, z)) return false;
  }
  return true;
}

export function pathLength(d: Dungeon, from: Vec, to: Vec): number {
  const path = findPath(d, from, to);
  if (!path) return Infinity;
  let total = 0; let prev = from;
  for (const point of path) { total += Math.hypot(point.x - prev.x, point.z - prev.z); prev = point; }
  return total;
}

class MinHeap {
  private items: number[] = []; private keys: number[] = [];
  get size(): number { return this.items.length; }
  push(item: number, key: number): void {
    this.items.push(item); this.keys.push(key);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= key) break;
      this.swap(i, p); i = p;
    }
  }
  pop(): number {
    const top = this.items[0]!; const lastItem = this.items.pop()!; const lastKey = this.keys.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem; this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1; const r = l + 1; let m = i;
        if (l < this.items.length && this.keys[l]! < this.keys[m]!) m = l;
        if (r < this.items.length && this.keys[r]! < this.keys[m]!) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
  }
}
