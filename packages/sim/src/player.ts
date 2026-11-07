import { SKILLS, WARD_TICKS } from './data';
import { canStand, findPath, lineOfSight } from './dungeon';
import { collectGlobes, damageEnemy, pickUp, skillDamage } from './combat';
import type { World } from './combat';
import { direction, dist, inCone, segmentDistance } from './geometry';
import { computeStats } from './loot';
import { HOT_SLOTS } from './types';
import type { Cast, Command, Enemy, HotSlot, SkillId, TickInput, Vec } from './types';

const PICKUP_RANGE = 1;

export function updatePlayer(world: World, input: TickInput): void {
  const { state } = world; const p = state.player;
  for (const command of input.commands) applyCommand(world, command);
  p.spirit = Math.min(100, p.spirit + p.stats.spiritRegen);
  readOrders(world, input);
  if (input.cast) tryCast(world, input.cast.slot, input.cast.at);
  if (p.cast) advanceCast(world, p.cast);
  else executeOrder(world, input.standStill);
  collectGlobes(state);
}

function readOrders(world: World, input: TickInput): void {
  const p = world.state.player;
  if (input.attack !== null) p.order = { kind: 'attack', enemy: input.attack };
  else if (input.pickup !== null) p.order = { kind: 'pickup', item: input.pickup };
  else if (input.moveTo) {
    p.order = { kind: 'move', target: input.moveTo };
    // 누른 채 끌 때 매 틱 A*를 돌리지 않도록 목표가 의미 있게 바뀐 경우만 다시 찾는다.
    if (!p.pathGoal || dist(p.pathGoal, input.moveTo) > 0.5 || p.path.length === 0) setPath(world, input.moveTo);
  }
}

function setPath(world: World, goal: Vec): void {
  const p = world.state.player;
  p.pathGoal = { x: goal.x, z: goal.z };
  p.path = lineOfSight(world.dungeon, p, goal, 0.35) ? [{ x: goal.x, z: goal.z }] : findPath(world.dungeon, p, goal) ?? [];
}

function executeOrder(world: World, standStill: boolean): void {
  const { state } = world; const p = state.player; const order = p.order;
  if (order.kind === 'move') { if (!followPath(world)) p.order = { kind: 'idle' }; return; }
  if (order.kind === 'attack') {
    const enemy = state.enemies.find(e => e.id === order.enemy && e.hp > 0);
    if (!enemy) { p.order = { kind: 'idle' }; p.path = []; return; }
    if (standStill || dist(p, enemy) <= SKILLS.slash.range + enemy.radius - 0.2) { startCast(world, 'slash', enemy); return; }
    chase(world, enemy); return;
  }
  if (order.kind === 'pickup') {
    const ground = state.items.find(item => item.id === order.item);
    if (!ground) { p.order = { kind: 'idle' }; return; }
    if (dist(p, ground) <= PICKUP_RANGE) { pickUp(state, ground.id); p.order = { kind: 'idle' }; p.path = []; return; }
    chase(world, ground);
  }
}

function chase(world: World, target: Vec): void {
  const p = world.state.player;
  if (!p.pathGoal || dist(p.pathGoal, target) > 1 || p.path.length === 0) setPath(world, target);
  followPath(world);
}

/** 경로를 따라 한 틱 이동. 아직 갈 곳이 남았으면 true. */
function followPath(world: World): boolean {
  const p = world.state.player;
  let budget = p.stats.moveSpeed;
  while (budget > 0 && p.path.length > 0) {
    const next = p.path[0]!; const d = dist(p, next);
    if (d <= budget) { if (!moveTo(world, next.x, next.z)) { p.path = []; return false; } budget -= d; p.path.shift(); continue; }
    const dir = direction(p, next);
    p.facing = Math.atan2(dir.x, dir.z);
    if (!moveTo(world, p.x + dir.x * budget, p.z + dir.z * budget)) { p.path = []; return false; }
    budget = 0;
  }
  return p.path.length > 0;
}

function moveTo(world: World, x: number, z: number): boolean {
  const p = world.state.player; const d = world.dungeon;
  if (canStand(d, x, z, 0.35)) { p.x = x; p.z = z; return true; }
  if (canStand(d, x, p.z, 0.35)) { p.x = x; return true; } // 벽을 따라 미끄러지기
  if (canStand(d, p.x, z, 0.35)) { p.z = z; return true; }
  return false;
}

function tryCast(world: World, slot: HotSlot | 'lmb', at: Vec): void {
  const p = world.state.player;
  if (p.cast) return;
  const skill: SkillId | null = slot === 'lmb' ? 'slash' : p.slots[slot];
  if (skill) startCast(world, skill, at);
}

export function canCast(world: World, skill: SkillId): boolean {
  const { state } = world; const p = state.player; const def = SKILLS[skill];
  return p.level >= def.unlock && state.tick >= p.cooldowns[skill] && p.spirit >= def.cost;
}

function castLength(world: World, skill: SkillId): { total: number; hit: number } {
  const def = SKILLS[skill];
  const speed = skill === 'slash' || skill === 'spin' ? world.state.player.stats.attackSpeed : 1;
  return { total: Math.max(4, Math.round(def.castTicks / speed)), hit: Math.max(1, Math.round(def.hitTick / speed)) };
}

function startCast(world: World, skill: SkillId, at: Vec): void {
  const { state } = world; const p = state.player; const def = SKILLS[skill];
  if (p.cast || !canCast(world, skill)) return;
  const dir = direction(p, at);
  p.facing = Math.atan2(dir.x, dir.z);
  p.spirit = Math.min(100, p.spirit - def.cost + def.gain);
  if (def.cooldown > 0) p.cooldowns[skill] = state.tick + Math.round(def.cooldown * p.stats.cooldownMult);
  let target = { x: at.x, z: at.z };
  if (skill === 'talisman' && dist(p, at) > def.range) target = { x: p.x + dir.x * def.range, z: p.z + dir.z * def.range };
  if (skill === 'dash') {
    const length = Math.min(def.range, Math.max(1.5, dist(p, at)));
    target = { x: p.x + dir.x * length, z: p.z + dir.z * length };
    p.invulnerableUntil = state.tick + def.castTicks;
  }
  p.cast = { skill, start: state.tick, target, dir, hitDone: false, hit: [] };
  p.path = [];
  state.events.push({ type: 'cast', skill, x: p.x, z: p.z, tx: target.x, tz: target.z });
}

function advanceCast(world: World, cast: Cast): void {
  const { state } = world; const p = state.player;
  const elapsed = state.tick - cast.start; const timing = castLength(world, cast.skill);
  if (cast.skill === 'dash') dashStep(world, cast, elapsed);
  else if (!cast.hitDone && elapsed >= timing.hit) { cast.hitDone = true; resolveSkill(world, cast); }
  if (elapsed + 1 >= timing.total) p.cast = null;
}

function resolveSkill(world: World, cast: Cast): void {
  const { state } = world; const p = state.player; const def = SKILLS[cast.skill];
  const legend = p.stats.legendaries;
  if (cast.skill === 'slash' || cast.skill === 'cleave') {
    const targets = world.grid.query(p, def.range).filter(e => inCone(p, cast.dir, e, def.range, def.halfAngle, e.radius));
    const options = cast.skill === 'cleave' ? { source: 'cleave', stagger: 30, ignoreShield: true } : { source: 'slash', stagger: 6 };
    for (const enemy of targets) damageEnemy(world, enemy, skillDamage(state, cast.skill), options);
    if (cast.skill === 'cleave' && targets.length > 0) state.hitstop = Math.max(state.hitstop, 2);
    return;
  }
  if (cast.skill === 'spin') {
    blast(world, p, def.radius, skillDamage(state, 'spin'), 'spin', 8);
    if (legend.includes('echo_charm')) state.delayed.push({ at: state.tick + 12, kind: 'echo_spin', x: p.x, z: p.z, damage: skillDamage(state, 'spin'), radius: def.radius });
    return;
  }
  if (cast.skill === 'talisman') {
    blast(world, cast.target, def.radius, skillDamage(state, 'talisman'), 'talisman', 10, true);
    if (legend.includes('split_talisman')) {
      const base = Math.atan2(cast.dir.x, cast.dir.z);
      for (let i = 0; i < 3; i++) {
        const angle = base + (i * 2 * Math.PI) / 3;
        state.delayed.push({ at: state.tick + 8, kind: 'split_blast', x: cast.target.x + Math.sin(angle) * 2.5, z: cast.target.z + Math.cos(angle) * 2.5, damage: skillDamage(state, 'talisman', 0.8), radius: 2 });
      }
    }
    return;
  }
  if (cast.skill === 'ward') p.wardUntil = state.tick + WARD_TICKS;
}

export function blast(world: World, center: Vec, radius: number, damage: number, source: string, stagger: number, ignoreShield = false): void {
  world.state.events.push({ type: 'blast', x: center.x, z: center.z, radius, source });
  for (const enemy of world.grid.query(center, radius)) damageEnemy(world, enemy, damage, { source, stagger, ignoreShield, from: center });
}

function dashStep(world: World, cast: Cast, elapsed: number): void {
  const { state } = world; const p = state.player; const def = SKILLS.dash;
  const from = { x: p.x, z: p.z };
  const step = def.range / def.castTicks;
  const remaining = dist(p, cast.target);
  if (remaining > 0.05) {
    const move = Math.min(step, remaining);
    if (!moveToDash(world, p.x + cast.dir.x * move, p.z + cast.dir.z * move)) cast.target = { x: p.x, z: p.z };
  }
  const swept: Enemy[] = world.grid.query(p, def.radius + step).filter(e => !cast.hit.includes(e.id) && segmentDistance(from, p, e) <= def.radius + e.radius);
  for (const enemy of swept) { cast.hit.push(enemy.id); damageEnemy(world, enemy, skillDamage(state, 'dash'), { source: 'dash', stagger: 10 }); }
  if (p.stats.legendaries.includes('fire_walker') && elapsed % 2 === 0) {
    state.fires.push({ id: state.nextId++, x: p.x, z: p.z, radius: 1.2, until: state.tick + 90, nextPulse: state.tick + 10, damage: skillDamage(state, 'dash', 0.2) });
  }
}

function moveToDash(world: World, x: number, z: number): boolean {
  const p = world.state.player;
  if (!canStand(world.dungeon, x, z, 0.35)) return false;
  p.x = x; p.z = z; return true;
}

function applyCommand(world: World, command: Command): void {
  const p = world.state.player;
  if (command.type === 'assign') {
    if (command.skill && (command.skill === 'slash' || p.level < SKILLS[command.skill].unlock)) return;
    // 같은 스킬이 다른 칸에 있으면 자리를 맞바꿔 중복 배치를 막는다.
    const other = HOT_SLOTS.find(slot => slot !== command.slot && p.slots[slot] === command.skill && command.skill !== null);
    if (other) p.slots[other] = p.slots[command.slot];
    p.slots[command.slot] = command.skill;
    return;
  }
  if (command.type === 'equip') {
    const index = p.inventory.findIndex(item => item.id === command.item);
    const item = p.inventory[index];
    if (!item) return;
    const previous = p.equipped[item.slot];
    p.inventory.splice(index, 1);
    if (previous) p.inventory.push(previous);
    p.equipped[item.slot] = item;
  } else if (command.type === 'unequip') {
    const item = p.equipped[command.slot];
    if (!item || p.inventory.length >= 30) return;
    p.equipped[command.slot] = null; p.inventory.push(item);
  } else if (command.type === 'drop_item') {
    const index = p.inventory.findIndex(item => item.id === command.item);
    const item = p.inventory[index];
    if (!item) return;
    p.inventory.splice(index, 1);
    world.state.items.push({ id: world.state.nextId++, x: p.x, z: p.z, item });
    return;
  }
  const ratio = p.hp / p.stats.maxHp;
  p.stats = computeStats(p.level, p.equipped);
  p.hp = Math.max(1, Math.round(ratio * p.stats.maxHp));
}
