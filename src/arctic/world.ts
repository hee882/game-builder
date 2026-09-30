/**
 * 북극 사냥 식당 — 규칙과 상태. DOM·실시간·전역 난수를 쓰지 않는다.
 * 셸은 setInput() 으로 이동 방향만 넘기고 step() 을 고정 간격으로 부른다.
 */
import {
  BEAR,
  BUILDS,
  BUILD_ORDER,
  COOK,
  COUNTER,
  COUNTER_PAD,
  GRILLS,
  HUNT_FIELD,
  MONEY_PAD,
  OFFICE_PAD,
  PAD_FILL_SECONDS,
  PAD_MIN_RATE,
  PAD_RADIUS,
  PLAYER,
  QUEUE_HEAD,
  QUEUE_STEP,
  TICK,
  UPGRADES,
  UPGRADE_ORDER,
  WORKER,
  WORLD,
  type BuildId,
  type Rect,
  type UpgradeId,
  type Vec,
} from './content.ts';

export type Item = 'raw' | 'cooked';

export interface Point {
  x: number;
  y: number;
}

export interface Carrier {
  pos: Point;
  kind: Item | null;
  count: number;
  transfer: number;
}

export interface Player extends Carrier {
  dir: Point;
  attack: number;
}

export interface Bear {
  id: number;
  pos: Point;
  goal: Point;
  pause: number;
  hp: number;
  respawn: number;
}

export interface Meat {
  id: number;
  pos: Point;
}

export interface Grill {
  input: number;
  output: number;
  timer: number;
}

export interface Customer {
  id: number;
  pos: Point;
  want: number;
  got: number;
  leaving: boolean;
}

export interface Worker extends Carrier {
  id: number;
  role: 'carrier' | 'hunter';
  task: 'fetch' | 'deliver';
  attack: number;
}

export type WorldEvent =
  | { readonly kind: 'hit'; readonly bear: number; readonly by: 'player' | 'worker' }
  | { readonly kind: 'bearDown'; readonly at: Vec }
  | { readonly kind: 'pickup'; readonly item: Item; readonly from: Vec; readonly to: 'player' | number }
  | { readonly kind: 'drop'; readonly item: Item; readonly from: Vec; readonly to: Vec }
  | { readonly kind: 'cooked'; readonly grill: number }
  | { readonly kind: 'sale'; readonly amount: number; readonly at: Vec }
  | { readonly kind: 'collect'; readonly amount: number }
  | { readonly kind: 'pay'; readonly build: BuildId; readonly amount: number }
  | { readonly kind: 'built'; readonly build: BuildId };

export interface WorldState {
  rng: number;
  time: number;
  nextId: number;
  money: number;
  /** 카운터 옆에 쌓인, 아직 줍지 않은 돈 */
  pile: number;
  stock: number;
  totalEarned: number;
  built: Set<BuildId>;
  paid: Record<BuildId, number>;
  upgrades: Record<UpgradeId, number>;
  player: Player;
  bears: Bear[];
  meats: Meat[];
  grills: Grill[];
  customers: Customer[];
  workers: Worker[];
  spawnTimer: number;
  buyTimer: number;
  events: WorldEvent[];
}

/* ───────────── 난수·기하 ───────────── */

function random(state: WorldState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const copy = (v: Vec): Point => ({ x: v.x, y: v.y });

function randomIn(state: WorldState, rect: Rect): Point {
  return { x: rect.x0 + random(state) * (rect.x1 - rect.x0), y: rect.y0 + random(state) * (rect.y1 - rect.y0) };
}

/** 목표를 향해 최대 step 만큼 움직인다. 도착하면 true */
function moveToward(pos: Point, goal: Vec, step: number): boolean {
  const d = dist(pos, goal);
  if (d <= step) {
    pos.x = goal.x;
    pos.y = goal.y;
    return true;
  }
  pos.x += ((goal.x - pos.x) / d) * step;
  pos.y += ((goal.y - pos.y) / d) * step;
  return false;
}

/* ───────────── 생성 ───────────── */

const zeroPaid = (): Record<BuildId, number> =>
  Object.fromEntries(BUILD_ORDER.map((id) => [id, 0])) as Record<BuildId, number>;

export function createWorld(seed: number): WorldState {
  const state: WorldState = {
    rng: seed >>> 0,
    time: 0,
    nextId: 1,
    money: 0,
    pile: 0,
    stock: 0,
    totalEarned: 0,
    built: new Set(),
    paid: zeroPaid(),
    upgrades: { speed: 0, capacity: 0, cook: 0, price: 0 },
    player: { pos: copy(PLAYER.start), dir: { x: 0, y: 0 }, kind: null, count: 0, transfer: 0, attack: 0 },
    bears: [],
    meats: [],
    grills: GRILLS.map(() => ({ input: 0, output: 0, timer: 0 })),
    customers: [],
    workers: [],
    spawnTimer: 0,
    buyTimer: 0,
    events: [],
  };
  syncBears(state);
  return state;
}

/* ───────────── 파생 수치 ───────────── */

export const playerSpeed = (s: WorldState): number => PLAYER.speed * (1 + UPGRADES.speed.perLevel * s.upgrades.speed);
export const playerCapacity = (s: WorldState): number => PLAYER.capacity + UPGRADES.capacity.perLevel * s.upgrades.capacity;
export const cookSeconds = (s: WorldState): number => COOK.seconds / (1 + UPGRADES.cook.perLevel * s.upgrades.cook);
export const salePrice = (s: WorldState): number => Math.round(COUNTER.price * (1 + UPGRADES.price.perLevel * s.upgrades.price));
export const bearTarget = (s: WorldState): number => BEAR.baseCount + (s.built.has('field') ? 2 : 0);
export const grillBuilt = (s: WorldState, index: number): boolean => {
  const build = GRILLS[index].build;
  return build === null || s.built.has(build);
};
export const padVisible = (s: WorldState, id: BuildId): boolean => {
  const after = BUILDS[id].after;
  return !s.built.has(id) && (after === null || s.built.has(after));
};
export const upgradeCost = (id: UpgradeId, level: number): number =>
  Math.round(UPGRADES[id].baseCost * UPGRADES[id].costGrowth ** level);
const registerFactor = (s: WorldState): number => (s.built.has('register') ? 2 : 1);
export const atOffice = (s: WorldState): boolean => s.built.has('office') && dist(s.player.pos, OFFICE_PAD) < PAD_RADIUS;

/* ───────────── 곰 ───────────── */

function syncBears(state: WorldState): void {
  while (state.bears.length < bearTarget(state)) {
    const pos = randomIn(state, HUNT_FIELD);
    state.bears.push({ id: state.nextId++, pos, goal: copy(pos), pause: random(state) * 2, hp: BEAR.hp, respawn: 0 });
  }
}

function stepBears(state: WorldState, dt: number): void {
  for (const bear of state.bears) {
    if (bear.hp <= 0) {
      bear.respawn -= dt;
      if (bear.respawn <= 0) {
        bear.pos = randomIn(state, HUNT_FIELD);
        bear.goal = copy(bear.pos);
        bear.hp = BEAR.hp;
      }
      continue;
    }
    if (bear.pause > 0) {
      bear.pause -= dt;
      continue;
    }
    if (moveToward(bear.pos, bear.goal, BEAR.wanderSpeed * dt)) {
      bear.goal = randomIn(state, HUNT_FIELD);
      bear.pause = 0.8 + random(state) * 2;
    }
  }
}

function nearestBear(state: WorldState, from: Vec, range: number): Bear | null {
  let best: Bear | null = null;
  let bestD = range;
  for (const bear of state.bears) {
    if (bear.hp <= 0) continue;
    const d = dist(bear.pos, from);
    if (d <= bestD) {
      best = bear;
      bestD = d;
    }
  }
  return best;
}

function hitBear(state: WorldState, bear: Bear, by: 'player' | 'worker'): void {
  bear.hp -= PLAYER.damage;
  bear.pause = 0.4; // 맞으면 잠깐 멈칫한다
  state.events.push({ kind: 'hit', bear: bear.id, by });
  if (bear.hp > 0) return;
  bear.respawn = BEAR.respawnSeconds;
  state.events.push({ kind: 'bearDown', at: copy(bear.pos) });
  for (let i = 0; i < BEAR.meatDrop; i++) {
    const angle = random(state) * Math.PI * 2;
    state.meats.push({
      id: state.nextId++,
      pos: { x: bear.pos.x + Math.cos(angle) * 0.5, y: bear.pos.y + Math.sin(angle) * 0.5 },
    });
  }
}

/* ───────────── 운반 ───────────── */

const canTake = (c: Carrier, item: Item, cap: number): boolean => (c.kind === null || c.kind === item) && c.count < cap;

function give(c: Carrier, item: Item): void {
  c.kind = item;
  c.count++;
}

function takeOne(c: Carrier): void {
  c.count--;
  if (c.count <= 0) {
    c.count = 0;
    c.kind = null;
  }
}

function pickGroundMeat(state: WorldState, c: Carrier, cap: number, to: 'player' | number): void {
  if (!canTake(c, 'raw', cap)) return;
  const index = state.meats.findIndex((meat) => dist(meat.pos, c.pos) < 0.9);
  if (index < 0) return;
  const [meat] = state.meats.splice(index, 1);
  give(c, 'raw');
  state.events.push({ kind: 'pickup', item: 'raw', from: meat.pos, to });
}

/** 화로 패드: 날고기는 올리고, 손이 비었거나 구운 고기를 들고 있으면 구운 고기를 챙긴다 */
function workGrill(state: WorldState, c: Carrier, cap: number, index: number, to: 'player' | number): boolean {
  const grill = state.grills[index];
  const at = GRILLS[index].box;
  if (c.kind === 'raw' && grill.input < COOK.inputCap) {
    takeOne(c);
    grill.input++;
    state.events.push({ kind: 'drop', item: 'raw', from: copy(c.pos), to: at });
    return true;
  }
  if (c.kind !== 'raw' && grill.output > 0 && canTake(c, 'cooked', cap)) {
    grill.output--;
    give(c, 'cooked');
    state.events.push({ kind: 'pickup', item: 'cooked', from: at, to });
    return true;
  }
  return false;
}

function workCounter(state: WorldState, c: Carrier): boolean {
  if (c.kind !== 'cooked' || state.stock >= COUNTER.stockCap) return false;
  takeOne(c);
  state.stock++;
  state.events.push({ kind: 'drop', item: 'cooked', from: copy(c.pos), to: COUNTER_PAD });
  return true;
}

/** 패드 작업은 한 개씩, 짧은 간격으로. true 면 이번 틱에 뭔가 옮겼다 */
function workPads(state: WorldState, c: Carrier, cap: number, to: 'player' | number, dt: number): boolean {
  c.transfer -= dt;
  if (c.transfer > 0) return false;
  let moved = false;
  for (let i = 0; i < GRILLS.length && !moved; i++) {
    if (grillBuilt(state, i) && dist(c.pos, GRILLS[i].pad) < PAD_RADIUS) moved = workGrill(state, c, cap, i, to);
  }
  if (!moved && dist(c.pos, COUNTER_PAD) < PAD_RADIUS) moved = workCounter(state, c);
  if (moved) c.transfer = COOK.transferSeconds;
  return moved;
}

/* ───────────── 플레이어 ───────────── */

function stepPlayer(state: WorldState, dt: number): void {
  const p = state.player;
  const speed = playerSpeed(state);
  p.pos.x = clamp(p.pos.x + p.dir.x * speed * dt, WORLD.x0, WORLD.x1);
  p.pos.y = clamp(p.pos.y + p.dir.y * speed * dt, WORLD.y0, WORLD.y1);
  p.attack -= dt;
  const bear = nearestBear(state, p.pos, PLAYER.attackRange);
  if (bear && p.attack <= 0) {
    p.attack = PLAYER.attackSeconds;
    hitBear(state, bear, 'player');
  }
  pickGroundMeat(state, p, playerCapacity(state), 'player');
  workPads(state, p, playerCapacity(state), 'player', dt);
  if (state.pile > 0 && dist(p.pos, MONEY_PAD) < PAD_RADIUS) {
    state.money += state.pile;
    state.events.push({ kind: 'collect', amount: state.pile });
    state.pile = 0;
  }
  payPads(state, dt);
}

function payPads(state: WorldState, dt: number): void {
  for (const id of BUILD_ORDER) {
    const spec = BUILDS[id];
    if (!padVisible(state, id) || dist(state.player.pos, spec.pad) >= PAD_RADIUS) continue;
    const rate = Math.max(PAD_MIN_RATE, spec.cost / PAD_FILL_SECONDS);
    const amount = Math.min(rate * dt, state.money, spec.cost - state.paid[id]);
    if (amount <= 0) continue;
    state.money -= amount;
    state.paid[id] += amount;
    state.events.push({ kind: 'pay', build: id, amount });
    if (state.paid[id] >= spec.cost - 1e-6) build(state, id);
  }
}

function build(state: WorldState, id: BuildId): void {
  state.built.add(id);
  state.paid[id] = BUILDS[id].cost;
  state.events.push({ kind: 'built', build: id });
  if (id === 'carrier1' || id === 'carrier2') addWorker(state, 'carrier');
  if (id === 'hunter1') addWorker(state, 'hunter');
  syncBears(state);
}

function addWorker(state: WorldState, role: Worker['role']): void {
  const start = role === 'carrier' ? copy(COUNTER_PAD) : copy(PLAYER.start);
  state.workers.push({ id: state.nextId++, role, task: 'fetch', pos: start, kind: null, count: 0, transfer: 0, attack: 0 });
}

/* ───────────── 화로·손님 ───────────── */

function stepGrills(state: WorldState, dt: number): void {
  const seconds = cookSeconds(state);
  state.grills.forEach((grill, index) => {
    if (!grillBuilt(state, index) || grill.input <= 0 || grill.output >= COOK.outputCap) return;
    grill.timer += dt;
    if (grill.timer >= seconds) {
      grill.timer = 0;
      grill.input--;
      grill.output++;
      state.events.push({ kind: 'cooked', grill: index });
    }
  });
}

export const queueSlot = (index: number): Vec => ({
  x: QUEUE_HEAD.x + QUEUE_STEP.x * index,
  y: QUEUE_HEAD.y + QUEUE_STEP.y * index,
});

function stepCustomers(state: WorldState, dt: number): void {
  const factor = registerFactor(state);
  const waiting = state.customers.filter((c) => !c.leaving);
  state.spawnTimer -= dt * factor;
  if (state.spawnTimer <= 0 && waiting.length < COUNTER.queueMax + (factor - 1) * 2) {
    state.spawnTimer = COUNTER.spawnSeconds;
    const want = COUNTER.wantMin + Math.floor(random(state) * (COUNTER.wantMax - COUNTER.wantMin + 1));
    const tail = queueSlot(waiting.length + 2);
    state.customers.push({ id: state.nextId++, pos: copy(tail), want, got: 0, leaving: false });
  }
  waiting.forEach((c, index) => moveToward(c.pos, queueSlot(index), 2.2 * dt));
  serveHead(state, waiting[0], dt * factor);
  for (const c of state.customers) if (c.leaving) moveToward(c.pos, { x: WORLD.x1 + 3, y: c.pos.y + 1 }, 2.6 * dt);
  state.customers = state.customers.filter((c) => !c.leaving || c.pos.x < WORLD.x1 + 2.5);
}

function serveHead(state: WorldState, head: Customer | undefined, dt: number): void {
  if (!head || dist(head.pos, queueSlot(0)) > 0.15) return;
  state.buyTimer -= dt;
  if (state.buyTimer > 0 || state.stock <= 0) return;
  state.buyTimer = COUNTER.buySeconds;
  state.stock--;
  head.got++;
  const price = salePrice(state);
  state.pile += price;
  state.totalEarned += price;
  state.events.push({ kind: 'sale', amount: price, at: copy(head.pos) });
  if (head.got >= head.want) head.leaving = true;
}

/* ───────────── 직원 ───────────── */

function builtGrills(state: WorldState): number[] {
  return GRILLS.map((_, i) => i).filter((i) => grillBuilt(state, i));
}

function stepCarrier(state: WorldState, w: Worker, dt: number): void {
  const step = WORKER.speed * dt;
  if (w.task === 'fetch') {
    const grills = builtGrills(state);
    const target = grills.reduce((best, i) => (state.grills[i].output > state.grills[best].output ? i : best), grills[0]);
    if (moveToward(w.pos, GRILLS[target].pad, step)) {
      const moved = workPads(state, w, WORKER.capacity, w.id, dt);
      if (!moved && w.count > 0 && (w.count >= WORKER.capacity || state.grills[target].output === 0)) w.task = 'deliver';
    }
    return;
  }
  if (moveToward(w.pos, COUNTER_PAD, step)) {
    workPads(state, w, WORKER.capacity, w.id, dt);
    if (w.count === 0) w.task = 'fetch';
  }
}

function stepHunter(state: WorldState, w: Worker, dt: number): void {
  const step = WORKER.speed * dt;
  if (w.task === 'deliver') {
    const grills = builtGrills(state);
    const target = grills.reduce((best, i) => (state.grills[i].input < state.grills[best].input ? i : best), grills[0]);
    if (moveToward(w.pos, GRILLS[target].pad, step)) {
      workPads(state, w, WORKER.capacity, w.id, dt);
      if (w.count === 0) w.task = 'fetch';
    }
    return;
  }
  pickGroundMeat(state, w, WORKER.capacity, w.id);
  if (w.count >= WORKER.capacity) {
    w.task = 'deliver';
    return;
  }
  const meat = state.meats.reduce<Meat | null>((best, m) => (!best || dist(m.pos, w.pos) < dist(best.pos, w.pos) ? m : best), null);
  if (meat) {
    moveToward(w.pos, meat.pos, step);
    return;
  }
  const bear = nearestBear(state, w.pos, 99);
  if (!bear) return;
  w.attack -= dt;
  if (dist(w.pos, bear.pos) > 1.1) moveToward(w.pos, bear.pos, step);
  else if (w.attack <= 0) {
    w.attack = 0.6;
    hitBear(state, bear, 'worker');
  }
}

/* ───────────── 명령·진행 ───────────── */

/** 이동 방향(월드 좌표). 길이 1 을 넘으면 잘라 낸다 */
export function setInput(state: WorldState, x: number, y: number): void {
  const len = Math.hypot(x, y);
  const scale = len > 1 ? 1 / len : 1;
  state.player.dir = Number.isFinite(len) ? { x: x * scale, y: y * scale } : { x: 0, y: 0 };
}

export function buyUpgrade(state: WorldState, id: UpgradeId): boolean {
  if (!atOffice(state)) return false;
  const level = state.upgrades[id];
  if (level >= UPGRADES[id].maxLevel) return false;
  const cost = upgradeCost(id, level);
  if (state.money < cost) return false;
  state.money -= cost;
  state.upgrades[id]++;
  return true;
}

export function step(state: WorldState): void {
  const dt = TICK;
  state.time += dt;
  stepBears(state, dt);
  stepPlayer(state, dt);
  for (const w of state.workers) {
    if (w.role === 'carrier') stepCarrier(state, w, dt);
    else stepHunter(state, w, dt);
  }
  stepGrills(state, dt);
  stepCustomers(state, dt);
}

export function drainEvents(state: WorldState): WorldEvent[] {
  const events = state.events;
  state.events = [];
  return events;
}

/* ───────────── 안내 ───────────── */

export interface Objective {
  readonly text: string;
  readonly target: Vec | null;
}

/** 지금 할 일 한 가지. 장르 특성상 화살표 안내가 없으면 처음 30초에 길을 잃는다 */
export function objective(state: WorldState): Objective {
  const p = state.player;
  if (state.pile > 0 && (state.pile >= 20 || state.money < 30)) return { text: '돈을 주우세요', target: MONEY_PAD };
  const next = BUILD_ORDER.find((id) => padVisible(state, id) && state.money + state.paid[id] >= BUILDS[id].cost);
  if (next && p.kind === null) return { text: `${BUILDS[next].name} 열기`, target: BUILDS[next].pad };
  if (p.kind === 'cooked') return { text: '카운터에 스테이크를 내려놓으세요', target: COUNTER_PAD };
  if (p.kind === 'raw' && (p.count >= playerCapacity(state) || state.meats.length === 0)) {
    const emptiest = builtGrills(state).reduce((best, i) => (state.grills[i].input < state.grills[best].input ? i : best));
    return { text: '화로에 고기를 올리세요', target: GRILLS[emptiest].pad };
  }
  const ready = builtGrills(state).find((i) => state.grills[i].output > 0);
  if (ready !== undefined && p.kind === null) return { text: '구운 고기를 챙기세요', target: GRILLS[ready].pad };
  const meat = state.meats[0];
  if (meat) return { text: '고기를 주우세요', target: meat.pos };
  const bear = nearestBear(state, p.pos, 99);
  return { text: '북극곰을 사냥하세요', target: bear ? bear.pos : null };
}

/* ───────────── 저장 ───────────── */

export const SAVE_KEY = 'arctic-diner-v1';

export function serialize(state: WorldState): string {
  return JSON.stringify({
    version: 1,
    rng: state.rng,
    money: state.money,
    pile: state.pile,
    stock: state.stock,
    totalEarned: state.totalEarned,
    built: [...state.built],
    paid: state.paid,
    upgrades: state.upgrades,
    grills: state.grills.map((g) => ({ input: g.input, output: g.output })),
    carry: { kind: state.player.kind, count: state.player.count },
  });
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, lo: number, hi: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : lo;

/** 손상·조작된 저장은 항목별로 기본값에 수렴한다. 예외를 던지지 않는다 */
export function parse(raw: string | null, seed: number): WorldState {
  const state = createWorld(seed);
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    return state;
  }
  if (!isRecord(data) || data.version !== 1) return state;
  state.rng = Math.floor(num(data.rng, 0, 0xffffffff));
  state.money = num(data.money, 0, 1e12);
  state.pile = num(data.pile, 0, 1e12);
  state.stock = Math.floor(num(data.stock, 0, COUNTER.stockCap));
  state.totalEarned = num(data.totalEarned, 0, 1e15);
  const built = Array.isArray(data.built) ? data.built : [];
  for (const id of BUILD_ORDER) if (built.includes(id)) state.built.add(id);
  const paid = isRecord(data.paid) ? data.paid : {};
  for (const id of BUILD_ORDER) state.paid[id] = state.built.has(id) ? BUILDS[id].cost : num(paid[id], 0, BUILDS[id].cost - 1);
  const upgrades = isRecord(data.upgrades) ? data.upgrades : {};
  for (const id of UPGRADE_ORDER) state.upgrades[id] = Math.floor(num(upgrades[id], 0, UPGRADES[id].maxLevel));
  const grills = Array.isArray(data.grills) ? data.grills : [];
  state.grills.forEach((g, i) => {
    const saved: unknown = grills[i];
    if (!isRecord(saved)) return;
    g.input = Math.floor(num(saved.input, 0, COOK.inputCap));
    g.output = Math.floor(num(saved.output, 0, COOK.outputCap));
  });
  const carry = isRecord(data.carry) ? data.carry : {};
  const kind = carry.kind === 'raw' || carry.kind === 'cooked' ? carry.kind : null;
  state.player.count = kind ? Math.floor(num(carry.count, 0, playerCapacity(state))) : 0;
  state.player.kind = state.player.count > 0 ? kind : null;
  if (state.built.has('carrier1')) addWorker(state, 'carrier');
  if (state.built.has('carrier2')) addWorker(state, 'carrier');
  if (state.built.has('hunter1')) addWorker(state, 'hunter');
  syncBears(state);
  return state;
}
