import { ENEMIES, GLOBE_HEAL, INVENTORY_SIZE, MAX_LEVEL, SHIELD_FRONT_REDUCTION, SKILLS, SKILL_ORDER, WARD_REDUCTION, killXp, xpToNext } from './data';
import { canStand } from './dungeon';
import type { Dungeon } from './dungeon';
import { computeStats, dropCount, rollItem, rollRarity } from './loot';
import type { DropSource } from './loot';
import { chance, nextFloat } from './rng';
import { SpatialHash } from './spatial';
import { HOT_SLOTS } from './types';
import type { Enemy, EnemyAttackKind, Rarity, RunState, SkillId, Vec } from './types';
import { makeEnemy } from './spawn';

/** 한 틱 동안 공유하는 실행 맥락. 공간 해시는 매 틱 재구성하므로 상태에 넣지 않는다. */
export interface World { state: RunState; dungeon: Dungeon; grid: SpatialHash }

export function skillDamage(state: RunState, skill: SkillId, mult = SKILLS[skill].mult): number {
  const s = state.player.stats;
  return s.weaponDamage * s.damageMult * mult * s.skillMult[skill];
}

export interface HitOptions { source: string; stagger?: number; ignoreShield?: boolean; from?: Vec }

export function damageEnemy(world: World, enemy: Enemy, base: number, options: HitOptions): void {
  const { state } = world;
  if (enemy.hp <= 0) return;
  const s = state.player.stats;
  const crit = chance(state, s.critChance);
  let amount = base * (crit ? 1 + s.critDamage : 1);
  const from = options.from ?? state.player;
  if (enemy.kind === 'shield' && !options.ignoreShield && facesToward(enemy, from)) {
    amount *= SHIELD_FRONT_REDUCTION;
    state.events.push({ type: 'blocked', enemy: enemy.id, x: enemy.x, z: enemy.z });
  }
  const dealt = Math.max(1, Math.round(amount));
  enemy.hp = Math.max(0, enemy.hp - dealt);
  enemy.flashUntil = state.tick + 4;
  if (enemy.mode === 'sleep') enemy.mode = 'chase';
  if (options.stagger && !enemy.boss) {
    enemy.staggerUntil = state.tick + options.stagger;
    if (enemy.mode === 'windup') { enemy.mode = 'recover'; enemy.modeUntil = enemy.staggerUntil; enemy.attack = null; }
  }
  state.events.push({ type: 'hit', enemy: enemy.id, amount: dealt, crit, x: enemy.x, z: enemy.z });
  if (enemy.hp === 0) onKill(world, enemy);
}

function facesToward(enemy: Enemy, point: Vec): boolean {
  const dx = point.x - enemy.x; const dz = point.z - enemy.z; const d = Math.hypot(dx, dz) || 1;
  return (Math.sin(enemy.facing) * dx + Math.cos(enemy.facing) * dz) / d > 0.3;
}

function onKill(world: World, enemy: Enemy): void {
  const { state } = world; const p = state.player;
  state.kills++;
  state.events.push({ type: 'kill', enemy: enemy.id, kind: enemy.kind, elite: enemy.elite !== null, boss: enemy.boss, x: enemy.x, z: enemy.z });
  if (p.stats.lifeOnKill > 0) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.lifeOnKill);
  gainXp(state, killXp(state.dungeonLevel, enemy.elite !== null, enemy.boss));
  const source: DropSource = enemy.boss ? 'boss' : enemy.elite ? 'elite' : 'normal';
  dropLoot(world, enemy, source);
  if (!enemy.boss && chance(state, ENEMY_GLOBE)) state.globes.push({ id: state.nextId++, x: enemy.x, z: enemy.z });
  if (enemy.elite === 'splitting') {
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      spawnNear(world, enemy, angle, 1.2, 'reed');
    }
  }
  if (enemy.boss) {
    state.portal = { x: enemy.x, z: enemy.z };
    state.hitstop = Math.max(state.hitstop, 4);
    state.events.push({ type: 'boss_dead', x: enemy.x, z: enemy.z });
  }
}
const ENEMY_GLOBE = 0.15;

export function spawnNear(world: World, origin: Vec, angle: number, distance: number, kind: 'reed'): Enemy | null {
  const { state, dungeon } = world;
  const x = origin.x + Math.sin(angle) * distance; const z = origin.z + Math.cos(angle) * distance;
  const pos = canStand(dungeon, x, z, ENEMIES[kind].radius) ? { x, z } : { x: origin.x, z: origin.z };
  const spawned = makeEnemy(state.nextId++, kind, pos, state.dungeonLevel, null, -1);
  spawned.mode = 'chase';
  state.enemies.push(spawned);
  return spawned;
}

function dropLoot(world: World, enemy: Enemy, source: DropSource): void {
  const { state, dungeon } = world;
  const count = dropCount(state, source);
  for (let i = 0; i < count; i++) {
    let rarity: Rarity = rollRarity(state, source);
    if (source === 'boss' && i === 0 && (rarity === 'common' || rarity === 'magic')) rarity = 'rare';
    const item = rollItem(state, state, state.dungeonLevel, rarity);
    const angle = nextFloat(state) * Math.PI * 2; const r = count > 1 ? 1 + nextFloat(state) : 0.4;
    const x = enemy.x + Math.sin(angle) * r; const z = enemy.z + Math.cos(angle) * r;
    const pos = canStand(dungeon, x, z, 0.2) ? { x, z } : { x: enemy.x, z: enemy.z };
    state.items.push({ id: state.nextId++, x: pos.x, z: pos.z, item });
    state.events.push({ type: 'drop', item: item.id, rarity: item.rarity, x: pos.x, z: pos.z });
  }
}

export function gainXp(state: RunState, amount: number): void {
  const p = state.player;
  if (p.level >= MAX_LEVEL) return;
  p.xp += amount;
  while (p.level < MAX_LEVEL && p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level); p.level++;
    const unlocked = SKILL_ORDER.filter(id => SKILLS[id].unlock === p.level);
    for (const skill of unlocked) autoAssign(state, skill);
    p.stats = computeStats(p.level, p.equipped); p.hp = p.stats.maxHp;
    state.events.push({ type: 'level_up', level: p.level, unlocked });
  }
  if (p.level >= MAX_LEVEL) p.xp = 0;
}

function autoAssign(state: RunState, skill: SkillId): void {
  const slots = state.player.slots;
  if (HOT_SLOTS.some(slot => slots[slot] === skill)) return;
  const empty = HOT_SLOTS.find(slot => slots[slot] === null);
  if (empty) slots[empty] = skill;
}

export function damagePlayer(state: RunState, amount: number, source: EnemyAttackKind): void {
  const p = state.player;
  if (state.status !== 'playing' || state.tick < p.invulnerableUntil) return;
  const reduced = state.tick < p.wardUntil ? amount * (1 - WARD_REDUCTION) : amount;
  const dealt = Math.max(1, Math.round(reduced));
  p.hp = Math.max(0, p.hp - dealt);
  state.events.push({ type: 'player_hit', amount: dealt, source });
  if (p.hp === 0) { state.status = 'dead'; state.events.push({ type: 'player_dead' }); }
}

export function collectGlobes(state: RunState): void {
  const p = state.player;
  state.globes = state.globes.filter(globe => {
    if (Math.hypot(globe.x - p.x, globe.z - p.z) > 1.5) return true;
    const heal = Math.round(p.stats.maxHp * GLOBE_HEAL);
    p.hp = Math.min(p.stats.maxHp, p.hp + heal);
    state.events.push({ type: 'globe', heal });
    return false;
  });
}

export function pickUp(state: RunState, groundId: number): boolean {
  const p = state.player; const index = state.items.findIndex(item => item.id === groundId);
  const ground = state.items[index];
  if (!ground) return true;
  if (p.inventory.length >= INVENTORY_SIZE) { state.events.push({ type: 'inventory_full' }); return true; }
  state.items.splice(index, 1); p.inventory.push(ground.item);
  state.events.push({ type: 'pickup', item: ground.item.id, rarity: ground.item.rarity });
  return true;
}
