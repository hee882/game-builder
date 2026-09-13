/**
 * createSim — 계약(contract.ts)의 OutpostSim 구현.
 *
 * 규칙:
 *  - 고정 스텝 1/30초. 실시간·DOM·Math.random·Date 를 쓰지 않는다.
 *  - 거부된 명령과 preview() 는 **상태를 전혀 바꾸지 않는다**.
 *  - view() 는 항상 같은 객체를 돌려주고 배열은 풀링한다(프레임당 할당 0).
 */
import {
  MAX_ENEMIES,
  MAX_STEPS_PER_ADVANCE,
  OUTPOST_SAVE_VERSION,
  TICK_SECONDS,
  TILE_COUNT,
  type AbilityId,
  type AbilityStateView,
  type AutomationKey,
  type BuildPreview,
  type BuildingId,
  type BuildingView,
  type ChapterId,
  type CommandResult,
  type DiscoveryId,
  type DroneView,
  type EnemyView,
  type OutpostSave,
  type OutpostSim,
  type PerkId,
  type RejectReason,
  type SimCommand,
  type SimEvent,
  type SimOptions,
  type SimView,
  type TargetPolicy,
  type TechId,
  type EnemyRole,
  type EnemyVariant,
  type RetryView,
  type SimStats,
  type SubView,
  type TileIndex,
  type UnlockProgressView,
  type Vec2,
  type WaveView,
  type WreckView,
} from './contract.ts';
import {
  ABILITIES,
  BUILDINGS,
  BUILDING_IDS,
  CORE,
  DISCOVERIES,
  DISCOVERY_IDS,
  ECONOMY,
  METER_RATE,
  PERKS,
  TECHS,
  TECH_IDS,
  TERRAIN,
  TOTAL_WAVES,
  perfectWindow,
  tileX,
  tileY,
  waveSpec,
} from './content.ts';
import { UNREACHABLE, buildField, tracePath, type CostInput } from './path.ts';
import { parseSave, serializeSave } from './save.ts';
import {
  abilityMeter,
  castSonarPulse,
  castWeld,
  stepBuildings,
  stepEnemies,
  stepShots,
  stepSpawning,
  stepSub,
  waveSpawnCountdown,
} from './sim-combat.ts';
import {
  applyOffline,
  autoIncomePerSecond,
  advanceChapter as applyAdvanceChapter,
  beginWave,
  checkPlacementDiscoveries,
  checkWaveEnd,
  discoveryHints,
  rebuildGrant,
  retryWave as applyRetryWave,
  startBuildPhase,
  stepEconomy,
} from './sim-economy.ts';
import {
  activeEnemyCount,
  buildingMaxHp,
  collectorRate,
  createState,
  droneCount,
  ensureFields,
  hasWreckNeighbor,
  inBounds,
  isBuildableTerrain,
  loadChapter,
  markFieldDirty,
  refreshUnlocks,
  subSpeed,
  tileAtPoint,
  tileCenterX,
  tileCenterY,
  upgradeCost,
  wreckYield,
  type SimState,
} from './sim-state.ts';

const ABILITY_IDS: readonly AbilityId[] = ['sonarPulse', 'weld'];
const POLICIES: readonly TargetPolicy[] = ['nearest', 'leader', 'air'];
const AUTOMATION_KEYS: readonly AutomationKey[] = ['droneRole', 'autoRebuildWalls'];

const reject = (reason: RejectReason): CommandResult => ({ ok: false, reason });
const OK: CommandResult = { ok: true };

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const validTile = (tile: unknown): tile is TileIndex => finite(tile) && Number.isInteger(tile) && inBounds(tile);
const validVec = (value: unknown): value is Vec2 =>
  value !== null && typeof value === 'object' && finite((value as Vec2).x) && finite((value as Vec2).y);

/* ─────────────────────────── 가변 뷰(풀링) ─────────────────────────── */

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

type MutWaveView = Mutable<WaveView> & {
  incoming: { vent: TileIndex; strength: 0 | 1 | 2 | 3 }[];
  spawns: { vent: TileIndex; role: EnemyRole; variant: EnemyVariant; count: number }[];
};

function makeEnemyViews(): Mutable<EnemyView>[] {
  return Array.from({ length: MAX_ENEMIES }, () => ({
    id: 0,
    role: 'drifter' as const,
    variant: 'base' as const,
    pos: { x: 0, y: 0 },
    prev: { x: 0, y: 0 },
    hp: 0,
    maxHp: 1,
    facing: 0,
    slowTicks: 0,
    armor: 0,
    breaching: false,
  }));
}

export const createSim = (options: SimOptions): OutpostSim => {
  const seed = finite(options.seed) ? Math.abs(Math.floor(options.seed)) >>> 0 : 1;
  const state = createState(seed);
  startBuildPhase(state, 1);
  if (typeof options.save === 'string') restore(state, parseSave(options.save));
  if (finite(options.offlineSeconds)) applyOffline(state, options.offlineSeconds);

  /* ── 뷰 풀 ── */
  const enemyViews = makeEnemyViews();
  const buildingViews: Mutable<BuildingView>[] = Array.from({ length: TILE_COUNT }, () => ({
    tile: 0,
    id: 'bulkhead' as BuildingId,
    level: 0,
    hp: 0,
    maxHp: 1,
    charge: 0,
    aim: 0,
    policy: 'nearest' as TargetPolicy,
    onThermal: false,
  }));
  const shotViews = Array.from({ length: state.shots.length }, () => ({
    from: { x: 0, y: 0 },
    to: { x: 0, y: 0 },
    kind: 'harpoon' as const,
    life: 0,
  }));
  const droneViews: Mutable<DroneView>[] = Array.from({ length: state.drones.length }, () => ({
    pos: { x: 0, y: 0 },
    prev: { x: 0, y: 0 },
    role: 'harvest' as const,
    carrying: 0,
  }));
  const wreckViews: Mutable<WreckView>[] = [];
  const abilityViews: Mutable<AbilityStateView>[] = ABILITY_IDS.map((id) => ({
    id,
    unlocked: true,
    cooldown: 0,
    cooldownMax: ABILITIES[id].cooldown,
    meter: 0,
    perfectWindow: 0,
  }));
  const view = createViewObject(state, enemyViews, buildingViews, shotViews, droneViews, wreckViews, abilityViews);

  /* ── 미리보기 전용 스크래치(상태를 건드리지 않는다) ── */
  const scratch = {
    walls: new Uint8Array(TILE_COUNT),
    structures: new Uint8Array(TILE_COUNT),
    dist: new Int32Array(TILE_COUNT),
    flow: new Int8Array(TILE_COUNT),
    changed: [] as TileIndex[],
  };

  let accumulator = 0;

  function placeBuilding(tile: TileIndex, id: BuildingId): void {
    const spec = BUILDINGS[id];
    const maxHp = buildingMaxHp(state, id, 0);
    state.buildings.set(tile, {
      tile,
      id,
      level: 0,
      hp: maxHp,
      maxHp,
      cooldown: 0,
      charge: 1,
      aim: 0,
      policy: 'nearest',
      onThermal: state.terrain[tile] === TERRAIN.thermal,
      investedScrap: spec.cost.scrap,
      investedBiomass: spec.cost.biomass,
    });
    if (id === 'bulkhead') state.walls[tile] = 1;
    else state.structures[tile] = 1;
    state.destroyedWalls = state.destroyedWalls.filter((candidate) => candidate !== tile);
    markFieldDirty(state);
    state.events.push({ kind: 'built', tile, building: id });
    checkPlacementDiscoveries(state);
  }

  /** build 명령의 순수 검증. preview 와 issue 가 같은 함수를 쓴다. */
  function validateBuild(tile: unknown, building: unknown): CommandResult {
    if (state.phase !== 'build' && state.phase !== 'wave') return reject('wrongPhase');
    if (!validTile(tile)) return reject('outOfBounds');
    if (typeof building !== 'string' || !BUILDING_IDS.includes(building as BuildingId)) {
      return reject('buildingLocked');
    }
    const id = building as BuildingId;
    if (!state.unlockedBuildings.has(id)) return reject('buildingLocked');
    const spec = BUILDINGS[id];
    if (!isBuildableTerrain(state, tile)) return reject('tileNotBuildable');
    if (state.flooded[tile] > 0) return reject('tileNotBuildable');
    if (state.buildings.has(tile)) return reject('tileOccupied');
    if (spec.requiresThermal && state.terrain[tile] !== TERRAIN.thermal) return reject('thermalOnly');
    if (spec.requiresWreckAdjacent && !hasWreckNeighbor(state, tile)) return reject('notAdjacentToWreck');
    if (state.scrap < spec.cost.scrap || state.biomass < spec.cost.biomass) return reject('notEnoughResources');
    return OK;
  }

  function issue(command: SimCommand): CommandResult {
    if (command === null || typeof command !== 'object') return reject('outOfBounds');
    switch (command.kind) {
      case 'build': {
        const result = validateBuild(command.tile, command.building);
        if (!result.ok) return result;
        const spec = BUILDINGS[command.building];
        state.scrap -= spec.cost.scrap;
        state.biomass -= spec.cost.biomass;
        placeBuilding(command.tile, command.building);
        return OK;
      }
      case 'upgrade': {
        if (state.phase !== 'build' && state.phase !== 'wave') return reject('wrongPhase');
        if (!validTile(command.tile)) return reject('outOfBounds');
        const building = state.buildings.get(command.tile);
        if (!building) return reject('tileNotBuildable');
        if (building.level >= BUILDINGS[building.id].maxLevel) return reject('maxLevel');
        const cost = upgradeCost(building.id, building.level);
        if (state.scrap < cost.scrap || state.biomass < cost.biomass) return reject('notEnoughResources');
        state.scrap -= cost.scrap;
        state.biomass -= cost.biomass;
        building.level++;
        building.investedScrap += cost.scrap;
        building.investedBiomass += cost.biomass;
        const ratio = building.maxHp > 0 ? building.hp / building.maxHp : 1;
        building.maxHp = buildingMaxHp(state, building.id, building.level);
        building.hp = building.maxHp * Math.min(1, ratio);
        checkPlacementDiscoveries(state);
        return OK;
      }
      case 'sell': {
        if (state.phase !== 'build' && state.phase !== 'wave') return reject('wrongPhase');
        if (!validTile(command.tile)) return reject('outOfBounds');
        const building = state.buildings.get(command.tile);
        if (!building) return reject('tileNotBuildable');
        // 환급은 투입액의 절반뿐 — 건설·판매 왕복은 언제나 순손실이다.
        state.scrap += building.investedScrap * ECONOMY.sellRefund;
        state.biomass += building.investedBiomass * ECONOMY.sellRefund;
        state.buildings.delete(command.tile);
        state.walls[command.tile] = 0;
        state.structures[command.tile] = 0;
        markFieldDirty(state);
        state.events.push({ kind: 'destroyed', tile: command.tile, building: building.id });
        return OK;
      }
      case 'setPolicy': {
        if (!validTile(command.tile)) return reject('outOfBounds');
        if (!POLICIES.includes(command.policy)) return reject('outOfBounds');
        const building = state.buildings.get(command.tile);
        if (!building) return reject('tileNotBuildable');
        building.policy = command.policy;
        return OK;
      }
      case 'moveSub': {
        if (state.phase !== 'build' && state.phase !== 'wave') return reject('wrongPhase');
        if (!validVec(command.to)) return reject('outOfBounds');
        if (state.sub.downedTicks > 0) return reject('subDowned');
        state.sub.target.x = Math.min(9, Math.max(0, command.to.x));
        state.sub.target.y = Math.min(12, Math.max(0, command.to.y));
        return OK;
      }
      case 'ability': {
        if (state.phase !== 'build' && state.phase !== 'wave') return reject('wrongPhase');
        if (!ABILITY_IDS.includes(command.ability)) return reject('outOfBounds');
        if (!validVec(command.at)) return reject('outOfBounds');
        if (state.sub.downedTicks > 0) return reject('subDowned');
        if (state.sub.cooldowns[command.ability] > 0) return reject('onCooldown');
        const window = perfectWindow(state.wave);
        const perfect = abilityMeter(state, METER_RATE) >= 1 - window;
        const x = Math.min(9, Math.max(0, command.at.x));
        const y = Math.min(12, Math.max(0, command.at.y));
        if (command.ability === 'sonarPulse') castSonarPulse(state, x, y, perfect);
        else castWeld(state, x, y, perfect);
        state.sub.cooldowns[command.ability] = ABILITIES[command.ability].cooldown;
        state.stats.abilityUses++;
        if (perfect) state.stats.perfects++;
        state.events.push({ kind: 'abilityCast', ability: command.ability, at: { x, y }, perfect });
        return OK;
      }
      case 'startWave': {
        if (state.phase !== 'build') return reject('wrongPhase');
        beginWave(state);
        return OK;
      }
      case 'research': {
        if (typeof command.tech !== 'string' || !TECH_IDS.includes(command.tech as TechId)) {
          return reject('outOfBounds');
        }
        const tech = command.tech as TechId;
        if (state.researched.has(tech)) return reject('alreadyResearched');
        const cost = TECHS[tech].cost;
        if (state.scrap < cost.scrap || state.biomass < cost.biomass) return reject('notEnoughResources');
        state.scrap -= cost.scrap;
        state.biomass -= cost.biomass;
        state.researched.add(tech);
        if (tech === 'reinforcedWalls') {
          // 격벽 최대 HP가 올라가므로 기존 벽에도 즉시 반영한다.
          for (const building of state.buildings.values()) {
            if (building.id !== 'bulkhead') continue;
            const ratio = building.hp / building.maxHp;
            building.maxHp = buildingMaxHp(state, 'bulkhead', building.level);
            building.hp = building.maxHp * ratio;
          }
          state.events.push({ kind: 'automationUnlocked', key: 'autoRebuildWalls' });
        }
        return OK;
      }
      case 'setAutomation': {
        if (!AUTOMATION_KEYS.includes(command.key)) return reject('outOfBounds');
        if (!finite(command.value)) return reject('outOfBounds');
        const unlocked = automationKeys();
        if (!unlocked.includes(command.key)) return reject('buildingLocked');
        const max = command.key === 'droneRole' ? 2 : 1;
        state.automation[command.key] = Math.min(max, Math.max(0, Math.floor(command.value)));
        return OK;
      }
      case 'advanceChapter': {
        if (state.phase !== 'chapterCleared') return reject('wrongPhase');
        applyAdvanceChapter(state);
        return OK;
      }
      case 'retryWave': {
        if (state.phase !== 'defeat') return reject('nothingToRetry');
        applyRetryWave(state);
        return OK;
      }
      case 'spendInsight': {
        if (typeof command.perk !== 'string' || !(command.perk in PERKS)) return reject('outOfBounds');
        const perk = command.perk as PerkId;
        const spec = PERKS[perk];
        if (state.perks[perk] >= spec.maxLevel) return reject('perkMaxed');
        if (state.insight < spec.cost) return reject('notEnoughInsight');
        state.insight -= spec.cost;
        state.perks[perk]++;
        if (perk === 'wallHp') {
          for (const building of state.buildings.values()) {
            if (building.id !== 'bulkhead') continue;
            const ratio = building.hp / building.maxHp;
            building.maxHp = buildingMaxHp(state, 'bulkhead', building.level);
            building.hp = building.maxHp * ratio;
          }
        }
        return OK;
      }
      default:
        return reject('outOfBounds');
    }
  }

  function automationKeys(): AutomationKey[] {
    const keys: AutomationKey[] = [];
    for (const building of state.buildings.values()) {
      if (building.id === 'droneBay') {
        keys.push('droneRole');
        break;
      }
    }
    if (state.researched.has('reinforcedWalls')) keys.push('autoRebuildWalls');
    return keys;
  }

  /* ─────────────────────────── 스텝 ─────────────────────────── */

  function step(): void {
    ensureFields(state);
    const dt = TICK_SECONDS;
    state.tick++;
    state.stats.elapsed += dt;
    if (state.phase === 'build' || state.phase === 'wave') {
      stepSpawning(state, dt);
      stepEnemies(state, dt);
      stepBuildings(state, dt);
      stepSub(state, dt);
      stepEconomy(state, dt);
      checkWaveEnd(state);
    }
    stepShots(state, dt);
  }

  function advance(realSeconds: number): number {
    if (!finite(realSeconds) || realSeconds <= 0) return 0;
    accumulator += realSeconds;
    let steps = 0;
    while (accumulator >= TICK_SECONDS && steps < MAX_STEPS_PER_ADVANCE) {
      accumulator -= TICK_SECONDS;
      step();
      steps++;
    }
    // 누적이 상한을 넘으면 버린다 — 탭 복귀 후 폭주 시뮬레이션 방지
    if (accumulator > TICK_SECONDS * MAX_STEPS_PER_ADVANCE) accumulator = 0;
    return steps;
  }

  /* ─────────────────────────── 미리보기 ─────────────────────────── */

  function preview(tile: TileIndex, building: BuildingId): BuildPreview {
    const result = validateBuild(tile, building);
    const spec = BUILDING_IDS.includes(building) ? BUILDINGS[building] : BUILDINGS.bulkhead;
    ensureFields(state);
    const before = state.fields.ground(400);
    scratch.walls.set(state.walls);
    scratch.structures.set(state.structures);
    if (validTile(tile)) {
      if (building === 'bulkhead') scratch.walls[tile] = 1;
      else scratch.structures[tile] = 1;
    }
    const ghostInput: CostInput = {
      terrain: state.terrain,
      walls: scratch.walls,
      structures: scratch.structures,
    };
    const ghost = buildField(ghostInput, state.coreTiles, 400, false, {
      dist: scratch.dist,
      flow: scratch.flow,
    });
    scratch.changed.length = 0;
    for (let index = 0; index < TILE_COUNT; index++) {
      if (before.dist[index] !== ghost.dist[index]) scratch.changed.push(index);
    }
    // 벽을 포함한 최단 경로가 되는지 = 적이 부수고 들어온다
    let sealsPath = false;
    let breachTile = -1;
    let deltaCost = 0;
    const vent = state.ventTiles[0] ?? 0;
    const beforeCost = before.dist[vent];
    const afterCost = ghost.dist[vent];
    if (beforeCost < UNREACHABLE && afterCost < UNREACHABLE) deltaCost = afterCost - beforeCost;
    for (const pathTile of tracePath(ghost, vent)) {
      if (scratch.walls[pathTile] === 1) {
        sealsPath = true;
        breachTile = pathTile;
        break;
      }
    }
    return {
      result,
      cost: spec.cost,
      sealsPath,
      breachTile,
      // 비용 10 = 타일 1칸. 표류체 속도로 환산한 초.
      pathDeltaSeconds: deltaCost / 10 / 1.4,
      changedTiles: scratch.changed,
      ghostDist: scratch.dist,
    };
  }

  /* ─────────────────────────── 뷰 동기화 ─────────────────────────── */

  function syncView(): SimView {
    const mutable = view as Mutable<SimView>;
    mutable.tick = state.tick;
    mutable.chapter = state.chapter;
    mutable.phase = state.phase;
    mutable.chapterCleared = state.phase === 'chapterCleared';
    mutable.terrain = state.terrain;
    mutable.flooded = state.flooded;
    ensureFields(state);
    mutable.pathHint = state.fields.ground(400).dist;
    mutable.fieldVersion = state.fieldVersion;
    const resources = mutable.resources as { scrap: number; biomass: number };
    resources.scrap = state.scrap;
    resources.biomass = state.biomass;
    const income = mutable.incomePerSecond as { scrap: number; biomass: number };
    const subRate = state.sub.harvesting ? ECONOMY.manualSalvagePerSecond : 0;
    income.scrap = state.reserveRemaining > 0 ? autoIncomePerSecond(state) + subRate : 0;
    income.biomass = 0;

    const salvage = mutable.salvage as {
      reserveRemaining: number;
      reserveTotal: number;
      harvestedThisCycle: number;
      exhausted: boolean;
      offlineGranted: number;
    };
    salvage.reserveRemaining = state.reserveRemaining;
    salvage.reserveTotal = state.reserveTotal;
    salvage.harvestedThisCycle = state.harvestedThisCycle;
    salvage.exhausted = state.reserveRemaining <= 0;
    salvage.offlineGranted = state.offlineGranted;

    const core = mutable.core as { hp: number; maxHp: number };
    core.hp = state.coreHp;
    core.maxHp = CORE.maxHp;

    syncWaveView(mutable);
    syncRetryView(mutable);
    syncSubView(mutable);
    syncEntityViews(mutable);
    syncProgressViews(mutable);
    return view;
  }

  function syncWaveView(mutable: Mutable<SimView>): void {
    const spec = waveSpec(state.wave);
    const wave = mutable.wave as unknown as MutWaveView;
    wave.index = state.wave;
    wave.total = TOTAL_WAVES;
    wave.chapter = state.chapter;
    wave.phase = state.phase;
    wave.buildSeconds = state.buildSeconds;
    wave.earlyBonusActive =
      state.phase === 'build' ? state.buildSeconds <= ECONOMY.earlyBonusSeconds : state.earlyBonusActive;
    wave.rewardScrap = Math.round(spec.rewardScrap * (wave.earlyBonusActive ? 1 + ECONOMY.earlyBonusRate : 1));
    wave.spawnRemaining = state.spawnQueue.length;
    wave.spawnCountdown = waveSpawnCountdown(state);
    wave.composition = spec.composition;
    const incoming = wave.incoming;
    incoming.length = 0;
    const spawns = wave.spawns;
    spawns.length = 0;
    const perVent = new Map<TileIndex, Map<string, number>>();
    for (const order of state.spawnQueue) {
      const key = `${order.role}|${order.variant}`;
      const bucket = perVent.get(order.vent) ?? new Map<string, number>();
      bucket.set(key, (bucket.get(key) ?? 0) + 1);
      perVent.set(order.vent, bucket);
    }
    for (const vent of state.ventTiles) {
      const bucket = perVent.get(vent);
      let total = 0;
      if (bucket) {
        for (const [key, count] of bucket) {
          const [role, variant] = key.split('|') as [EnemyRole, EnemyVariant];
          spawns.push({ vent, role, variant, count });
          total += count;
        }
      }
      const strength: 0 | 1 | 2 | 3 = total === 0 ? 0 : total >= 10 ? 3 : total >= 5 ? 2 : 1;
      incoming.push({ vent, strength });
    }
  }

  function syncRetryView(mutable: Mutable<SimView>): void {
    const retry = mutable.retry as unknown as Mutable<RetryView>;
    retry.available = state.phase === 'defeat';
    retry.chapter = state.chapter;
    retry.wave = state.wave;
    retry.rebuildGrant = rebuildGrant(state);
    retry.attempts = state.retryAttempts;
    retry.keepsDiscoveries = true;
  }

  function syncSubView(mutable: Mutable<SimView>): void {
    const sub = mutable.sub as unknown as Mutable<SubView>;
    sub.pos = state.sub.pos;
    sub.prev = state.sub.prev;
    sub.hp = state.sub.hp;
    sub.maxHp = 60;
    sub.downedTicks = state.sub.downedTicks;
    sub.harvesting = state.sub.harvesting;
    for (const abilityView of abilityViews) {
      abilityView.unlocked = true;
      abilityView.cooldown = state.sub.cooldowns[abilityView.id];
      abilityView.cooldownMax = ABILITIES[abilityView.id].cooldown;
      abilityView.meter = abilityMeter(state, METER_RATE);
      abilityView.perfectWindow = perfectWindow(state.wave);
    }
  }

  function syncEntityViews(mutable: Mutable<SimView>): void {
    let enemyCount = 0;
    for (const enemy of state.enemies) {
      if (!enemy.active) continue;
      const target = enemyViews[enemyCount++];
      target.id = enemy.id;
      target.role = enemy.role;
      target.variant = enemy.variant;
      target.pos = enemy.pos;
      target.prev = enemy.prev;
      target.hp = enemy.hp;
      target.maxHp = enemy.maxHp;
      target.facing = enemy.facing;
      target.slowTicks = enemy.slowTicks;
      target.armor = enemy.armor;
      target.breaching = enemy.breaching;
    }
    mutable.enemyCount = enemyCount;

    let buildingCount = 0;
    for (const building of state.buildings.values()) {
      const target = buildingViews[buildingCount++];
      target.tile = building.tile;
      target.id = building.id;
      target.level = building.level;
      target.hp = building.hp;
      target.maxHp = building.maxHp;
      target.charge = building.charge;
      target.aim = building.aim;
      target.policy = building.policy;
      target.onThermal = building.onThermal;
    }
    mutable.buildingCount = buildingCount;

    let shotCount = 0;
    for (const shot of state.shots) {
      if (!shot.active) continue;
      const target = shotViews[shotCount++] as {
        from: { x: number; y: number };
        to: { x: number; y: number };
        kind: typeof shot.kind;
        life: number;
      };
      target.from = shot.from;
      target.to = shot.to;
      target.kind = shot.kind;
      target.life = shot.life;
    }
    mutable.shotCount = shotCount;

    let droneIndex = 0;
    for (const drone of state.drones) {
      if (!drone.active) continue;
      const target = droneViews[droneIndex++];
      target.pos = drone.pos;
      target.prev = drone.prev;
      target.role = drone.role;
      target.carrying = drone.carrying;
    }
    mutable.droneCount = droneIndex;

    while (wreckViews.length < state.wrecks.length) {
      wreckViews.push({ tile: 0, yieldPerSecond: 0, forward: false });
    }
    wreckViews.length = state.wrecks.length;
    for (let index = 0; index < state.wrecks.length; index++) {
      const wreck = state.wrecks[index];
      const target = wreckViews[index];
      target.tile = wreck.tile;
      target.yieldPerSecond = state.reserveRemaining > 0 ? wreckYield(state, wreck) : 0;
      target.forward = wreck.forward;
    }
  }

  function syncProgressViews(mutable: Mutable<SimView>): void {
    const unlocked = mutable.unlockedBuildings as BuildingId[];
    unlocked.length = 0;
    for (const id of BUILDING_IDS) if (state.unlockedBuildings.has(id)) unlocked.push(id);

    const progress = mutable.unlockProgress as unknown as Mutable<UnlockProgressView>[];
    progress.length = 0;
    for (const id of BUILDING_IDS) {
      const rule = BUILDINGS[id].unlock;
      progress.push({
        building: id,
        unlocked: state.unlockedBuildings.has(id),
        requirement: rule.kind,
        wavesRemaining: rule.kind === 'waveClear' ? Math.max(0, rule.wave - state.wavesCleared) : 0,
        discovery: rule.kind === 'discovery' ? rule.id : null,
      });
    }

    const researched = mutable.researched as TechId[];
    researched.length = 0;
    for (const tech of TECH_IDS) if (state.researched.has(tech)) researched.push(tech);

    const automationList = mutable.automationUnlocked as AutomationKey[];
    automationList.length = 0;
    for (const key of automationKeys()) automationList.push(key);
    const automation = mutable.automation as Record<AutomationKey, number>;
    automation.droneRole = state.automation.droneRole;
    automation.autoRebuildWalls = state.automation.autoRebuildWalls;

    const discovered = mutable.discovered as DiscoveryId[];
    discovered.length = 0;
    for (const id of DISCOVERY_IDS) if (state.discovered.has(id)) discovered.push(id);

    const hints = mutable.hints as { id: DiscoveryId; text: string }[];
    hints.length = 0;
    for (const hint of discoveryHints(state)) hints.push({ id: hint.id, text: DISCOVERIES[hint.id].hint });

    mutable.insight = state.insight;
    const perks = mutable.perks as Record<PerkId, number>;
    perks.startScrap = state.perks.startScrap;
    perks.subSpeed = state.perks.subSpeed;
    perks.wallHp = state.perks.wallHp;

    const stats = mutable.stats as unknown as Mutable<SimStats>;
    stats.manualSalvage = state.stats.manualSalvage;
    stats.autoSalvage = state.stats.autoSalvage;
    stats.kills = state.stats.kills;
    stats.wallsLost = state.stats.wallsLost;
    stats.perfects = state.stats.perfects;
    stats.abilityUses = state.stats.abilityUses;
    stats.leaks = state.stats.leaks;
    stats.elapsed = state.stats.elapsed;
  }

  /* ─────────────────────────── 저장·해시 ─────────────────────────── */

  function snapshot(): OutpostSave {
    return {
      version: OUTPOST_SAVE_VERSION,
      meta: {
        version: OUTPOST_SAVE_VERSION,
        insight: state.insight,
        perks: { ...state.perks },
        discovered: [...state.discovered],
        best: { ...state.best },
      },
      run: {
        version: OUTPOST_SAVE_VERSION,
        seed: state.seed,
        chapter: state.chapter,
        tick: state.tick,
        phase: state.phase,
        wave: state.wave,
        resources: { scrap: state.scrap, biomass: state.biomass },
        coreHp: state.coreHp,
        salvageRemaining: state.reserveRemaining,
        buildings: [...state.buildings.values()].map((building) => ({
          tile: building.tile,
          id: building.id,
          level: building.level,
          hp: building.hp,
          policy: building.policy,
        })),
        waveStartBuildings: state.waveStartBuildings.map((entry) => ({ ...entry })),
        researched: [...state.researched],
        automation: { ...state.automation },
        flooded: [...state.flooded],
        retryAttempts: state.retryAttempts,
        stats: { ...state.stats },
      },
    };
  }

  function digest(): string {
    let hash = 0x811c9dc5;
    const mix = (value: number): void => {
      const quantized = Math.round(value * 1000);
      hash ^= quantized & 0xffffffff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    };
    mix(state.tick);
    mix(state.chapter);
    mix(state.wave);
    mix(state.phase.length);
    mix(state.scrap);
    mix(state.biomass);
    mix(state.coreHp);
    mix(state.reserveRemaining);
    mix(state.insight);
    mix(state.stats.kills);
    mix(state.stats.leaks);
    mix(state.discovered.size);
    // 잠수정 위치는 RunSave 스키마에 없다(복원 시 코어에 정박한다) → 해시에서 제외한다.
    mix(state.sub.hp);
    for (const enemy of state.enemies) {
      if (!enemy.active) continue;
      mix(enemy.id);
      mix(enemy.pos.x);
      mix(enemy.pos.y);
      mix(enemy.hp);
    }
    for (const building of [...state.buildings.values()].sort((a, b) => a.tile - b.tile)) {
      mix(building.tile);
      mix(building.level);
      mix(building.hp);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  const sim: OutpostSim = {
    advance,
    step,
    issue,
    preview,
    view: syncView,
    drainEvents(): readonly SimEvent[] {
      if (state.events.length === 0) return EMPTY_EVENTS;
      const drained = state.events;
      state.events = [];
      return drained;
    },
    get alpha(): number {
      return Math.min(1, Math.max(0, accumulator / TICK_SECONDS));
    },
    serialize(): string {
      return serializeSave(snapshot());
    },
    digest,
  };
  return sim;
};

const EMPTY_EVENTS: readonly SimEvent[] = [];

/* ─────────────────────────── 복원 ─────────────────────────── */

function restore(state: SimState, save: OutpostSave): void {
  state.insight = save.meta.insight;
  state.perks = { ...save.meta.perks };
  state.discovered = new Set(save.meta.discovered);
  state.best = { ...save.meta.best };
  const run = save.run;
  if (!run) {
    refreshUnlocks(state);
    return;
  }
  state.seed = run.seed;
  state.rngState = run.seed;
  loadChapter(state, run.chapter);
  state.tick = run.tick;
  state.wave = run.wave;
  state.wavesCleared = Math.max(run.wave - 1, save.meta.best.wave);
  state.scrap = run.resources.scrap;
  state.biomass = run.resources.biomass;
  state.coreHp = run.coreHp;
  state.researched = new Set(run.researched);
  state.automation = { ...run.automation };
  state.retryAttempts = run.retryAttempts;
  state.stats = { ...run.stats };
  for (let tile = 0; tile < TILE_COUNT; tile++) state.flooded[tile] = run.flooded[tile] ?? 0;
  state.waveStartBuildings = run.waveStartBuildings.map((entry) => ({ ...entry }));

  // 웨이브 도중 저장은 그 웨이브 시작 상태로 복귀한다(보상 중복·세이브 스컴 방지).
  const restoreFromSnapshot = run.phase === 'wave';
  const source = restoreFromSnapshot
    ? run.waveStartBuildings.map((entry) => ({ ...entry, hp: Number.POSITIVE_INFINITY, policy: 'nearest' as TargetPolicy }))
    : run.buildings;
  for (const entry of source) {
    if (state.flooded[entry.tile] > 0) continue;
    const spec = BUILDINGS[entry.id];
    const maxHp = buildingMaxHp(state, entry.id, entry.level);
    state.buildings.set(entry.tile, {
      tile: entry.tile,
      id: entry.id,
      level: entry.level,
      hp: Math.min(maxHp, entry.hp),
      maxHp,
      cooldown: 0,
      charge: 1,
      aim: 0,
      policy: entry.policy ?? 'nearest',
      onThermal: state.terrain[entry.tile] === TERRAIN.thermal,
      investedScrap: spec.cost.scrap * (entry.level + 1),
      investedBiomass: spec.cost.biomass * (entry.level + 1),
    });
    if (entry.id === 'bulkhead') state.walls[entry.tile] = 1;
    else state.structures[entry.tile] = 1;
  }
  markFieldDirty(state);

  const spec = waveSpec(state.wave);
  state.reserveTotal = spec.salvageReserve;
  // 소진된 리저브는 재충전되지 않는다 — 저장된 잔량을 그대로 쓴다.
  state.reserveRemaining = Math.min(run.salvageRemaining, spec.salvageReserve);
  state.harvestedThisCycle = Math.max(0, spec.salvageReserve - state.reserveRemaining);
  state.reserveExhaustedNotified = state.reserveRemaining <= 0;
  state.spawnInterval = spec.spawnInterval;
  state.spawnQueue = [];
  state.phase = restoreFromSnapshot ? 'build' : run.phase;
  state.buildSeconds = ECONOMY.earlyBonusSeconds + 1; // 복원 직후 조기 보너스를 주지 않는다
  refreshUnlocks(state);
}

/* ─────────────────────────── 뷰 객체 생성 ─────────────────────────── */

function createViewObject(
  state: SimState,
  enemies: Mutable<EnemyView>[],
  buildings: Mutable<BuildingView>[],
  shots: { from: Vec2; to: Vec2; kind: 'harpoon' | 'mortar' | 'resonator' | 'pulse'; life: number }[],
  drones: Mutable<DroneView>[],
  wrecks: Mutable<WreckView>[],
  abilities: Mutable<AbilityStateView>[],
): SimView {
  const base = {
    tick: 0,
    chapter: 1 as ChapterId,
    phase: state.phase,
    chapterCleared: false,
    terrain: state.terrain,
    flooded: state.flooded,
    pathHint: new Int32Array(TILE_COUNT),
    fieldVersion: 0,
    resources: { scrap: 0, biomass: 0 },
    incomePerSecond: { scrap: 0, biomass: 0 },
    salvage: {
      reserveRemaining: 0,
      reserveTotal: 0,
      harvestedThisCycle: 0,
      exhausted: false,
      offlineGranted: 0,
    },
    core: { hp: CORE.maxHp, maxHp: CORE.maxHp },
    wave: {
      index: 1,
      total: TOTAL_WAVES,
      chapter: 1,
      phase: state.phase,
      buildSeconds: 0,
      earlyBonusActive: false,
      rewardScrap: 0,
      spawnRemaining: 0,
      spawnCountdown: -1,
      composition: [],
      incoming: [],
      spawns: [],
    },
    retry: {
      available: false,
      chapter: 1,
      wave: 1,
      rebuildGrant: 0,
      attempts: 0,
      keepsDiscoveries: true,
    },
    sub: {
      pos: state.sub.pos,
      prev: state.sub.prev,
      hp: 0,
      maxHp: 60,
      downedTicks: 0,
      harvesting: false,
      abilities,
    },
    enemies,
    enemyCount: 0,
    buildings,
    buildingCount: 0,
    shots,
    shotCount: 0,
    drones,
    droneCount: 0,
    wrecks,
    unlockedBuildings: [] as BuildingId[],
    unlockProgress: [],
    researched: [] as TechId[],
    automationUnlocked: [] as AutomationKey[],
    automation: { droneRole: 0, autoRebuildWalls: 0 },
    discovered: [] as DiscoveryId[],
    hints: [],
    insight: 0,
    perks: { startScrap: 0, subSpeed: 0, wallHp: 0 },
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
  };
  return base as unknown as SimView;
}

/** 셸·테스트 편의: 타일 좌표 변환을 sim 에서도 쓸 수 있게 재노출한다. */
export { tileAtPoint, tileCenterX, tileCenterY, tileX, tileY, collectorRate, droneCount, activeEnemyCount, subSpeed };
