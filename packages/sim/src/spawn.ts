import { ENEMIES, levelMult } from './data';
import { canStand, generateDungeon } from './dungeon';
import type { Dungeon, Room } from './dungeon';
import { computeStats } from './loot';
import { nextFloat, nextInt, pick } from './rng';
import type { RngHolder } from './rng';
import type { EliteAffix, Enemy, EnemyKind, Profile, RunState, SkillId, Vec } from './types';

export function makeEnemy(id: number, kind: EnemyKind, pos: Vec, dungeonLevel: number, elite: EliteAffix | null, room: number, boss = false): Enemy {
  const def = ENEMIES[kind]; const mult = levelMult(dungeonLevel);
  const eliteMult = elite ? 4 : 1;
  const hp = Math.round(def.hp * mult * eliteMult * (elite === 'tough' ? 2 : 1));
  return {
    id, kind, elite, boss, room, x: pos.x, z: pos.z, hp, maxHp: hp,
    damage: Math.round(def.damage * mult * (elite ? 1.5 : 1)),
    speed: def.speed * (elite === 'swift' ? 1.4 : 1), radius: def.radius * (elite ? 1.3 : 1),
    facing: 0, mode: 'sleep', modeUntil: 0, attack: null, attackTarget: { x: pos.x, z: pos.z },
    nextSpecial: 90, staggerUntil: 0, slowed: false, flashUntil: 0, waypoint: null,
    repathAt: id % 20, // 첫 길찾기가 한 틱에 몰리지 않게 분산
  };
}

function randomSpot(holder: RngHolder, d: Dungeon, room: Room, radius: number, center?: Vec, spread = 0): Vec {
  for (let attempt = 0; attempt < 30; attempt++) {
    const pos = center && spread > 0
      ? { x: center.x + (nextFloat(holder) - 0.5) * spread, z: center.z + (nextFloat(holder) - 0.5) * spread }
      : { x: room.x + 1 + nextFloat(holder) * (room.w - 2), z: room.z + 1 + nextFloat(holder) * (room.h - 2) };
    if (canStand(d, pos.x, pos.z, radius)) return pos;
  }
  return { x: room.cx, z: room.cz };
}

const PACK_KINDS: readonly EnemyKind[] = ['reed', 'reed', 'reed', 'shield', 'porter'];
const ELITE_KINDS: readonly EnemyKind[] = ['reed', 'shield', 'porter'];
const ELITE_AFFIXES: readonly EliteAffix[] = ['swift', 'tough', 'splitting'];

function populateRoom(state: RunState, d: Dungeon, room: Room, index: number): void {
  const add = (kind: EnemyKind, pos: Vec, elite: EliteAffix | null = null, boss = false): void => {
    state.enemies.push(makeEnemy(state.nextId++, kind, pos, state.dungeonLevel, elite, index, boss));
  };
  if (room.kind === 'boss') { add('hat', { x: room.cx, z: room.cz }, null, true); return; }
  if (room.kind === 'elite') {
    const center = randomSpot(state, d, room, 0.8);
    add(pick(state, ELITE_KINDS), center, pick(state, ELITE_AFFIXES));
    const minions = nextInt(state, 4, 6);
    for (let i = 0; i < minions; i++) add('reed', randomSpot(state, d, room, 0.4, center, 4));
    return;
  }
  if (room.kind !== 'normal') return;
  // 1~2개 무리로 뭉쳐 놓아야 광역기 한 번에 여러 마리가 쓰러지는 맛이 난다.
  const packs = nextInt(state, 1, 2); const total = nextInt(state, 8, 15);
  for (let p = 0; p < packs; p++) {
    const center = randomSpot(state, d, room, 0.6);
    const count = p === packs - 1 ? total - Math.floor(total / packs) * (packs - 1) : Math.floor(total / packs);
    for (let i = 0; i < count; i++) {
      const kind = pick(state, PACK_KINDS);
      add(kind, randomSpot(state, d, room, ENEMIES[kind].radius, center, 5));
    }
  }
}

/** extraMobs: 기본 배치에 더할 수. totalMobs: 부하 측정용으로 보스를 포함한 전체 몹 수를 정확히 맞춘다. */
export interface RunOptions { extraMobs?: number; totalMobs?: number }

export function createRun(profile: Profile, seed: number, options: RunOptions = {}): { state: RunState; dungeon: Dungeon } {
  const dungeon = generateDungeon(seed);
  const start = dungeon.rooms[0]!;
  const stats = computeStats(profile.level, profile.equipped);
  const cooldowns: Record<SkillId, number> = { slash: 0, spin: 0, dash: 0, talisman: 0, cleave: 0, ward: 0 };
  const state: RunState = {
    seed, rng: (seed * 2654435761) | 0, tick: 0, dungeonLevel: profile.level, hitstop: 0,
    status: 'playing', portal: null, nextId: 1, nextItemId: profile.nextItemId, kills: 0, events: [],
    player: {
      x: start.cx, z: start.cz, hp: stats.maxHp, spirit: 50, level: profile.level, xp: profile.xp, facing: 0,
      stats, path: [], pathGoal: null, order: { kind: 'idle' }, cast: null, cooldowns,
      wardUntil: 0, invulnerableUntil: 0,
      inventory: profile.inventory.map(cloneItem), equipped: cloneEquipped(profile.equipped), slots: { ...profile.slots },
    },
    enemies: [], items: [], globes: [], projectiles: [], fires: [], delayed: [],
  };
  dungeon.rooms.forEach((room, index) => populateRoom(state, dungeon, room, index));
  for (let i = 0; i < (options.extraMobs ?? 0); i++) {
    // 부하 측정용: 시작 방 밖 첫 일반 방 근처에 몰아넣는다.
    const room = dungeon.rooms.find(r => r.kind === 'normal') ?? start;
    const kind = pick(state, PACK_KINDS);
    state.enemies.push(makeEnemy(state.nextId++, kind, randomSpot(state, dungeon, room, ENEMIES[kind].radius), state.dungeonLevel, null, -1));
  }
  if (options.totalMobs !== undefined) fitMobCount(state, dungeon, options.totalMobs);
  return { state, dungeon };
}

function fitMobCount(state: RunState, dungeon: Dungeon, total: number): void {
  // 보스는 남기고 뒤에서부터 잘라낸다 — 같은 시드면 같은 구성이 나온다.
  while (state.enemies.length > Math.max(1, total)) {
    const index = state.enemies.map(e => e.boss).lastIndexOf(false);
    if (index < 0) break;
    state.enemies.splice(index, 1);
  }
  const room = dungeon.rooms.find(r => r.kind === 'normal') ?? dungeon.rooms[0]!;
  while (state.enemies.length < total) {
    const kind = pick(state, PACK_KINDS);
    state.enemies.push(makeEnemy(state.nextId++, kind, randomSpot(state, dungeon, room, ENEMIES[kind].radius), state.dungeonLevel, null, -1));
  }
}

function cloneItem<T extends { affixes: object[] }>(item: T): T {
  return { ...item, affixes: item.affixes.map(affix => ({ ...affix })) };
}
function cloneEquipped(equipped: Profile['equipped']): Profile['equipped'] {
  const result = { ...equipped };
  for (const key of Object.keys(result) as (keyof Profile['equipped'])[]) {
    const item = result[key];
    result[key] = item ? cloneItem(item) : null;
  }
  return result;
}

/** 던전 진행은 버리고 캐릭터 성장만 남긴다(재진입 시 새 시드). */
export function profileFromRun(state: RunState, previous: Profile): Profile {
  const p = state.player;
  return {
    version: 1, level: p.level, xp: p.xp, inventory: p.inventory.map(cloneItem), equipped: cloneEquipped(p.equipped),
    slots: { ...p.slots }, runCount: previous.runCount + 1, nextItemId: state.nextItemId,
  };
}
