import { AWAKE_RANGE, ENEMIES, PROJECTILE_SPEED, WARD_SLOW } from './data';
import { canStand, findPath, lineOfSight } from './dungeon';
import { damageEnemy, damagePlayer, spawnNear } from './combat';
import type { World } from './combat';
import { direction, dist } from './geometry';
import { nextInt } from './rng';
import type { Enemy, EnemyAttackKind } from './types';

const PLAYER_RADIUS = 0.4;
/** 화면이 예고 원을 그릴 때 쓰는 반경. 판정과 같은 값을 공유한다. */
export const TELEGRAPH_RADIUS = { sweep: 5, slam: 2.5 } as const;
const SWEEP_RADIUS = TELEGRAPH_RADIUS.sweep;
const SLAM_RADIUS = TELEGRAPH_RADIUS.slam;
/** 보스 위험 공격 예고 길이(틱). 완료 기준: 15틱 이상. */
export const BOSS_WINDUP: Record<'sweep' | 'slam' | 'summon', number> = { sweep: 24, slam: 20, summon: 15 };

export function updateEnemies(world: World): void {
  const { state } = world; const p = state.player;
  const ward = state.tick < p.wardUntil;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.slowed = ward && dist(enemy, p) <= 6;
    if (enemy.mode === 'sleep') { wake(world, enemy); continue; }
    if (state.tick < enemy.staggerUntil) continue;
    if (enemy.mode === 'windup') { if (state.tick >= enemy.modeUntil) resolveAttack(world, enemy); continue; }
    if (enemy.mode === 'recover') { if (state.tick >= enemy.modeUntil) enemy.mode = 'chase'; continue; }
    if (enemy.boss) bossThink(world, enemy); else think(world, enemy);
  }
  state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
}

function wake(world: World, enemy: Enemy): void {
  const p = world.state.player;
  if (dist(enemy, p) <= AWAKE_RANGE && lineOfSight(world.dungeon, enemy, p)) {
    enemy.mode = 'chase';
    // 무리 전체가 함께 달려들어야 '쓸어버리는' 장면이 나온다.
    for (const ally of world.grid.query(enemy, 6)) if (ally.mode === 'sleep') ally.mode = 'chase';
  }
}

function think(world: World, enemy: Enemy): void {
  const p = world.state.player; const def = ENEMIES[enemy.kind]; const d = dist(enemy, p);
  face(enemy, p.x, p.z);
  if (def.attack === 'throw') {
    if (d < 4.5) { step(world, enemy, -1); return; }
    if (d <= def.range && lineOfSight(world.dungeon, enemy, p)) { begin(world, enemy, 'throw', def.windup); return; }
    step(world, enemy, 1); return;
  }
  if (d <= def.range + PLAYER_RADIUS) { begin(world, enemy, 'melee', def.windup); return; }
  step(world, enemy, 1);
}

function bossThink(world: World, enemy: Enemy): void {
  const { state } = world; const p = state.player; const d = dist(enemy, p);
  face(enemy, p.x, p.z);
  const enraged = enemy.hp < enemy.maxHp / 2;
  if (state.tick >= enemy.nextSpecial) {
    const reeds = world.grid.query(enemy, 10).filter(e => e.kind === 'reed').length;
    const options: ('sweep' | 'slam' | 'summon')[] = [];
    if (d <= SWEEP_RADIUS + 0.5) options.push('sweep');
    options.push('slam');
    if (reeds < 8) options.push('summon');
    const choice = options[nextInt(state, 0, options.length - 1)]!;
    enemy.nextSpecial = state.tick + (enraged ? 45 : 75);
    begin(world, enemy, choice, BOSS_WINDUP[choice]);
    return;
  }
  if (d > 3) step(world, enemy, enraged ? 1.3 : 1);
}

function begin(world: World, enemy: Enemy, attack: EnemyAttackKind, windup: number): void {
  const { state } = world; const p = state.player;
  enemy.mode = 'windup'; enemy.attack = attack; enemy.modeUntil = state.tick + windup;
  enemy.attackTarget = attack === 'sweep' || attack === 'summon' ? { x: enemy.x, z: enemy.z } : { x: p.x, z: p.z };
  if (attack === 'sweep' || attack === 'slam') {
    const radius = attack === 'sweep' ? SWEEP_RADIUS : SLAM_RADIUS;
    state.events.push({ type: 'telegraph', enemy: enemy.id, attack, x: enemy.attackTarget.x, z: enemy.attackTarget.z, radius, ticks: windup });
  }
}

function resolveAttack(world: World, enemy: Enemy): void {
  const { state } = world; const p = state.player; const def = ENEMIES[enemy.kind];
  const attack = enemy.attack;
  if (attack === 'melee' && dist(enemy, p) <= def.range + PLAYER_RADIUS + 0.4) damagePlayer(state, enemy.damage, 'melee');
  if (attack === 'throw') {
    const dir = direction(enemy, enemy.attackTarget);
    state.projectiles.push({ id: state.nextId++, x: enemy.x, z: enemy.z, vx: dir.x * PROJECTILE_SPEED, vz: dir.z * PROJECTILE_SPEED, until: state.tick + 45, damage: enemy.damage });
  }
  if (attack === 'sweep' && dist(enemy, p) <= SWEEP_RADIUS + PLAYER_RADIUS) damagePlayer(state, enemy.damage, 'sweep');
  if (attack === 'slam' && dist(enemy.attackTarget, p) <= SLAM_RADIUS + PLAYER_RADIUS) damagePlayer(state, Math.round(enemy.damage * 0.8), 'slam');
  if (attack === 'summon') for (let i = 0; i < 4; i++) spawnNear(world, enemy, (i / 4) * Math.PI * 2, 2.5, 'reed');
  enemy.attack = null; enemy.mode = 'recover'; enemy.modeUntil = state.tick + def.recover;
}

function face(enemy: Enemy, x: number, z: number): void { enemy.facing = Math.atan2(x - enemy.x, z - enemy.z); }

/** sign=1 접근, -1 후퇴. 시야가 막히면 드물게 길찾기 지점을 갱신한다. */
function step(world: World, enemy: Enemy, sign: number): void {
  const { state, dungeon } = world; const p = state.player;
  let goal = { x: p.x, z: p.z };
  if (sign > 0 && !lineOfSight(dungeon, enemy, p, enemy.radius * 0.8)) {
    if (state.tick >= enemy.repathAt || !enemy.waypoint) {
      // 100마리가 같은 틱에 A*를 돌리지 않도록 id로 분산한다.
      enemy.repathAt = state.tick + 20 + (enemy.id % 10);
      enemy.waypoint = findPath(dungeon, enemy, p)?.[0] ?? null;
    }
    if (enemy.waypoint) goal = enemy.waypoint;
  } else enemy.waypoint = null;
  const dir = direction(enemy, goal);
  let sx = dir.x * sign; let sz = dir.z * sign;
  for (const other of world.grid.query(enemy, enemy.radius * 2)) {
    if (other.id === enemy.id) continue;
    const dx = enemy.x - other.x; const dz = enemy.z - other.z; const d = Math.hypot(dx, dz) || 0.01;
    const push = (enemy.radius + other.radius - d) / (enemy.radius + other.radius);
    if (push > 0) { sx += (dx / d) * push * 1.5; sz += (dz / d) * push * 1.5; }
  }
  const length = Math.hypot(sx, sz) || 1;
  const speed = Math.abs(sign) * enemy.speed * (enemy.slowed ? 1 - WARD_SLOW : 1);
  const nx = enemy.x + (sx / length) * speed; const nz = enemy.z + (sz / length) * speed;
  if (canStand(dungeon, nx, nz, enemy.radius)) { enemy.x = nx; enemy.z = nz; }
  else if (canStand(dungeon, nx, enemy.z, enemy.radius)) enemy.x = nx;
  else if (canStand(dungeon, enemy.x, nz, enemy.radius)) enemy.z = nz;
  if (enemy.waypoint && dist(enemy, enemy.waypoint) < 0.5) enemy.waypoint = null;
}

export function updateProjectiles(world: World): void {
  const { state, dungeon } = world; const p = state.player;
  state.projectiles = state.projectiles.filter(shot => {
    shot.x += shot.vx; shot.z += shot.vz;
    if (state.tick >= shot.until || !canStand(dungeon, shot.x, shot.z, 0.05)) return false;
    if (dist(shot, p) <= PLAYER_RADIUS + 0.25) { damagePlayer(state, shot.damage, 'throw'); return false; }
    return true;
  });
}

export function updateZones(world: World): void {
  const { state } = world;
  state.fires = state.fires.filter(fire => {
    if (state.tick >= fire.nextPulse) {
      fire.nextPulse = state.tick + 10;
      for (const enemy of world.grid.query(fire, fire.radius)) damageEnemy(world, enemy, fire.damage, { source: 'fire', from: fire, ignoreShield: true });
    }
    return state.tick < fire.until;
  });
}
