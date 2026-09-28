/**
 * 심해 전초기지 — 데이터 테이블. 모든 밸런스 숫자의 단일 출처.
 *
 * 근거: docs/outpost-decisions.md §3(경제·해금 수치), §6.5(웨이브 표).
 * 여기 있는 숫자 외에 sim/path/save 어디에도 매직 넘버를 두지 않는다.
 */
import {
  GRID_H,
  GRID_W,
  type BuildingCatalog,
  type BuildingId,
  type ChapterId,
  type ChapterSpec,
  type DiscoveryId,
  type EconomyTuning,
  type EnemyCatalog,
  type EnemyRole,
  type PathClass,
  type PerkCatalog,
  type TechCatalog,
  type TechId,
  type TerrainKind,
  type TileIndex,
  type VariantTable,
  type WaveSpec,
} from './contract.ts';

/* ─────────────────────────── 지형 ─────────────────────────── */

/** terrain Int8Array 에 들어가는 값. TerrainKind 순서와 1:1 */
export const TERRAIN_KINDS: readonly TerrainKind[] = ['water', 'rock', 'core', 'vent', 'wreck', 'thermal'];
export const TERRAIN = { water: 0, rock: 1, core: 2, vent: 3, wreck: 4, thermal: 5 } as const;

/** 레이아웃 문자 → terrain 값 */
export const LAYOUT_LEGEND: Readonly<Record<string, number>> = {
  '.': TERRAIN.water,
  '#': TERRAIN.rock,
  C: TERRAIN.core,
  V: TERRAIN.vent,
  W: TERRAIN.wreck,
  T: TERRAIN.thermal,
};

/**
 * 1장 «대륙붕 잔해» — 코어 2×2가 아래(행 9~10), 분출구는 위(행 0).
 * 행 6의 암반이 천연 3레인 초크(개방 열 0 / 3,4,5 / 8)를 만든다.
 */
const CHAPTER1_LAYOUT: readonly string[] = [
  '.V.....V.',
  '.........',
  '..T...T..',
  'W.......W',
  '..#...#..',
  '.........',
  '.##...##.',
  'W.......W',
  '....T....',
  '...CC....',
  '...CC....',
  '.##...##.',
];

/** 2장 «열수 분출구» — 분출구 3곳, 천연 초크 없음. 벽으로 직접 만들어야 한다. */
const CHAPTER2_LAYOUT: readonly string[] = [
  '.V..V..V.',
  '.........',
  'W.......W',
  '...T.T...',
  '.#.....#.',
  '.........',
  '...W.W...',
  '.........',
  '.T.....T.',
  '....CC...',
  '....CC...',
  '.#.....#.',
];

export const CHAPTERS: readonly ChapterSpec[] = [
  { id: 1, layout: CHAPTER1_LAYOUT, waves: [1, 2, 3, 4] },
  { id: 2, layout: CHAPTER2_LAYOUT, waves: [5, 6, 7, 8] },
];

export function chapterSpec(chapter: ChapterId): ChapterSpec {
  return CHAPTERS[chapter - 1] ?? CHAPTERS[0];
}

/** 전방 = 분출구 쪽 행 0~3. 전방 잔해는 산출이 높고 전방 열수는 공명기 거점이다. */
export const FORWARD_ROWS = 3;
export const tileX = (tile: TileIndex): number => tile % GRID_W;
export const tileY = (tile: TileIndex): number => Math.floor(tile / GRID_W);
export const tileIndex = (x: number, y: number): TileIndex => y * GRID_W + x;
export const isForwardTile = (tile: TileIndex): boolean => tileY(tile) <= FORWARD_ROWS;

/* ─────────────────────────── 건물 ─────────────────────────── */

export const BUILDINGS: BuildingCatalog = {
  bulkhead: {
    id: 'bulkhead',
    cost: { scrap: 12, biomass: 0 },
    maxHp: 120,
    maxLevel: 2,
    damage: 0,
    fireInterval: 0,
    range: 0,
    minRange: 0,
    splashRadius: 0,
    targets: 'none',
    piercesArmor: false,
    requiresWreckAdjacent: false,
    requiresThermal: false,
    salvagePerSecond: 0,
    unlock: { kind: 'start' },
  },
  collector: {
    id: 'collector',
    cost: { scrap: 30, biomass: 0 },
    maxHp: 70,
    maxLevel: 2,
    damage: 0,
    fireInterval: 0,
    range: 0,
    minRange: 0,
    splashRadius: 0,
    targets: 'none',
    piercesArmor: false,
    requiresWreckAdjacent: true,
    requiresThermal: false,
    salvagePerSecond: 3.2,
    unlock: { kind: 'start' },
  },
  harpoon: {
    id: 'harpoon',
    cost: { scrap: 45, biomass: 0 },
    maxHp: 90,
    maxLevel: 2,
    damage: 9,
    fireInterval: 0.8,
    range: 3,
    minRange: 0,
    splashRadius: 0,
    targets: 'both',
    piercesArmor: false,
    requiresWreckAdjacent: false,
    requiresThermal: false,
    salvagePerSecond: 0,
    unlock: { kind: 'start' },
  },
  mortar: {
    id: 'mortar',
    cost: { scrap: 80, biomass: 10 },
    maxHp: 110,
    maxLevel: 2,
    damage: 22,
    fireInterval: 1.8,
    range: 4,
    minRange: 1.2,
    splashRadius: 1.3,
    targets: 'ground',
    piercesArmor: false,
    requiresWreckAdjacent: false,
    requiresThermal: false,
    salvagePerSecond: 0,
    unlock: { kind: 'waveClear', wave: 2 },
  },
  droneBay: {
    id: 'droneBay',
    cost: { scrap: 100, biomass: 20 },
    maxHp: 130,
    maxLevel: 2,
    damage: 0,
    fireInterval: 0,
    range: 0,
    minRange: 0,
    splashRadius: 0,
    targets: 'none',
    piercesArmor: false,
    requiresWreckAdjacent: false,
    requiresThermal: false,
    salvagePerSecond: 0,
    unlock: { kind: 'waveClear', wave: 3 },
  },
  resonator: {
    id: 'resonator',
    cost: { scrap: 110, biomass: 30 },
    maxHp: 90,
    maxLevel: 2,
    damage: 14,
    fireInterval: 1.6,
    // 전진 배치가 실제로 두 레인을 덮어야 «전진 열수 공명기» 전략이 성립한다(1.8이면 옆 레인이 사각).
    range: 2.2,
    minRange: 0,
    splashRadius: 2, // 사거리 안 전체를 때리는 공명 펄스(방어 무시)
    targets: 'both',
    piercesArmor: true,
    requiresWreckAdjacent: false,
    requiresThermal: true,
    salvagePerSecond: 0,
    unlock: { kind: 'discovery', id: 'ventResonance' },
  },
};

export const BUILDING_IDS: readonly BuildingId[] = [
  'bulkhead',
  'collector',
  'harpoon',
  'mortar',
  'droneBay',
  'resonator',
];

/** 격벽은 HP만 오른다(×1.7). 나머지는 ECONOMY.upgradeEffectFactor. */
export const WALL_HP_UPGRADE_FACTOR = 1.7;

/* ─────────────────────────── 적 ─────────────────────────── */

export const ENEMIES: EnemyCatalog = {
  drifter: {
    role: 'drifter',
    hp: 30,
    speed: 0.8,
    pathClass: 'ground',
    wallCost: 400,
    wallDps: 6,
    coreDamage: 6,
    biomass: 3,
    flying: false,
  },
  swarm: {
    role: 'swarm',
    hp: 10,
    speed: 1.2,
    pathClass: 'ground',
    wallCost: 600,
    wallDps: 3,
    coreDamage: 2,
    biomass: 1,
    flying: false,
  },
  breacher: {
    role: 'breacher',
    hp: 90,
    speed: 0.5,
    pathClass: 'breaker',
    // 9×12에서 옆 레인 우회 비용은 20~40(2~4타일)뿐이다. 40이면 굴착체가 표류체처럼 돌아가 버려
    // «미로를 정면에서 해체한다»는 역할이 사라진다. 12 = 1타일 우회보다 싸게 뚫는다.
    wallCost: 12,
    wallDps: 18,
    coreDamage: 10,
    biomass: 9,
    flying: false,
  },
  glider: {
    role: 'glider',
    hp: 45,
    speed: 0.95,
    pathClass: 'flyer',
    wallCost: 0,
    wallDps: 0,
    coreDamage: 6,
    biomass: 5,
    flying: true,
  },
  leviathan: {
    role: 'leviathan',
    hp: 860,
    speed: 0.4,
    pathClass: 'breaker',
    wallCost: 6, // 보스는 거의 항상 직선으로 부수고 온다
    wallDps: 60,
    coreDamage: 40,
    biomass: 60,
    flying: false,
  },
};

export const ENEMY_ROLES: readonly EnemyRole[] = ['drifter', 'swarm', 'breacher', 'glider', 'leviathan'];

export const VARIANTS: VariantTable = {
  base: { hpMultiplier: 1, speedMultiplier: 1, flatArmor: 0 },
  elite: { hpMultiplier: 1.35, speedMultiplier: 1.15, flatArmor: 3 },
};

/**
 * 속도는 9×12 그리드에 맞춘 값이다(원안 수치는 20행 기준이라 12행에서는 6~7초면 코어에 닿았다).
 * 분출구→코어 거리 11~13타일 기준으로 표류체가 약 15초 걸린다.
 */

/** 적 HP 스케일: base × (1 + HP_GROWTH × (wave − 1)) */
export const HP_GROWTH_PER_WAVE = 0.2;

/** 보스가 주기적으로 소환하는 군체 */
export const BOSS_SUMMON = { everySeconds: 3, count: 2, total: 20, role: 'swarm' as EnemyRole };

/* ─────────────────────────── 웨이브 ─────────────────────────── */

export const WAVES: readonly WaveSpec[] = [
  {
    index: 1,
    chapter: 1,
    composition: [{ role: 'drifter', variant: 'base', count: 6 }],
    spawnInterval: 0.7,
    rewardScrap: 40,
    salvageReserve: 70,
  },
  {
    index: 2,
    chapter: 1,
    composition: [
      { role: 'drifter', variant: 'base', count: 8 },
      { role: 'swarm', variant: 'base', count: 10 },
    ],
    spawnInterval: 0.65,
    rewardScrap: 50,
    salvageReserve: 90,
  },
  {
    index: 3,
    chapter: 1,
    composition: [
      { role: 'breacher', variant: 'base', count: 2 },
      { role: 'drifter', variant: 'base', count: 6 },
    ],
    spawnInterval: 0.8,
    rewardScrap: 60,
    salvageReserve: 110,
  },
  {
    index: 4,
    chapter: 1,
    composition: [
      { role: 'glider', variant: 'base', count: 6 },
      { role: 'swarm', variant: 'base', count: 12 },
    ],
    spawnInterval: 0.7,
    rewardScrap: 75,
    salvageReserve: 130,
  },
  {
    index: 5,
    chapter: 2,
    composition: [
      { role: 'drifter', variant: 'elite', count: 10 },
      { role: 'breacher', variant: 'base', count: 3 },
    ],
    spawnInterval: 0.8,
    rewardScrap: 90,
    salvageReserve: 150,
  },
  {
    index: 6,
    chapter: 2,
    composition: [
      { role: 'glider', variant: 'elite', count: 8 },
      { role: 'swarm', variant: 'elite', count: 16 },
    ],
    spawnInterval: 0.6,
    rewardScrap: 105,
    salvageReserve: 170,
  },
  {
    index: 7,
    chapter: 2,
    composition: [
      { role: 'breacher', variant: 'elite', count: 4 },
      { role: 'drifter', variant: 'elite', count: 8 },
      { role: 'glider', variant: 'base', count: 5 },
    ],
    spawnInterval: 0.7,
    rewardScrap: 125,
    salvageReserve: 190,
  },
  {
    index: 8,
    chapter: 2,
    composition: [
      { role: 'leviathan', variant: 'base', count: 1 },
      { role: 'swarm', variant: 'base', count: 8 },
    ],
    spawnInterval: 1.2,
    rewardScrap: 150,
    salvageReserve: 210,
  },
];

export const TOTAL_WAVES = WAVES.length;
export const LAST_WAVE_OF_CHAPTER1 = 4;

export function waveSpec(index: number): WaveSpec {
  return WAVES[Math.min(WAVES.length, Math.max(1, Math.floor(index))) - 1];
}

/* ─────────────────────────── 테크·퍼크 ─────────────────────────── */

export const TECHS: TechCatalog = {
  piercingHarpoon: {
    cost: { scrap: 0, biomass: 30 },
    name: '관통 작살',
    effect: '작살이 장갑을 무시한다',
  },
  wideBlast: {
    cost: { scrap: 0, biomass: 40 },
    name: '광역 확장',
    effect: '박격포 폭발 반경 +0.5',
  },
  reinforcedWalls: {
    cost: { scrap: 0, biomass: 25 },
    name: '강화 격벽',
    effect: '격벽 최대 HP +35% · 벽 자동 재건 해금',
  },
  droneLogistics: {
    cost: { scrap: 0, biomass: 45 },
    name: '드론 물류',
    effect: '드론 역할 분리 · 인양 효율 +20%',
  },
};

export const TECH_IDS: readonly TechId[] = ['piercingHarpoon', 'wideBlast', 'reinforcedWalls', 'droneLogistics'];

export const TECH_EFFECTS = {
  reinforcedWallsHp: 1.35,
  wideBlastRadius: 0.5,
  droneLogisticsYield: 1.2,
} as const;

export const PERKS: PerkCatalog = {
  startScrap: { cost: 5, maxLevel: 3, name: '예비 적재', effect: '시작 고철 +20/레벨' },
  subSpeed: { cost: 8, maxLevel: 3, name: '추진기 정비', effect: '잠수정 이동 +8%/레벨' },
  wallHp: { cost: 6, maxLevel: 3, name: '용접 보강', effect: '격벽 HP +10%/레벨' },
};

export const PERK_EFFECTS = { startScrapPerLevel: 20, subSpeedPerLevel: 0.08, wallHpPerLevel: 0.1 } as const;

/** 통찰 획득: 웨이브 최초 클리어 +1 · 발견 +3 · 2장 진입 +8 */
export const INSIGHT_REWARD = { waveFirstClear: 1, discovery: 3, chapterAdvance: 8 } as const;

/* ─────────────────────────── 잠수정·액티브 ─────────────────────────── */

export const SUB = {
  maxHp: 60,
  speed: 3.2,
  harvestRange: 0.8,
  fireRange: 2.5,
  fireInterval: 0.5,
  damage: 7,
  downedSeconds: 6,
  // 코어에 정박하면 서서히 수리된다 — 접촉 피해를 받은 잠수정을 «물러나게» 만드는 유일한 장치.
  dockRange: 1.6,
  dockRepairPerSecond: 3,
  // 적 coreDamage × 이 비율. 낮으면 «몸으로 막기»가 무위험 최적해가 된다.
  // 4.0이면 표류체 1기 스침 ≈ 17 피해 → 레인에 서서 전방 잔해를 캐는 것이 실제 도박이 된다.
  contactDamagePerSecond: 4,
  contactRange: 0.55,
} as const;

export const ABILITIES = {
  sonarPulse: {
    cooldown: 8,
    radius: 2.5,
    damage: 18,
    perfectDamage: 27,
    slowSeconds: 2,
    perfectSlowSeconds: 3,
  },
  weld: { cooldown: 12, structureHeal: 60, perfectStructureHeal: 90, coreHeal: 20, perfectCoreHeal: 30 },
} as const;

/** 정밀 판정 게이지: 0↔1 왕복 속도(초당)와 폭 */
export const METER_RATE = 0.9;
export const perfectWindow = (wave: number): number => Math.max(0.05, 0.12 - 0.008 * wave);

/* ─────────────────────────── 자동화·드론 ─────────────────────────── */

export const DRONES = {
  speed: 2.4,
  repairPerSecond: 6,
  wallRebuildInterval: 1.5,
  wallRebuildMinScrap: 60,
} as const;

/* ─────────────────────────── 실패·침수 ─────────────────────────── */

export const CORE = { maxHp: 100 } as const;
export const FLOOD = { leakThreshold: 4, tiles: 4, waves: 2 } as const;

/* ─────────────────────────── 잔해·리저브 ─────────────────────────── */

export const WRECK = { basePerSecond: 1, richnessFloor: 0.5 } as const;

/* ─────────────────────────── 숨은 해금 ─────────────────────────── */

export interface DiscoverySpec {
  readonly id: DiscoveryId;
  readonly name: string;
  readonly hint: string;
  readonly condition: string;
}

export const DISCOVERIES: Readonly<Record<DiscoveryId, DiscoverySpec>> = {
  ventResonance: {
    id: 'ventResonance',
    name: '벤트 공명',
    hint: '뜨거운 바닥 위에서 두 개가 함께 울린다',
    condition: '열수 타일에 공격 건물 2기를 동시에 보유',
  },
  flawlessPair: {
    id: 'flawlessPair',
    name: '무손실',
    hint: '두 번 연속으로 아무것도 내주지 않는다면',
    condition: '코어 피해 0으로 2웨이브 연속 클리어',
  },
  deepArchaeology: {
    id: 'deepArchaeology',
    name: '심해 고고학',
    hint: '싸움 한가운데, 가장 먼 잔해에 손을 댄다',
    condition: '웨이브 전투 중에 전방(행 0~3) 잔해를 직접 인양',
  },
};

export const DISCOVERY_IDS: readonly DiscoveryId[] = ['ventResonance', 'flawlessPair', 'deepArchaeology'];
export const HINT_THRESHOLD = 0.6;

/* ─────────────────────────── 경제 ─────────────────────────── */

export const ECONOMY: EconomyTuning = {
  startScrap: 80,
  manualSalvagePerSecond: 5.5,
  dronePerSecond: 3.3,
  forwardWreckMultiplier: 1.6,
  sellRefund: 0.5,
  upgradeCostFactor: 1.8,
  upgradeEffectFactor: 1.55,
  offlineCapSeconds: 7200,
  offlineEfficiency: 0.4,
  earlyBonusSeconds: 10,
  earlyBonusRate: 0.25,
  retryGrantBase: 120,
  retryGrantPerAttempt: 40,
  minDamageRatio: 0.6,
  minDamageFlat: 1,
};

/** 장 전환 시 남겨 두는 건물의 고철 가치 중 이 비율을 이전 예산으로 돌려준다(소프트락 방지) */
export const CHAPTER_RELOCATION_REFUND = 0.5;

/* ─────────────────────────── 경로 비용 ─────────────────────────── */

export const PATH_COST = {
  /** 빈 물·열수 1타일 이동 기본 비용 */
  open: 10,
  /** 비벽 구조물을 부수고 지나갈 때의 추가 비용 */
  structure: 120,
} as const;

/** 흐름장은 wallCost 값별로 캐시된다. 비행은 모든 장애물을 무시하는 단일 필드. */
export function groundWallCosts(): readonly number[] {
  const costs = new Set<number>();
  for (const role of ENEMY_ROLES) {
    const spec = ENEMIES[role];
    if (spec.pathClass !== 'flyer') costs.add(spec.wallCost);
  }
  return [...costs].sort((a, b) => a - b);
}

export function pathClassOf(role: EnemyRole): PathClass {
  return ENEMIES[role].pathClass;
}

/* ─────────────────────────── 레이아웃 파싱 ─────────────────────────── */

export interface ParsedLayout {
  readonly terrain: Int8Array;
  readonly coreTiles: readonly TileIndex[];
  readonly ventTiles: readonly TileIndex[];
  readonly wreckTiles: readonly TileIndex[];
  readonly thermalTiles: readonly TileIndex[];
}

/** 레이아웃 문자열을 terrain 배열로. 행 수·열 수가 어긋나면 예외 — 콘텐츠 버그를 숨기지 않는다. */
export function parseLayout(layout: readonly string[]): ParsedLayout {
  if (layout.length !== GRID_H) throw new Error(`layout must have ${GRID_H} rows, got ${layout.length}`);
  const terrain = new Int8Array(GRID_W * GRID_H);
  const coreTiles: TileIndex[] = [];
  const ventTiles: TileIndex[] = [];
  const wreckTiles: TileIndex[] = [];
  const thermalTiles: TileIndex[] = [];
  for (let y = 0; y < GRID_H; y++) {
    const row = layout[y];
    if (row.length !== GRID_W) throw new Error(`layout row ${y} must be ${GRID_W} chars, got ${row.length}`);
    for (let x = 0; x < GRID_W; x++) {
      const kind = LAYOUT_LEGEND[row[x]];
      if (kind === undefined) throw new Error(`unknown layout char "${row[x]}" at ${x},${y}`);
      const tile = tileIndex(x, y);
      terrain[tile] = kind;
      if (kind === TERRAIN.core) coreTiles.push(tile);
      else if (kind === TERRAIN.vent) ventTiles.push(tile);
      else if (kind === TERRAIN.wreck) wreckTiles.push(tile);
      else if (kind === TERRAIN.thermal) thermalTiles.push(tile);
    }
  }
  return { terrain, coreTiles, ventTiles, wreckTiles, thermalTiles };
}

/** 코어 중심(타일 단위 좌표). 2×2의 가운데. */
export function coreCenter(coreTiles: readonly TileIndex[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const tile of coreTiles) {
    sx += tileX(tile) + 0.5;
    sy += tileY(tile) + 0.5;
  }
  const n = Math.max(1, coreTiles.length);
  return { x: sx / n, y: sy / n };
}
