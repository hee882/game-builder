/**
 * 시뮬레이션 내부 상태. 계약(contract.ts)의 읽기 전용 뷰와 달리 여기서는 전부 가변이다.
 *
 * 금지: DOM · Math.random · Date · performance. 시간은 고정 스텝 인자로만 들어온다.
 */
import {
  CORE_ROW_ANCHOR,
  GRID_H,
  GRID_W,
  MAX_ENEMIES,
  TILE_COUNT,
  type AutomationKey,
  type BuildingId,
  type ChapterId,
  type DiscoveryId,
  type EnemyRole,
  type EnemyVariant,
  type PerkId,
  type Phase,
  type SimEvent,
  type TargetPolicy,
  type TechId,
  type TileIndex,
} from './contract.ts';
import {
  BUILDINGS,
  CORE,
  ECONOMY,
  ENEMIES,
  PERK_EFFECTS,
  SUB,
  TECH_EFFECTS,
  TERRAIN,
  VARIANTS,
  WALL_HP_UPGRADE_FACTOR,
  WRECK,
  chapterSpec,
  coreCenter,
  groundWallCosts,
  isForwardTile,
  parseLayout,
  tileIndex,
  tileX,
  tileY,
  waveSpec,
} from './content.ts';
import { FieldCache, type CostInput } from './path.ts';

export const MAX_SHOTS = 64;
export const MAX_DRONES = 9;

export interface MutVec {
  x: number;
  y: number;
}

export interface EnemyState {
  active: boolean;
  id: number;
  role: EnemyRole;
  variant: EnemyVariant;
  pos: MutVec;
  prev: MutVec;
  hp: number;
  maxHp: number;
  speed: number;
  armor: number;
  facing: number;
  slowTicks: number;
  breaching: boolean;
  flying: boolean;
  wallCost: number;
  wallDps: number;
  coreDamage: number;
  biomass: number;
  summonTimer: number;
  summonsLeft: number;
}

export interface BuildingState {
  tile: TileIndex;
  id: BuildingId;
  level: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  charge: number;
  aim: number;
  policy: TargetPolicy;
  onThermal: boolean;
  investedScrap: number;
  investedBiomass: number;
}

export interface ShotState {
  active: boolean;
  from: MutVec;
  to: MutVec;
  kind: 'harpoon' | 'mortar' | 'resonator' | 'pulse';
  life: number;
}

export interface DroneState {
  active: boolean;
  pos: MutVec;
  prev: MutVec;
  role: 'harvest' | 'repair';
  carrying: number;
  targetTile: TileIndex;
}

export interface WreckState {
  tile: TileIndex;
  richness: number;
  forward: boolean;
}

export interface SpawnOrder {
  role: EnemyRole;
  variant: EnemyVariant;
  vent: TileIndex;
}

export interface SubState {
  pos: MutVec;
  prev: MutVec;
  target: MutVec;
  hp: number;
  downedTicks: number;
  harvesting: boolean;
  fireCooldown: number;
  cooldowns: { sonarPulse: number; weld: number };
}

export interface SimState {
  seed: number;
  rngState: number;
  tick: number;
  chapter: ChapterId;
  phase: Phase;
  wave: number;
  wavesCleared: number;

  terrain: Int8Array;
  flooded: Int8Array;
  walls: Uint8Array;
  structures: Uint8Array;
  coreTiles: TileIndex[];
  ventTiles: TileIndex[];
  core: MutVec;

  fields: FieldCache;
  fieldVersion: number;
  fieldDirty: boolean;

  buildings: Map<TileIndex, BuildingState>;
  enemies: EnemyState[];
  shots: ShotState[];
  drones: DroneState[];
  wrecks: WreckState[];
  sub: SubState;

  scrap: number;
  biomass: number;
  coreHp: number;

  reserveTotal: number;
  reserveRemaining: number;
  harvestedThisCycle: number;
  reserveExhaustedNotified: boolean;
  offlineGranted: number;

  buildSeconds: number;
  earlyBonusActive: boolean;
  spawnQueue: SpawnOrder[];
  spawnTimer: number;
  spawnInterval: number;
  leaksThisWave: number;
  coreDamageThisWave: number;
  consecutiveFlawless: number;
  /** 전방 잔해를 직접 캔 누적 초. 해금 조건이 아니라 «암시 힌트» 진행률에만 쓴다. */
  forwardHarvestSeconds: number;

  researched: Set<TechId>;
  automation: Record<AutomationKey, number>;
  unlockedBuildings: Set<BuildingId>;
  discovered: Set<DiscoveryId>;
  insight: number;
  perks: Record<PerkId, number>;
  best: { wave: number; chapter: ChapterId; elapsed: number };

  waveStartBuildings: { tile: TileIndex; id: BuildingId; level: number }[];
  retryAttempts: number;
  destroyedWalls: TileIndex[];
  wallRebuildTimer: number;

  stats: {
    manualSalvage: number;
    autoSalvage: number;
    kills: number;
    wallsLost: number;
    perfects: number;
    abilityUses: number;
    leaks: number;
    elapsed: number;
  };

  events: SimEvent[];
  nextEnemyId: number;
}

/* ─────────────────────────── 난수(시드 고정) ─────────────────────────── */

export function nextRandom(state: SimState): number {
  // mulberry32 — Math.random 금지 규칙을 지키면서 저장·복원 가능한 결정적 난수
  state.rngState = (state.rngState + 0x6d2b79f5) | 0;
  let t = state.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(state: SimState, maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  return Math.min(maxExclusive - 1, Math.floor(nextRandom(state) * maxExclusive));
}

/* ─────────────────────────── 생성 ─────────────────────────── */

function emptyEnemy(): EnemyState {
  return {
    active: false,
    id: 0,
    role: 'drifter',
    variant: 'base',
    pos: { x: 0, y: 0 },
    prev: { x: 0, y: 0 },
    hp: 0,
    maxHp: 1,
    speed: 0,
    armor: 0,
    facing: Math.PI / 2,
    slowTicks: 0,
    breaching: false,
    flying: false,
    wallCost: 0,
    wallDps: 0,
    coreDamage: 0,
    biomass: 0,
    summonTimer: 0,
    summonsLeft: 0,
  };
}

export function createState(seed: number): SimState {
  const state: SimState = {
    seed: seed >>> 0,
    rngState: seed >>> 0,
    tick: 0,
    chapter: 1,
    phase: 'build',
    wave: 1,
    wavesCleared: 0,
    terrain: new Int8Array(TILE_COUNT),
    flooded: new Int8Array(TILE_COUNT),
    walls: new Uint8Array(TILE_COUNT),
    structures: new Uint8Array(TILE_COUNT),
    coreTiles: [],
    ventTiles: [],
    core: { x: GRID_W / 2, y: CORE_ROW_ANCHOR + 1 },
    fields: new FieldCache(groundWallCosts()),
    fieldVersion: 0,
    fieldDirty: true,
    buildings: new Map(),
    enemies: Array.from({ length: MAX_ENEMIES }, emptyEnemy),
    shots: Array.from({ length: MAX_SHOTS }, () => ({
      active: false,
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 },
      kind: 'harpoon' as const,
      life: 0,
    })),
    drones: Array.from({ length: MAX_DRONES }, () => ({
      active: false,
      pos: { x: 0, y: 0 },
      prev: { x: 0, y: 0 },
      role: 'harvest' as const,
      carrying: 0,
      targetTile: -1,
    })),
    wrecks: [],
    sub: {
      pos: { x: 0, y: 0 },
      prev: { x: 0, y: 0 },
      target: { x: 0, y: 0 },
      hp: SUB.maxHp,
      downedTicks: 0,
      harvesting: false,
      fireCooldown: 0,
      cooldowns: { sonarPulse: 0, weld: 0 },
    },
    scrap: ECONOMY.startScrap,
    biomass: 0,
    coreHp: CORE.maxHp,
    reserveTotal: 0,
    reserveRemaining: 0,
    harvestedThisCycle: 0,
    reserveExhaustedNotified: false,
    offlineGranted: 0,
    buildSeconds: 0,
    earlyBonusActive: false,
    spawnQueue: [],
    spawnTimer: 0,
    spawnInterval: 1,
    leaksThisWave: 0,
    coreDamageThisWave: 0,
    consecutiveFlawless: 0,
    forwardHarvestSeconds: 0,
    researched: new Set(),
    automation: { droneRole: 0, autoRebuildWalls: 0 },
    unlockedBuildings: new Set(),
    discovered: new Set(),
    insight: 0,
    perks: { startScrap: 0, subSpeed: 0, wallHp: 0 },
    best: { wave: 0, chapter: 1, elapsed: 0 },
    waveStartBuildings: [],
    retryAttempts: 0,
    destroyedWalls: [],
    wallRebuildTimer: 0,
    stats: {
      manualSalvage: 0,
      autoSalvage: 0,
      kills: 0,
      wallsLost: 0,
      perfects: 0,
      abilityUses: 0,
      leaks: 0,
      elapsed: 0,
    },
    events: [],
    nextEnemyId: 1,
  };
  loadChapter(state, 1);
  refreshUnlocks(state);
  return state;
}

/** 장 전환·초기화에서 지형·잔해·잠수정 위치를 다시 세운다. 건물은 유지하지 않는다. */
export function loadChapter(state: SimState, chapter: ChapterId): void {
  const parsed = parseLayout(chapterSpec(chapter).layout);
  state.chapter = chapter;
  state.terrain = parsed.terrain;
  state.coreTiles = [...parsed.coreTiles];
  state.ventTiles = [...parsed.ventTiles];
  state.core = coreCenter(parsed.coreTiles);
  state.walls = new Uint8Array(TILE_COUNT);
  state.structures = new Uint8Array(TILE_COUNT);
  state.flooded = new Int8Array(TILE_COUNT);
  state.buildings.clear();
  state.destroyedWalls = [];
  state.wrecks = parsed.wreckTiles.map((tile) => ({ tile, richness: 1, forward: isForwardTile(tile) }));
  state.sub.pos.x = state.core.x;
  state.sub.pos.y = state.core.y - 1;
  state.sub.prev.x = state.sub.pos.x;
  state.sub.prev.y = state.sub.pos.y;
  state.sub.target.x = state.sub.pos.x;
  state.sub.target.y = state.sub.pos.y;
  state.sub.hp = SUB.maxHp;
  state.sub.downedTicks = 0;
  for (const enemy of state.enemies) enemy.active = false;
  for (const shot of state.shots) shot.active = false;
  markFieldDirty(state);
}

export function markFieldDirty(state: SimState): void {
  state.fieldDirty = true;
  state.fieldVersion++;
}

export function costInput(state: SimState): CostInput {
  return { terrain: state.terrain, walls: state.walls, structures: state.structures };
}

/** 스텝 시작 시 1회만 호출 — 한 스텝에 건설이 여러 번 들어와도 Dijkstra는 한 번만 돈다. */
export function ensureFields(state: SimState): void {
  if (!state.fieldDirty) return;
  state.fields.rebuild(costInput(state), state.coreTiles);
  state.fieldDirty = false;
}

/* ─────────────────────────── 타일·좌표 ─────────────────────────── */

export const inBounds = (tile: TileIndex): boolean => Number.isInteger(tile) && tile >= 0 && tile < TILE_COUNT;

export function tileAtPoint(x: number, y: number): TileIndex {
  const tx = Math.min(GRID_W - 1, Math.max(0, Math.floor(x)));
  const ty = Math.min(GRID_H - 1, Math.max(0, Math.floor(y)));
  return tileIndex(tx, ty);
}

export const tileCenterX = (tile: TileIndex): number => tileX(tile) + 0.5;
export const tileCenterY = (tile: TileIndex): number => tileY(tile) + 0.5;

export function isBuildableTerrain(state: SimState, tile: TileIndex): boolean {
  const kind = state.terrain[tile];
  return kind === TERRAIN.water || kind === TERRAIN.thermal;
}

export function hasWreckNeighbor(state: SimState, tile: TileIndex): boolean {
  const x = tileX(tile);
  const y = tileY(tile);
  const steps = [
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
  ];
  for (const [dx, dy] of steps) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
    if (state.terrain[tileIndex(nx, ny)] === TERRAIN.wreck) return true;
  }
  return false;
}

/* ─────────────────────────── 건물 파생 수치 ─────────────────────────── */

export function wallHpMultiplier(state: SimState): number {
  const perk = 1 + state.perks.wallHp * PERK_EFFECTS.wallHpPerLevel;
  const tech = state.researched.has('reinforcedWalls') ? TECH_EFFECTS.reinforcedWallsHp : 1;
  return perk * tech;
}

export function buildingMaxHp(state: SimState, id: BuildingId, level: number): number {
  const spec = BUILDINGS[id];
  if (id === 'bulkhead') {
    return spec.maxHp * Math.pow(WALL_HP_UPGRADE_FACTOR, level) * wallHpMultiplier(state);
  }
  return spec.maxHp * Math.pow(ECONOMY.upgradeEffectFactor, level);
}

export function buildingDamage(state: SimState, building: BuildingState): number {
  const spec = BUILDINGS[building.id];
  if (spec.damage <= 0) return 0;
  const level = Math.pow(ECONOMY.upgradeEffectFactor, building.level);
  const thermal = building.onThermal ? 1.15 : 1;
  return spec.damage * level * thermal;
}

export function buildingSplash(state: SimState, building: BuildingState): number {
  const spec = BUILDINGS[building.id];
  if (spec.splashRadius <= 0) return 0;
  const wide = building.id === 'mortar' && state.researched.has('wideBlast') ? TECH_EFFECTS.wideBlastRadius : 0;
  return spec.splashRadius + wide;
}

export function buildingPierces(state: SimState, building: BuildingState): boolean {
  if (BUILDINGS[building.id].piercesArmor) return true;
  return building.id === 'harpoon' && state.researched.has('piercingHarpoon');
}

export function collectorRate(state: SimState, building: BuildingState): number {
  const spec = BUILDINGS[building.id];
  if (spec.salvagePerSecond <= 0) return 0;
  return spec.salvagePerSecond * Math.pow(ECONOMY.upgradeEffectFactor, building.level);
}

export function upgradeCost(id: BuildingId, level: number): { scrap: number; biomass: number } {
  const spec = BUILDINGS[id];
  const factor = Math.pow(ECONOMY.upgradeCostFactor, level + 1);
  return {
    scrap: Math.round(spec.cost.scrap * factor),
    biomass: Math.round(spec.cost.biomass * factor),
  };
}

/** 장갑 적용 후 실제 피해. 장갑이 전략을 삭제하지 않도록 하한을 둔다. */
export function damageAfterArmor(raw: number, armor: number, pierces: boolean): number {
  if (pierces || armor <= 0) return raw;
  const floor = Math.max(ECONOMY.minDamageFlat, raw * ECONOMY.minDamageRatio);
  return Math.max(floor, raw - armor);
}

export function enemyScaledHp(role: EnemyRole, variant: EnemyVariant, wave: number, growth: number): number {
  const spec = ENEMIES[role];
  const mod = VARIANTS[variant];
  return spec.hp * mod.hpMultiplier * (1 + growth * Math.max(0, wave - 1));
}

export function subSpeed(state: SimState): number {
  const perk = 1 + state.perks.subSpeed * PERK_EFFECTS.subSpeedPerLevel;
  const relic = state.discovered.has('deepArchaeology') ? 1.2 : 1;
  return SUB.speed * perk * relic;
}

export function abilityCooldownScale(state: SimState): number {
  return state.discovered.has('deepArchaeology') ? 0.85 : 1;
}

export function wreckYield(state: SimState, wreck: WreckState): number {
  const forward = wreck.forward ? ECONOMY.forwardWreckMultiplier : 1;
  return ECONOMY.manualSalvagePerSecond * forward * Math.max(WRECK.richnessFloor, wreck.richness);
}

/* ─────────────────────────── 해금 ─────────────────────────── */

export function refreshUnlocks(state: SimState): void {
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const rule = BUILDINGS[id].unlock;
    const already = state.unlockedBuildings.has(id);
    let open = false;
    if (rule.kind === 'start') open = true;
    else if (rule.kind === 'waveClear') open = state.wavesCleared >= rule.wave;
    else open = state.discovered.has(rule.id);
    if (open && !already) {
      state.unlockedBuildings.add(id);
      state.events.push({ kind: 'unlocked', building: id, at: { x: state.core.x, y: state.core.y } });
    }
  }
}

export function automationUnlocked(state: SimState): AutomationKey[] {
  const keys: AutomationKey[] = [];
  let hasBay = false;
  for (const building of state.buildings.values()) if (building.id === 'droneBay') hasBay = true;
  if (hasBay) keys.push('droneRole');
  if (state.researched.has('reinforcedWalls')) keys.push('autoRebuildWalls');
  return keys;
}

export function droneCount(state: SimState): number {
  let count = 0;
  for (const building of state.buildings.values()) {
    if (building.id === 'droneBay') count += Math.min(3, building.level + 1);
  }
  return Math.min(MAX_DRONES, count);
}

/* ─────────────────────────── 웨이브 큐 ─────────────────────────── */

export function buildSpawnQueue(state: SimState, wave: number): SpawnOrder[] {
  const spec = waveSpec(wave);
  const orders: SpawnOrder[] = [];
  const vents = state.ventTiles.length > 0 ? state.ventTiles : [tileIndex(Math.floor(GRID_W / 2), 0)];
  let ventCursor = randomInt(state, vents.length);
  for (const entry of spec.composition) {
    for (let i = 0; i < entry.count; i++) {
      orders.push({ role: entry.role, variant: entry.variant, vent: vents[ventCursor % vents.length] });
      ventCursor++;
    }
  }
  return orders;
}

export function spawnEnemy(state: SimState, order: SpawnOrder, wave: number, growth: number): EnemyState | null {
  const slot = state.enemies.find((enemy) => !enemy.active);
  if (!slot) return null; // MAX_ENEMIES 상한 — 생성을 건너뛴다(폭증 방지)
  const spec = ENEMIES[order.role];
  const mod = VARIANTS[order.variant];
  slot.active = true;
  slot.id = state.nextEnemyId++;
  slot.role = order.role;
  slot.variant = order.variant;
  slot.pos.x = tileCenterX(order.vent);
  slot.pos.y = tileCenterY(order.vent);
  slot.prev.x = slot.pos.x;
  slot.prev.y = slot.pos.y;
  slot.maxHp = enemyScaledHp(order.role, order.variant, wave, growth);
  slot.hp = slot.maxHp;
  slot.speed = spec.speed * mod.speedMultiplier;
  slot.armor = mod.flatArmor;
  slot.facing = Math.PI / 2;
  slot.slowTicks = 0;
  slot.breaching = false;
  slot.flying = spec.flying;
  slot.wallCost = spec.wallCost;
  slot.wallDps = spec.wallDps;
  slot.coreDamage = spec.coreDamage;
  slot.biomass = spec.biomass;
  slot.summonTimer = 0;
  slot.summonsLeft = order.role === 'leviathan' ? 20 : 0;
  return slot;
}

export function activeEnemyCount(state: SimState): number {
  let count = 0;
  for (const enemy of state.enemies) if (enemy.active) count++;
  return count;
}

export function pushShot(
  state: SimState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  kind: ShotState['kind'],
): void {
  const slot = state.shots.find((shot) => !shot.active);
  if (!slot) return;
  slot.active = true;
  slot.from.x = fromX;
  slot.from.y = fromY;
  slot.to.x = toX;
  slot.to.y = toY;
  slot.kind = kind;
  slot.life = 1;
}
