/**
 * 꼬마 용사 키우기 — 게임 규칙과 상태. DOM·실시간·전역 난수를 쓰지 않는다.
 * 셸은 step() 을 고정 간격으로 부르고, 명령은 전부 이 파일의 함수를 지난다.
 */
import {
  COMPANION,
  CRIT_PER_LEVEL,
  ENEMY,
  GOLD,
  GOLD_PER_LEVEL,
  HERO,
  REBIRTH,
  SKILL,
  SPEED_PER_LEVEL,
  STAGES_PER_ZONE,
  TICK,
  UNLOCK_STAGE,
  UPGRADES,
  UPGRADE_ORDER,
  WEAPONS,
  ZONES,
  type UnlockId,
  type UpgradeId,
  type ZoneSpec,
} from './content.ts';

export type BuyAmount = 1 | 10 | 'max';
export type AutoKey = 'skill' | 'boss';

export type GameEvent =
  | { readonly kind: 'hit'; readonly damage: number; readonly crit: boolean; readonly source: 'hero' | 'tap' | 'companion' | 'skill' }
  | { readonly kind: 'kill'; readonly gold: number; readonly boss: boolean }
  | { readonly kind: 'stageClear'; readonly stage: number }
  | { readonly kind: 'bossStart' }
  | { readonly kind: 'bossFail' }
  | { readonly kind: 'evolve'; readonly weapon: string }
  | { readonly kind: 'unlock'; readonly unlock: UnlockId }
  | { readonly kind: 'skill' }
  | { readonly kind: 'rebirth'; readonly stones: number };

export interface Enemy {
  hp: number;
  maxHp: number;
  boss: boolean;
}

export interface GameState {
  rng: number;
  gold: number;
  stage: number;
  /** 이번 환생 회차에서 도달한 최고 스테이지 — 영혼석 계산 기준 */
  runBest: number;
  /** 전체 기록. 해금은 한 번 열리면 환생해도 유지된다 */
  best: number;
  kills: number;
  enemy: Enemy | null;
  walkTimer: number;
  attackTimer: number;
  companionTimer: number;
  bossTimer: number;
  /** 보스에 실패해 현재 스테이지를 반복 사냥 중. 도전 버튼이나 자동 도전으로 빠져나온다 */
  farming: boolean;
  levels: Record<UpgradeId, number>;
  skillCooldown: number;
  auto: Record<AutoKey, boolean>;
  stones: number;
  rebirths: number;
  totalKills: number;
  playSeconds: number;
  events: GameEvent[];
}

/* ───────────── 난수 (결정적) ───────────── */

function nextRandom(state: GameState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* ───────────── 파생 수치 ───────────── */

const emptyLevels = (): Record<UpgradeId, number> => ({ attack: 0, speed: 0, crit: 0, gold: 0, companion: 0 });

export function createState(seed: number): GameState {
  const state: GameState = {
    rng: seed >>> 0,
    gold: 0,
    stage: 1,
    runBest: 1,
    best: 1,
    kills: 0,
    enemy: null,
    walkTimer: 0,
    attackTimer: 0,
    companionTimer: 0,
    bossTimer: 0,
    farming: false,
    levels: emptyLevels(),
    skillCooldown: 0,
    auto: { skill: false, boss: false },
    stones: 0,
    rebirths: 0,
    totalKills: 0,
    playSeconds: 0,
    events: [],
  };
  spawnEnemy(state);
  return state;
}

export const zoneOf = (stage: number): ZoneSpec => ZONES[Math.floor((stage - 1) / STAGES_PER_ZONE) % ZONES.length];
export const isUnlocked = (state: GameState, unlock: UnlockId): boolean => state.best >= UNLOCK_STAGE[unlock];
export const stoneMultiplier = (stones: number): number => 1 + REBIRTH.bonusPerStone * stones;
export const weaponTier = (attackLevel: number): number =>
  Math.min(WEAPONS.length - 1, Math.floor(attackLevel / HERO.evolveEvery));

export function heroAttack(state: GameState): number {
  const level = state.levels.attack;
  const evolutions = Math.floor(level / HERO.evolveEvery);
  return (HERO.baseAttack + HERO.attackPerLevel * level) * 2 ** evolutions * stoneMultiplier(state.stones);
}

export const attacksPerSecond = (state: GameState): number =>
  HERO.baseAttacksPerSecond * (1 + SPEED_PER_LEVEL * state.levels.speed);
export const critChance = (state: GameState): number => CRIT_PER_LEVEL * state.levels.crit;
export const goldMultiplier = (state: GameState): number =>
  (1 + GOLD_PER_LEVEL * state.levels.gold) * stoneMultiplier(state.stones);

export function companionHit(state: GameState): number {
  if (!isUnlocked(state, 'companion')) return 0;
  return heroAttack(state) * COMPANION.factorPerLevel * state.levels.companion;
}

/** 치명타 기댓값을 포함한 초당 피해. 오프라인 보상과 UI 표시에 쓴다 */
export function expectedDps(state: GameState): number {
  const crit = critChance(state);
  const hero = heroAttack(state) * attacksPerSecond(state) * (1 - crit + crit * HERO.critMultiplier);
  return hero + companionHit(state) * COMPANION.attacksPerSecond;
}

export const enemyHp = (stage: number, boss: boolean): number =>
  ENEMY.baseHp * ENEMY.hpGrowth ** (stage - 1) * (boss ? ENEMY.bossHpFactor : 1);

export function killGold(state: GameState, stage: number, boss: boolean): number {
  return GOLD.base * GOLD.growth ** (stage - 1) * (boss ? GOLD.bossFactor : 1) * goldMultiplier(state);
}

export function upgradeCost(id: UpgradeId, level: number): number {
  const spec = UPGRADES[id];
  return Math.ceil(spec.baseCost * spec.costGrowth ** level);
}

/** 한 번에 살 레벨 수와 총비용. max 는 지금 골드로 살 수 있는 만큼 */
export function purchasePlan(state: GameState, id: UpgradeId, amount: BuyAmount): { count: number; cost: number } {
  const spec = UPGRADES[id];
  const limit = amount === 'max' ? Number.POSITIVE_INFINITY : amount;
  let count = 0;
  let cost = 0;
  let level = state.levels[id];
  while (count < limit && level < spec.maxLevel) {
    const next = upgradeCost(id, level);
    if (amount === 'max' && cost + next > state.gold) break;
    cost += next;
    level++;
    count++;
  }
  return { count, cost };
}

export function rebirthStones(state: GameState): number {
  if (state.runBest < REBIRTH.minStage) return 0;
  return Math.floor(((state.runBest - REBIRTH.offsetStage) / 2) ** REBIRTH.exponent);
}

/* ───────────── 전투 흐름 ───────────── */

function isBossStage(state: GameState): boolean {
  return !state.farming && state.kills >= ENEMY.killsPerStage;
}

function spawnEnemy(state: GameState): void {
  const boss = isBossStage(state);
  const hp = enemyHp(state.stage, boss);
  state.enemy = { hp, maxHp: hp, boss };
  if (boss) {
    state.bossTimer = ENEMY.bossSeconds;
    state.events.push({ kind: 'bossStart' });
  }
}

function damageEnemy(state: GameState, amount: number, crit: boolean, source: 'hero' | 'tap' | 'companion' | 'skill'): void {
  const enemy = state.enemy;
  if (!enemy || amount <= 0) return;
  enemy.hp -= amount;
  state.events.push({ kind: 'hit', damage: amount, crit, source });
  if (enemy.hp <= 0) killEnemy(state, enemy);
}

function killEnemy(state: GameState, enemy: Enemy): void {
  const gold = killGold(state, state.stage, enemy.boss);
  state.gold += gold;
  state.totalKills++;
  state.enemy = null;
  state.walkTimer = ENEMY.walkSeconds;
  state.events.push({ kind: 'kill', gold, boss: enemy.boss });
  if (enemy.boss) {
    advanceStage(state);
    return;
  }
  // 반복 사냥 중에는 보스 카운트가 차지 않는다 — 도전은 버튼·자동 도전이 정한다
  if (!state.farming) state.kills = Math.min(ENEMY.killsPerStage, state.kills + 1);
}

function advanceStage(state: GameState): void {
  state.events.push({ kind: 'stageClear', stage: state.stage });
  state.stage++;
  state.kills = 0;
  state.runBest = Math.max(state.runBest, state.stage);
  if (state.stage > state.best) {
    const before = state.best;
    state.best = state.stage;
    for (const unlock of Object.keys(UNLOCK_STAGE) as UnlockId[]) {
      if (before < UNLOCK_STAGE[unlock] && state.best >= UNLOCK_STAGE[unlock]) {
        state.events.push({ kind: 'unlock', unlock });
      }
    }
  }
}

function failBoss(state: GameState): void {
  state.farming = true;
  state.enemy = null;
  state.walkTimer = ENEMY.walkSeconds;
  state.events.push({ kind: 'bossFail' });
}

function heroSwing(state: GameState): void {
  const crit = nextRandom(state) < critChance(state);
  damageEnemy(state, heroAttack(state) * (crit ? HERO.critMultiplier : 1), crit, 'hero');
}

/** 고정 간격 1스텝. 셸이 누적 시간을 TICK 단위로 쪼개 부른다 */
export function step(state: GameState): void {
  state.playSeconds += TICK;
  state.skillCooldown = Math.max(0, state.skillCooldown - TICK);
  if (state.auto.skill && isUnlocked(state, 'auto') && state.skillCooldown === 0 && state.enemy) castSkill(state);
  if (state.farming && state.auto.boss && isUnlocked(state, 'auto')) challengeBoss(state);

  if (!state.enemy) {
    state.walkTimer -= TICK;
    if (state.walkTimer <= 0) spawnEnemy(state);
    return;
  }
  if (state.enemy.boss) {
    state.bossTimer -= TICK;
    if (state.bossTimer <= 0) {
      failBoss(state);
      return;
    }
  }
  state.attackTimer += TICK;
  const interval = 1 / attacksPerSecond(state);
  while (state.attackTimer >= interval && state.enemy) {
    state.attackTimer -= interval;
    heroSwing(state);
  }
  stepCompanion(state);
}

function stepCompanion(state: GameState): void {
  const hit = companionHit(state);
  if (hit <= 0 || !state.enemy) return;
  state.companionTimer += TICK;
  const interval = 1 / COMPANION.attacksPerSecond;
  if (state.companionTimer >= interval) {
    state.companionTimer -= interval;
    damageEnemy(state, hit, false, 'companion');
  }
}

/* ───────────── 명령 ───────────── */

export function buy(state: GameState, id: UpgradeId, amount: BuyAmount): boolean {
  const unlock = UPGRADES[id].unlock;
  if (unlock && !isUnlocked(state, unlock)) return false;
  const plan = purchasePlan(state, id, amount);
  if (plan.count === 0 || plan.cost > state.gold) return false;
  const tierBefore = weaponTier(state.levels.attack);
  state.gold -= plan.cost;
  state.levels[id] += plan.count;
  if (id === 'attack' && weaponTier(state.levels.attack) > tierBefore) {
    state.events.push({ kind: 'evolve', weapon: WEAPONS[weaponTier(state.levels.attack)].name });
  }
  return true;
}

export function tap(state: GameState): void {
  damageEnemy(state, heroAttack(state) * HERO.tapFactor, false, 'tap');
}

export function castSkill(state: GameState): boolean {
  if (!isUnlocked(state, 'skill') || state.skillCooldown > 0 || !state.enemy) return false;
  state.skillCooldown = SKILL.cooldownSeconds;
  state.events.push({ kind: 'skill' });
  damageEnemy(state, heroAttack(state) * SKILL.damageFactor, true, 'skill');
  return true;
}

export function challengeBoss(state: GameState): boolean {
  if (!state.farming) return false;
  state.farming = false;
  state.kills = ENEMY.killsPerStage;
  state.enemy = null;
  state.walkTimer = ENEMY.walkSeconds;
  return true;
}

export function setAuto(state: GameState, key: AutoKey, on: boolean): boolean {
  if (!isUnlocked(state, 'auto')) return false;
  state.auto[key] = on;
  return true;
}

/** 환생: 스테이지·골드·강화를 버리고 영혼석을 얻는다. 해금·자동 설정·기록은 남는다 */
export function rebirth(state: GameState): boolean {
  const stones = rebirthStones(state);
  if (!isUnlocked(state, 'rebirth') || stones <= 0) return false;
  state.stones += stones;
  state.rebirths++;
  state.gold = 0;
  state.stage = 1;
  state.runBest = 1;
  state.kills = 0;
  state.farming = false;
  state.levels = emptyLevels();
  state.skillCooldown = 0;
  state.events.push({ kind: 'rebirth', stones });
  spawnEnemy(state);
  return true;
}

export function drainEvents(state: GameState): GameEvent[] {
  const events = state.events;
  state.events = [];
  return events;
}

/* ───────────── 방치 보상 ───────────── */

/** 자리를 비운 동안의 골드. 현재 스테이지 일반 몹을 사냥한 것으로 치고 절반만 준다 */
export function offlineGold(state: GameState, seconds: number): number {
  const capped = Math.min(GOLD.offlineCapSeconds, Math.max(0, seconds));
  if (!Number.isFinite(capped) || capped < GOLD.offlineMinSeconds) return 0;
  const killSeconds = enemyHp(state.stage, false) / Math.max(1e-9, expectedDps(state)) + ENEMY.walkSeconds;
  return (killGold(state, state.stage, false) / killSeconds) * capped * GOLD.offlineRate;
}

/* ───────────── 저장 ───────────── */

export const SAVE_KEY = 'idle-hero-v1';
const SAVE_VERSION = 1;

/** 전투 중인 적과 타이머는 저장하지 않는다 — 복원하면 적을 새로 소환하므로 의미가 없다 */
export function serialize(state: GameState): string {
  return JSON.stringify({
    version: SAVE_VERSION,
    rng: state.rng,
    gold: state.gold,
    stage: state.stage,
    runBest: state.runBest,
    best: state.best,
    kills: state.kills,
    farming: state.farming,
    levels: state.levels,
    skillCooldown: state.skillCooldown,
    auto: state.auto,
    stones: state.stones,
    rebirths: state.rebirths,
    totalKills: state.totalKills,
    playSeconds: state.playSeconds,
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function num(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

const int = (value: unknown, fallback: number, min: number, max: number): number =>
  Math.floor(num(value, fallback, min, max));

/** 손상·조작된 저장은 항목별로 기본값에 수렴한다. 예외를 던지지 않는다 */
export function parse(raw: string | null, seed: number): GameState {
  const state = createState(seed);
  if (!raw) return state;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return state;
  }
  if (!isRecord(data) || data.version !== SAVE_VERSION) return state;
  state.rng = int(data.rng, state.rng, 0, 0xffffffff);
  state.gold = num(data.gold, 0, 0, 1e300);
  state.best = int(data.best, 1, 1, 1e6);
  state.stage = int(data.stage, 1, 1, state.best);
  state.runBest = int(data.runBest, state.stage, state.stage, state.best);
  state.kills = int(data.kills, 0, 0, ENEMY.killsPerStage);
  state.farming = data.farming === true;
  const levels = isRecord(data.levels) ? data.levels : {};
  for (const id of UPGRADE_ORDER) state.levels[id] = int(levels[id], 0, 0, UPGRADES[id].maxLevel);
  state.skillCooldown = num(data.skillCooldown, 0, 0, SKILL.cooldownSeconds);
  const auto = isRecord(data.auto) ? data.auto : {};
  state.auto = { skill: auto.skill === true, boss: auto.boss === true };
  state.stones = int(data.stones, 0, 0, 1e9);
  state.rebirths = int(data.rebirths, 0, 0, 1e6);
  state.totalKills = int(data.totalKills, 0, 0, 1e12);
  state.playSeconds = num(data.playSeconds, 0, 0, 1e10);
  state.events = [];
  spawnEnemy(state);
  state.events = []; // 복원 직후 보스 등장 연출을 다시 띄우지 않는다
  return state;
}
