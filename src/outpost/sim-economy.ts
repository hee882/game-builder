/**
 * 경제·진행 스텝: 유한 인양 리저브 · 수집기 · 드론 · 벽 자동 재건 · 오프라인 정산,
 * 그리고 웨이브 전환(클리어·침수·실패·재시도·장 전환)과 숨은 해금 판정.
 *
 * 핵심 규칙(docs/outpost-decisions.md §2): 고철 인양 수입은 **전부** 웨이브별 유한 리저브에서 나온다.
 * 리저브가 0이면 수동·수집기·드론·오프라인 전부 0이 된다. 안전 건설 단계가 무한 수입이 되지 않는 이유다.
 */
import { TICK_SECONDS, type DiscoveryId, type TileIndex } from './contract.ts';
import {
  BUILDINGS,
  CHAPTER_RELOCATION_REFUND,
  CORE,
  DISCOVERY_IDS,
  DRONES,
  ECONOMY,
  FLOOD,
  HINT_THRESHOLD,
  INSIGHT_REWARD,
  LAST_WAVE_OF_CHAPTER1,
  SUB,
  TECH_EFFECTS,
  TERRAIN,
  TOTAL_WAVES,
  WRECK,
  waveSpec,
} from './content.ts';
import {
  buildSpawnQueue,
  buildingMaxHp,
  collectorRate,
  droneCount,
  ensureFields,
  investedCost,
  loadChapter,
  markFieldDirty,
  refreshUnlocks,
  tileCenterX,
  tileCenterY,
  wreckYield,
  activeEnemyCount,
  type SimState,
  type WreckState,
} from './sim-state.ts';

/* ─────────────────────────── 리저브 ─────────────────────────── */

function notifyExhausted(state: SimState, x: number, y: number): void {
  if (state.reserveExhaustedNotified) return;
  state.reserveExhaustedNotified = true;
  state.events.push({ kind: 'salvageExhausted', at: { x, y } });
}

/** 리저브 상한 안에서만 고철을 지급한다. 반환값 = 실제 지급량. */
export function grantSalvage(state: SimState, amount: number, manual: boolean, x: number, y: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (state.reserveRemaining <= 0) {
    notifyExhausted(state, x, y);
    return 0;
  }
  const granted = Math.min(amount, state.reserveRemaining);
  state.reserveRemaining -= granted;
  state.harvestedThisCycle += granted;
  state.scrap += granted;
  if (manual) state.stats.manualSalvage += granted;
  else state.stats.autoSalvage += granted;
  if (state.reserveRemaining <= 0) notifyExhausted(state, x, y);
  return granted;
}

export function autoIncomePerSecond(state: SimState): number {
  let rate = 0;
  for (const building of state.buildings.values()) {
    if (state.flooded[building.tile] > 0) continue;
    rate += collectorRate(state, building);
  }
  const harvesters = harvestDroneCount(state);
  const bonus = state.researched.has('droneLogistics') ? TECH_EFFECTS.droneLogisticsYield : 1;
  rate += harvesters * ECONOMY.dronePerSecond * bonus;
  return rate;
}

function harvestDroneCount(state: SimState): number {
  const total = droneCount(state);
  const role = state.automation.droneRole;
  if (total === 0) return 0;
  if (role === 0) return total;
  if (role === 1) return 0;
  return Math.ceil(total / 2); // 혼합
}

function repairDroneCount(state: SimState): number {
  return droneCount(state) - harvestDroneCount(state);
}

/** 오프라인 정산: 상한 2시간 · 효율 40% · **남은 리저브를 넘지 못한다** · 웨이브는 진행하지 않는다. */
export function applyOffline(state: SimState, seconds: number): void {
  state.offlineGranted = 0;
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const capped = Math.min(seconds, ECONOMY.offlineCapSeconds);
  const raw = autoIncomePerSecond(state) * capped * ECONOMY.offlineEfficiency;
  const granted = grantSalvage(state, raw, false, state.core.x, state.core.y);
  state.offlineGranted = granted;
}

/* ─────────────────────────── 잔해·수집 ─────────────────────────── */

function nearestWreck(state: SimState, x: number, y: number, maxDistance: number): WreckState | null {
  let best: WreckState | null = null;
  let bestDistance = maxDistance;
  for (const wreck of state.wrecks) {
    const distance = Math.hypot(tileCenterX(wreck.tile) - x, tileCenterY(wreck.tile) - y);
    if (distance <= bestDistance) {
      best = wreck;
      bestDistance = distance;
    }
  }
  return best;
}

function decayWreck(wreck: WreckState, dt: number): void {
  // 캐낼수록 마른다. 웨이브 클리어 때 일부 회복한다.
  wreck.richness = Math.max(WRECK.richnessFloor, wreck.richness - (0.5 / 120) * dt);
}

function stepSubHarvest(state: SimState, dt: number): void {
  const sub = state.sub;
  if (sub.downedTicks > 0) return;
  const wreck = nearestWreck(state, sub.pos.x, sub.pos.y, SUB.harvestRange);
  if (!wreck) return;
  const granted = grantSalvage(state, wreckYield(state, wreck) * dt, true, sub.pos.x, sub.pos.y);
  if (granted <= 0) return;
  sub.harvesting = true;
  decayWreck(wreck, dt);
  if (wreck.forward) {
    state.forwardHarvestSeconds += dt;
    // 숨은 해금: «전투 중에» 전방 잔해에 손을 댄다(누적 카운터가 아니라 1회성 행동)
    if (state.phase === 'wave') discover(state, 'deepArchaeology');
  }
}

function stepCollectors(state: SimState, dt: number): void {
  for (const building of state.buildings.values()) {
    const rate = collectorRate(state, building);
    if (rate <= 0 || state.flooded[building.tile] > 0) continue;
    grantSalvage(state, rate * dt, false, tileCenterX(building.tile), tileCenterY(building.tile));
  }
}

function stepDrones(state: SimState, dt: number): void {
  const total = droneCount(state);
  const harvesters = harvestDroneCount(state);
  const bonus = state.researched.has('droneLogistics') ? TECH_EFFECTS.droneLogisticsYield : 1;
  for (let i = 0; i < state.drones.length; i++) {
    const drone = state.drones[i];
    drone.active = i < total;
    if (!drone.active) continue;
    drone.prev.x = drone.pos.x;
    drone.prev.y = drone.pos.y;
    drone.role = i < harvesters ? 'harvest' : 'repair';
    if (drone.role === 'harvest') {
      const wreck = pickDroneWreck(state, i);
      drone.targetTile = wreck ? wreck.tile : -1;
      if (wreck) {
        moveDrone(drone, tileCenterX(wreck.tile), tileCenterY(wreck.tile), DRONES.speed * dt);
        const granted = grantSalvage(
          state,
          ECONOMY.dronePerSecond * bonus * dt,
          false,
          drone.pos.x,
          drone.pos.y,
        );
        drone.carrying = granted > 0 ? drone.carrying + granted : 0;
        if (granted > 0) decayWreck(wreck, dt * 0.5);
      }
      continue;
    }
    const damaged = pickDamagedBuilding(state);
    drone.targetTile = damaged ?? -1;
    if (damaged === null) continue;
    moveDrone(drone, tileCenterX(damaged), tileCenterY(damaged), DRONES.speed * dt);
    const building = state.buildings.get(damaged);
    if (building) {
      building.hp = Math.min(building.maxHp, building.hp + DRONES.repairPerSecond * dt);
    }
  }
}

function moveDrone(drone: { pos: { x: number; y: number } }, tx: number, ty: number, travel: number): void {
  const dx = tx - drone.pos.x;
  const dy = ty - drone.pos.y;
  const length = Math.hypot(dx, dy);
  if (length <= 1e-4) return;
  const step = Math.min(travel, length);
  drone.pos.x += (dx / length) * step;
  drone.pos.y += (dy / length) * step;
}

/** 결정적 argmax: richness 내림 → 거리 → 타일 인덱스. 드론마다 서로 다른 잔해를 고른다. */
function pickDroneWreck(state: SimState, droneIndex: number): WreckState | null {
  if (state.wrecks.length === 0) return null;
  const sorted = [...state.wrecks].sort((a, b) => {
    if (b.richness !== a.richness) return b.richness - a.richness;
    const da = Math.hypot(tileCenterX(a.tile) - state.core.x, tileCenterY(a.tile) - state.core.y);
    const db = Math.hypot(tileCenterX(b.tile) - state.core.x, tileCenterY(b.tile) - state.core.y);
    if (da !== db) return da - db;
    return a.tile - b.tile;
  });
  return sorted[droneIndex % sorted.length];
}

function pickDamagedBuilding(state: SimState): TileIndex | null {
  let best: TileIndex | null = null;
  let bestRatio = 1;
  for (const building of state.buildings.values()) {
    const ratio = building.hp / building.maxHp;
    if (ratio >= 1) continue;
    if (ratio < bestRatio || (ratio === bestRatio && best !== null && building.tile < best)) {
      best = building.tile;
      bestRatio = ratio;
    }
  }
  return best;
}

function stepWallRebuild(state: SimState, dt: number): void {
  if (state.automation.autoRebuildWalls !== 1) return;
  if (!state.researched.has('reinforcedWalls')) return;
  if (state.destroyedWalls.length === 0) return;
  state.wallRebuildTimer -= dt;
  if (state.wallRebuildTimer > 0) return;
  state.wallRebuildTimer = DRONES.wallRebuildInterval;
  const cost = BUILDINGS.bulkhead.cost.scrap;
  if (state.scrap < DRONES.wallRebuildMinScrap || state.scrap < cost) return;
  const tile = state.destroyedWalls.find((candidate) => !state.buildings.has(candidate) && state.flooded[candidate] === 0);
  if (tile === undefined) return;
  state.destroyedWalls = state.destroyedWalls.filter((candidate) => candidate !== tile);
  state.scrap -= cost;
  const maxHp = buildingMaxHp(state, 'bulkhead', 0);
  state.buildings.set(tile, {
    tile,
    id: 'bulkhead',
    level: 0,
    hp: maxHp,
    maxHp,
    cooldown: 0,
    charge: 1,
    aim: 0,
    policy: 'nearest',
    onThermal: state.terrain[tile] === TERRAIN.thermal,
    investedScrap: cost,
    investedBiomass: 0,
  });
  state.walls[tile] = 1;
  state.events.push({ kind: 'built', tile, building: 'bulkhead' });
  markFieldDirty(state);
}

export function stepEconomy(state: SimState, dt: number): void {
  if (state.phase === 'build') state.buildSeconds += dt;
  stepSubHarvest(state, dt);
  stepCollectors(state, dt);
  stepDrones(state, dt);
  stepWallRebuild(state, dt);
}

/* ─────────────────────────── 숨은 해금 ─────────────────────────── */

export function discover(state: SimState, id: DiscoveryId): void {
  if (state.discovered.has(id)) return; // 중복 지급 불가
  state.discovered.add(id);
  state.insight += INSIGHT_REWARD.discovery;
  state.events.push({ kind: 'discovered', id, at: { x: state.core.x, y: state.core.y } });
  refreshUnlocks(state);
}

/** 건설·강화 시점에만 검사한다(매 틱 전수 검사 금지). */
export function checkPlacementDiscoveries(state: SimState): void {
  let attackOnThermal = 0;
  for (const building of state.buildings.values()) {
    if (BUILDINGS[building.id].damage > 0 && building.onThermal) attackOnThermal++;
  }
  if (attackOnThermal >= 2) discover(state, 'ventResonance');
}

export function discoveryProgress(state: SimState, id: DiscoveryId): number {
  if (state.discovered.has(id)) return 1;
  if (id === 'ventResonance') {
    let count = 0;
    for (const building of state.buildings.values()) {
      if (BUILDINGS[building.id].damage > 0 && building.onThermal) count++;
    }
    return Math.min(0.99, count / 2);
  }
  if (id === 'flawlessPair') return Math.min(0.99, state.consecutiveFlawless / 2);
  return Math.min(0.99, state.forwardHarvestSeconds / 5);
}

export function discoveryHints(state: SimState): { id: DiscoveryId; progress: number }[] {
  const hints: { id: DiscoveryId; progress: number }[] = [];
  for (const id of DISCOVERY_IDS) {
    if (state.discovered.has(id)) continue;
    const progress = discoveryProgress(state, id);
    if (progress >= HINT_THRESHOLD) hints.push({ id, progress });
  }
  return hints;
}

/* ─────────────────────────── 웨이브 전환 ─────────────────────────── */

export function startBuildPhase(state: SimState, wave: number): void {
  const spec = waveSpec(wave);
  state.phase = 'build';
  state.wave = spec.index;
  state.buildSeconds = 0;
  state.earlyBonusActive = false;
  state.reserveTotal = spec.salvageReserve;
  state.reserveRemaining = spec.salvageReserve;
  state.harvestedThisCycle = 0;
  state.reserveExhaustedNotified = false;
  state.spawnQueue = [];
  state.spawnTimer = 0;
  state.spawnInterval = spec.spawnInterval;
  state.leaksThisWave = 0;
  state.coreDamageThisWave = 0;
  state.events.push({ kind: 'salvageRefilled', reserve: spec.salvageReserve });
}

export function beginWave(state: SimState): void {
  const spec = waveSpec(state.wave);
  state.phase = 'wave';
  state.earlyBonusActive = state.buildSeconds <= ECONOMY.earlyBonusSeconds;
  state.spawnQueue = buildSpawnQueue(state, state.wave);
  state.spawnInterval = spec.spawnInterval;
  state.spawnTimer = 0;
  state.leaksThisWave = 0;
  state.coreDamageThisWave = 0;
  // 실패 시 되돌릴 기준점 — 초반 재반복을 막는 장치
  state.waveStartBuildings = [...state.buildings.values()].map((building) => ({
    tile: building.tile,
    id: building.id,
    level: building.level,
  }));
  state.waveStartEconomy = {
    resources: { scrap: state.scrap, biomass: state.biomass },
    coreHp: state.coreHp,
    salvageRemaining: state.reserveRemaining,
  };
  state.events.push({ kind: 'waveStart', index: state.wave });
}

export function waveReward(state: SimState): number {
  const spec = waveSpec(state.wave);
  const bonus = state.earlyBonusActive ? 1 + ECONOMY.earlyBonusRate : 1;
  return Math.round(spec.rewardScrap * bonus);
}

function floodTiles(state: SimState): void {
  ensureFields(state);
  const field = state.fields.ground(400);
  const candidates: TileIndex[] = [];
  for (let tile = 0; tile < state.terrain.length; tile++) {
    if (state.terrain[tile] !== TERRAIN.water && state.terrain[tile] !== TERRAIN.thermal) continue;
    if (state.flooded[tile] > 0) continue;
    candidates.push(tile);
  }
  candidates.sort((a, b) => {
    const da = field.dist[a];
    const db = field.dist[b];
    if (da !== db) return da - db;
    return a - b;
  });
  const flooded = candidates.slice(0, FLOOD.tiles);
  if (flooded.length === 0) return;
  for (const tile of flooded) {
    state.flooded[tile] = FLOOD.waves;
    const building = state.buildings.get(tile);
    if (building) {
      state.buildings.delete(tile);
      state.walls[tile] = 0;
      state.structures[tile] = 0;
      state.events.push({ kind: 'destroyed', tile, building: building.id });
      if (building.id === 'bulkhead') state.stats.wallsLost++;
    }
  }
  markFieldDirty(state);
  state.events.push({ kind: 'flooded', tiles: flooded });
}

function tickFlooded(state: SimState): void {
  for (let tile = 0; tile < state.flooded.length; tile++) {
    if (state.flooded[tile] > 0) state.flooded[tile]--;
  }
}

export function clearWave(state: SimState): void {
  const index = state.wave;
  const reward = waveReward(state);
  const flawless = state.coreDamageThisWave === 0;
  state.scrap += reward;
  if (index > state.best.wave) {
    state.insight += INSIGHT_REWARD.waveFirstClear;
    state.best = { wave: index, chapter: state.chapter, elapsed: state.stats.elapsed };
  }
  state.wavesCleared = Math.max(state.wavesCleared, index);
  state.consecutiveFlawless = flawless ? state.consecutiveFlawless + 1 : 0;
  state.events.push({ kind: 'waveClear', index, flawless, rewardScrap: reward });
  if (state.consecutiveFlawless >= 2) discover(state, 'flawlessPair');
  if (state.leaksThisWave >= FLOOD.leakThreshold) floodTiles(state);
  tickFlooded(state);
  for (const wreck of state.wrecks) wreck.richness = Math.min(1, wreck.richness + 0.2);
  refreshUnlocks(state);

  if (index >= TOTAL_WAVES) {
    state.phase = 'victory';
    state.events.push({ kind: 'victory', elapsed: state.stats.elapsed });
    return;
  }
  if (index === LAST_WAVE_OF_CHAPTER1) {
    state.phase = 'chapterCleared';
    return;
  }
  startBuildPhase(state, index + 1);
}

export function failWave(state: SimState): void {
  state.phase = 'defeat';
  for (const enemy of state.enemies) enemy.active = false;
  for (const shot of state.shots) shot.active = false;
  state.spawnQueue = [];
  state.events.push({ kind: 'collapsed', wave: state.wave });
}

export function checkWaveEnd(state: SimState): void {
  if (state.phase !== 'wave') return;
  if (state.coreHp <= 0) {
    failWave(state);
    return;
  }
  if (state.spawnQueue.length === 0 && activeEnemyCount(state) === 0) clearWave(state);
}

export function rebuildGrant(state: SimState): number {
  return ECONOMY.retryGrantBase + ECONOMY.retryGrantPerAttempt * state.retryAttempts;
}

/** 실패한 그 웨이브를 다시. 발견·테크·통찰·해금은 유지되고 초반을 다시 하지 않는다. */
export function retryWave(state: SimState): void {
  const grant = rebuildGrant(state);
  state.retryAttempts++;
  state.buildings.clear();
  state.walls.fill(0);
  state.structures.fill(0);
  state.destroyedWalls = [];
  for (const snapshot of state.waveStartBuildings) {
    if (state.flooded[snapshot.tile] > 0) continue;
    const maxHp = buildingMaxHp(state, snapshot.id, snapshot.level);
    const invested = investedCost(snapshot.id, snapshot.level);
    state.buildings.set(snapshot.tile, {
      tile: snapshot.tile,
      id: snapshot.id,
      level: snapshot.level,
      hp: maxHp,
      maxHp,
      cooldown: 0,
      charge: 1,
      aim: 0,
      policy: 'nearest',
      onThermal: state.terrain[snapshot.tile] === TERRAIN.thermal,
      investedScrap: invested.scrap,
      investedBiomass: invested.biomass,
    });
    if (snapshot.id === 'bulkhead') state.walls[snapshot.tile] = 1;
    else state.structures[snapshot.tile] = 1;
  }
  state.coreHp = CORE.maxHp;
  state.sub.hp = SUB.maxHp;
  state.sub.downedTicks = 0;
  state.scrap += grant;
  markFieldDirty(state);
  startBuildPhase(state, state.wave);
}

/** 2장 진입. 레이아웃이 바뀌므로 건물은 남기고 가고, 고철 가치의 절반을 이전 예산으로 돌려준다. */
export function advanceChapter(state: SimState): void {
  let refund = 0;
  for (const building of state.buildings.values()) {
    refund += building.investedScrap * CHAPTER_RELOCATION_REFUND;
  }
  loadChapter(state, 2);
  state.insight += INSIGHT_REWARD.chapterAdvance;
  state.scrap += Math.round(refund);
  state.coreHp = CORE.maxHp;
  state.retryAttempts = 0;
  state.waveStartBuildings = [];
  state.waveStartEconomy = null;
  state.events.push({ kind: 'chapterEntered', chapter: 2 });
  startBuildPhase(state, LAST_WAVE_OF_CHAPTER1 + 1);
}

export const ticksFromSeconds = (seconds: number): number => Math.round(seconds / TICK_SECONDS);
