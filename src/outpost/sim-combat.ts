/**
 * 전투 스텝: 스폰 · 적 이동/벽 돌파 · 터렛 조준·발사·폭발 · 투사체 · 잠수정 · 액티브.
 * 모든 수치는 content.ts 에서만 온다. 여기서 난수는 시드 PRNG만 쓴다.
 */
import { GRID_H, GRID_W, TICK_SECONDS, type AbilityId, type TileIndex } from './contract.ts';
import {
  ABILITIES,
  BOSS_SUMMON,
  BUILDINGS,
  HP_GROWTH_PER_WAVE,
  SUB,
  TERRAIN,
  tileIndex,
  tileX,
  tileY,
  waveSpec,
} from './content.ts';
import { DIRECTIONS } from './path.ts';
import {
  buildingDamage,
  buildingPierces,
  buildingSplash,
  damageAfterArmor,
  ensureFields,
  markFieldDirty,
  pushShot,
  spawnEnemy,
  subSpeed,
  tileAtPoint,
  tileCenterX,
  tileCenterY,
  type BuildingState,
  type EnemyState,
  type SimState,
} from './sim-state.ts';

const SLOW_FACTOR = 0.65;

/* ─────────────────────────── 스폰 ─────────────────────────── */

export function stepSpawning(state: SimState, dt: number): void {
  if (state.phase !== 'wave') return;
  if (state.spawnQueue.length > 0) {
    state.spawnTimer -= dt;
    while (state.spawnTimer <= 0 && state.spawnQueue.length > 0) {
      const order = state.spawnQueue[0];
      const spawned = spawnEnemy(state, order, state.wave, HP_GROWTH_PER_WAVE);
      if (!spawned) break; // 상한 도달 — 다음 틱에 다시 시도
      state.spawnQueue.shift();
      state.spawnTimer += state.spawnInterval;
    }
  }
  // 보스는 주기적으로 군체를 소환한다(총량 상한이 있어 무한 증식하지 않는다).
  for (const enemy of state.enemies) {
    if (!enemy.active || enemy.role !== 'leviathan' || enemy.summonsLeft <= 0) continue;
    enemy.summonTimer -= dt;
    if (enemy.summonTimer > 0) continue;
    enemy.summonTimer = BOSS_SUMMON.everySeconds;
    for (let i = 0; i < BOSS_SUMMON.count && enemy.summonsLeft > 0; i++) {
      const tile = tileAtPoint(enemy.pos.x, enemy.pos.y);
      const minion = spawnEnemy(state, { role: BOSS_SUMMON.role, variant: 'base', vent: tile }, state.wave, HP_GROWTH_PER_WAVE);
      if (!minion) break;
      enemy.summonsLeft--;
    }
  }
}

/* ─────────────────────────── 적 이동 ─────────────────────────── */

function damageBuilding(state: SimState, building: BuildingState, amount: number): void {
  building.hp -= amount;
  if (building.hp > 0) return;
  state.buildings.delete(building.tile);
  state.walls[building.tile] = 0;
  state.structures[building.tile] = 0;
  state.events.push({ kind: 'destroyed', tile: building.tile, building: building.id });
  if (building.id === 'bulkhead') {
    state.stats.wallsLost++;
    if (!state.destroyedWalls.includes(building.tile)) state.destroyedWalls.push(building.tile);
  }
  markFieldDirty(state);
}

function hitCore(state: SimState, enemy: EnemyState): void {
  const damage = enemy.coreDamage;
  state.coreHp = Math.max(0, state.coreHp - damage);
  state.coreDamageThisWave += damage;
  state.leaksThisWave++;
  state.stats.leaks++;
  state.events.push({ kind: 'coreHit', damage });
  enemy.active = false;
}

function nextTileFromFlow(state: SimState, enemy: EnemyState, tile: TileIndex): TileIndex {
  const field = enemy.flying ? state.fields.flying() : state.fields.ground(enemy.wallCost);
  const dir = field.flow[tile];
  if (dir < 0) return -1;
  const step = DIRECTIONS[dir];
  const nx = tileX(tile) + step.dx;
  const ny = tileY(tile) + step.dy;
  if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) return -1;
  return tileIndex(nx, ny);
}

function moveToward(enemy: EnemyState, targetX: number, targetY: number, distance: number): void {
  const dx = targetX - enemy.pos.x;
  const dy = targetY - enemy.pos.y;
  const length = Math.hypot(dx, dy);
  if (length <= 1e-6) return;
  enemy.facing = Math.atan2(dy, dx);
  const travel = Math.min(distance, length);
  enemy.pos.x += (dx / length) * travel;
  enemy.pos.y += (dy / length) * travel;
}

export function stepEnemies(state: SimState, dt: number): void {
  ensureFields(state);
  for (const enemy of state.enemies) {
    if (!enemy.active) continue;
    enemy.prev.x = enemy.pos.x;
    enemy.prev.y = enemy.pos.y;
    enemy.breaching = false;
    if (enemy.slowTicks > 0) enemy.slowTicks--;

    const tile = tileAtPoint(enemy.pos.x, enemy.pos.y);
    if (state.terrain[tile] === TERRAIN.core) {
      hitCore(state, enemy);
      continue;
    }

    const speed = enemy.speed * (enemy.slowTicks > 0 ? SLOW_FACTOR : 1);
    const travel = speed * dt;

    if (enemy.flying) {
      // 비행은 벽·암반을 전부 무시하고 코어로 직행한다 — 미로가 통하지 않는다.
      moveToward(enemy, state.core.x, state.core.y, travel);
      continue;
    }

    const next = nextTileFromFlow(state, enemy, tile);
    if (next < 0) {
      moveToward(enemy, state.core.x, state.core.y, travel);
      continue;
    }
    const blocker = state.buildings.get(next);
    if (blocker) {
      // 경로 위 구조물은 부수고 지나간다(완전 봉쇄가 불가능한 이유).
      enemy.breaching = true;
      const cx = tileCenterX(next);
      const cy = tileCenterY(next);
      enemy.facing = Math.atan2(cy - enemy.pos.y, cx - enemy.pos.x);
      if (enemy.wallDps > 0) damageBuilding(state, blocker, enemy.wallDps * dt);
      continue;
    }
    moveToward(enemy, tileCenterX(next), tileCenterY(next), travel);
  }
}

/* ─────────────────────────── 피해 적용 ─────────────────────────── */

export function damageEnemy(state: SimState, enemy: EnemyState, raw: number, pierces: boolean): void {
  if (!enemy.active) return;
  enemy.hp -= damageAfterArmor(raw, enemy.armor, pierces);
  if (enemy.hp > 0) return;
  enemy.active = false;
  state.biomass += enemy.biomass;
  state.stats.kills++;
  state.events.push({
    kind: 'enemyKilled',
    at: { x: enemy.pos.x, y: enemy.pos.y },
    role: enemy.role,
    biomass: enemy.biomass,
  });
}

function canTarget(building: BuildingState, enemy: EnemyState): boolean {
  const targets = BUILDINGS[building.id].targets;
  if (targets === 'none') return false;
  if (targets === 'ground') return !enemy.flying;
  if (targets === 'air') return enemy.flying;
  return true;
}

function groundDistanceToCore(state: SimState, enemy: EnemyState): number {
  const tile = tileAtPoint(enemy.pos.x, enemy.pos.y);
  const field = enemy.flying ? state.fields.flying() : state.fields.ground(enemy.wallCost);
  return field.dist[tile];
}

function pickTarget(state: SimState, building: BuildingState): EnemyState | null {
  const spec = BUILDINGS[building.id];
  const bx = tileCenterX(building.tile);
  const by = tileCenterY(building.tile);
  let best: EnemyState | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestFlying = false;
  for (const enemy of state.enemies) {
    if (!enemy.active || !canTarget(building, enemy)) continue;
    const distance = Math.hypot(enemy.pos.x - bx, enemy.pos.y - by);
    if (distance > spec.range || distance < spec.minRange) continue;
    let score: number;
    if (building.policy === 'leader') score = groundDistanceToCore(state, enemy);
    else score = distance;
    if (building.policy === 'air') {
      // 공중 우선. 같은 분류 안에서는 가까운 쪽.
      if (best !== null && bestFlying !== enemy.flying) {
        if (bestFlying) continue;
        best = enemy;
        bestScore = score;
        bestFlying = enemy.flying;
        continue;
      }
    }
    if (score < bestScore || (score === bestScore && best !== null && enemy.id < best.id)) {
      best = enemy;
      bestScore = score;
      bestFlying = enemy.flying;
    }
  }
  return best;
}

function fireBuilding(state: SimState, building: BuildingState, target: EnemyState): void {
  const raw = buildingDamage(state, building);
  const pierces = buildingPierces(state, building);
  const splash = buildingSplash(state, building);
  const bx = tileCenterX(building.tile);
  const by = tileCenterY(building.tile);
  building.aim = Math.atan2(target.pos.y - by, target.pos.x - bx);
  const kind = building.id === 'mortar' ? 'mortar' : building.id === 'resonator' ? 'resonator' : 'harpoon';
  pushShot(state, bx, by, target.pos.x, target.pos.y, kind);
  if (splash <= 0) {
    damageEnemy(state, target, raw, pierces);
    return;
  }
  const centerX = target.pos.x;
  const centerY = target.pos.y;
  for (const enemy of state.enemies) {
    if (!enemy.active || !canTarget(building, enemy)) continue;
    if (Math.hypot(enemy.pos.x - centerX, enemy.pos.y - centerY) > splash) continue;
    damageEnemy(state, enemy, raw, pierces);
  }
}

export function stepBuildings(state: SimState, dt: number): void {
  for (const building of state.buildings.values()) {
    const spec = BUILDINGS[building.id];
    if (spec.fireInterval <= 0 || spec.damage <= 0) continue;
    if (state.flooded[building.tile] > 0) continue;
    if (building.cooldown > 0) building.cooldown = Math.max(0, building.cooldown - dt);
    building.charge = spec.fireInterval > 0 ? 1 - building.cooldown / spec.fireInterval : 1;
    if (building.cooldown > 0) continue;
    const target = pickTarget(state, building);
    if (!target) continue;
    fireBuilding(state, building, target);
    building.cooldown = spec.fireInterval;
    building.charge = 0;
  }
}

export function stepShots(state: SimState, dt: number): void {
  for (const shot of state.shots) {
    if (!shot.active) continue;
    shot.life -= dt * 5;
    if (shot.life <= 0) shot.active = false;
  }
}

/* ─────────────────────────── 잠수정 ─────────────────────────── */

export function stepSub(state: SimState, dt: number): void {
  const sub = state.sub;
  sub.prev.x = sub.pos.x;
  sub.prev.y = sub.pos.y;
  sub.harvesting = false;
  for (const ability of ['sonarPulse', 'weld'] as AbilityId[]) {
    if (sub.cooldowns[ability] > 0) sub.cooldowns[ability] = Math.max(0, sub.cooldowns[ability] - dt);
  }
  if (sub.downedTicks > 0) {
    sub.downedTicks--;
    if (sub.downedTicks === 0) {
      sub.pos.x = state.core.x;
      sub.pos.y = state.core.y - 1;
      sub.prev.x = sub.pos.x;
      sub.prev.y = sub.pos.y;
      sub.target.x = sub.pos.x;
      sub.target.y = sub.pos.y;
      sub.hp = SUB.maxHp;
    }
    return;
  }

  const dx = sub.target.x - sub.pos.x;
  const dy = sub.target.y - sub.pos.y;
  const length = Math.hypot(dx, dy);
  if (length > 1e-4) {
    const travel = Math.min(subSpeed(state) * dt, length);
    sub.pos.x += (dx / length) * travel;
    sub.pos.y += (dy / length) * travel;
  }

  // 자동 사격: 가장 가까운 적 1기
  if (sub.fireCooldown > 0) sub.fireCooldown = Math.max(0, sub.fireCooldown - dt);
  if (sub.fireCooldown === 0) {
    let best: EnemyState | null = null;
    let bestDistance: number = SUB.fireRange;
    for (const enemy of state.enemies) {
      if (!enemy.active) continue;
      const distance = Math.hypot(enemy.pos.x - sub.pos.x, enemy.pos.y - sub.pos.y);
      if (distance <= bestDistance && (best === null || distance < bestDistance || enemy.id < best.id)) {
        best = enemy;
        bestDistance = distance;
      }
    }
    if (best) {
      pushShot(state, sub.pos.x, sub.pos.y, best.pos.x, best.pos.y, 'harpoon');
      damageEnemy(state, best, SUB.damage, false);
      sub.fireCooldown = SUB.fireInterval;
    }
  }

  // 코어 정박 수리: 전방에서 긁힌 잠수정은 물러나야 회복된다
  if (Math.hypot(sub.pos.x - state.core.x, sub.pos.y - state.core.y) <= SUB.dockRange && sub.hp < SUB.maxHp) {
    sub.hp = Math.min(SUB.maxHp, sub.hp + SUB.dockRepairPerSecond * dt);
  }

  // 접촉 피해
  let contact = 0;
  for (const enemy of state.enemies) {
    if (!enemy.active) continue;
    if (Math.hypot(enemy.pos.x - sub.pos.x, enemy.pos.y - sub.pos.y) <= SUB.contactRange) {
      contact += enemy.coreDamage * SUB.contactDamagePerSecond;
    }
  }
  if (contact > 0) {
    sub.hp -= contact * dt;
    if (sub.hp <= 0) {
      sub.hp = 0;
      sub.downedTicks = Math.round(SUB.downedSeconds / TICK_SECONDS);
      state.events.push({ kind: 'subDowned', at: { x: sub.pos.x, y: sub.pos.y } });
    }
  }
}

/* ─────────────────────────── 액티브 ─────────────────────────── */

export function castSonarPulse(state: SimState, x: number, y: number, perfect: boolean): void {
  const spec = ABILITIES.sonarPulse;
  const damage = perfect ? spec.perfectDamage : spec.damage;
  const slowTicks = Math.round((perfect ? spec.perfectSlowSeconds : spec.slowSeconds) / TICK_SECONDS);
  pushShot(state, state.sub.pos.x, state.sub.pos.y, x, y, 'pulse');
  for (const enemy of state.enemies) {
    if (!enemy.active) continue;
    if (Math.hypot(enemy.pos.x - x, enemy.pos.y - y) > spec.radius) continue;
    enemy.slowTicks = Math.max(enemy.slowTicks, slowTicks);
    damageEnemy(state, enemy, damage, false);
  }
}

export function castWeld(state: SimState, x: number, y: number, perfect: boolean): void {
  const spec = ABILITIES.weld;
  const tile = tileAtPoint(x, y);
  const building = state.buildings.get(tile);
  if (building) {
    const max = building.maxHp;
    building.hp = Math.min(max, building.hp + (perfect ? spec.perfectStructureHeal : spec.structureHeal));
    return;
  }
  // 구조물이 없으면 코어를 수리한다 — 자원으로 덮을 수 없는 유일한 코어 회복 수단.
  const heal = perfect ? spec.perfectCoreHeal : spec.coreHeal;
  state.coreHp = Math.min(100, state.coreHp + heal);
}

/** 정밀 판정 게이지: 0↔1 왕복. 계약의 AbilityStateView.meter 와 같은 식을 쓴다. */
export function abilityMeter(state: SimState, rate: number): number {
  const seconds = state.tick * TICK_SECONDS;
  const cycle = (seconds * rate) % 2;
  return cycle <= 1 ? cycle : 2 - cycle;
}

export function waveSpawnCountdown(state: SimState): number {
  if (state.phase !== 'wave' || state.spawnQueue.length === 0) return -1;
  return Math.max(0, state.spawnTimer);
}

export function currentSpawnInterval(wave: number): number {
  return waveSpec(wave).spawnInterval;
}
