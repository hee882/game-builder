// 좌표 단위는 미터(1타일 = 1m). sim은 30Hz 고정 스텝이며 모든 시간은 틱이다.
export interface Vec { x: number; z: number }

export type SkillId = 'slash' | 'spin' | 'dash' | 'talisman' | 'cleave' | 'ward';
export type HotSlot = 'rmb' | 's1' | 's2' | 's3' | 's4';
export const HOT_SLOTS: readonly HotSlot[] = ['rmb', 's1', 's2', 's3', 's4'];

export type EquipSlot = 'weapon' | 'hat' | 'robe' | 'gloves' | 'boots' | 'charm';
export const EQUIP_SLOTS: readonly EquipSlot[] = ['weapon', 'hat', 'robe', 'gloves', 'boots', 'charm'];
export type Rarity = 'common' | 'magic' | 'rare' | 'legendary';
export type StatKey =
  | 'damagePct' | 'life' | 'attackSpeedPct' | 'critChance' | 'critDamage'
  | 'moveSpeedPct' | 'spiritRegen' | 'lifeOnKill' | 'cooldownPct'
  | 'spinPct' | 'talismanPct' | 'cleavePct' | 'dashPct';
export type LegendaryId = 'fire_walker' | 'echo_charm' | 'split_talisman';

export interface Affix { stat: StatKey; value: number }
export interface Item {
  id: number; slot: EquipSlot; rarity: Rarity; name: string; ilvl: number;
  /** 무기는 기본 피해, 그 외는 기본 체력 */
  base: number;
  affixes: Affix[]; legendary: LegendaryId | null;
}

export interface Stats {
  maxHp: number; weaponDamage: number; damageMult: number; attackSpeed: number;
  critChance: number; critDamage: number; moveSpeed: number; spiritRegen: number;
  lifeOnKill: number; cooldownMult: number; skillMult: Record<SkillId, number>;
  legendaries: LegendaryId[];
}

export interface Profile {
  version: 1; level: number; xp: number; inventory: Item[];
  equipped: Record<EquipSlot, Item | null>; slots: Record<HotSlot, SkillId | null>;
  runCount: number; nextItemId: number;
}

export type Order =
  | { kind: 'idle' }
  | { kind: 'move'; target: Vec }
  | { kind: 'attack'; enemy: number }
  | { kind: 'pickup'; item: number };

export interface Cast { skill: SkillId; start: number; target: Vec; dir: Vec; hitDone: boolean; hit: number[] }

export interface Player extends Vec {
  hp: number; spirit: number; level: number; xp: number; facing: number;
  stats: Stats; path: Vec[]; pathGoal: Vec | null; order: Order; cast: Cast | null;
  cooldowns: Record<SkillId, number>; wardUntil: number; invulnerableUntil: number;
  inventory: Item[]; equipped: Record<EquipSlot, Item | null>; slots: Record<HotSlot, SkillId | null>;
}

export type EnemyKind = 'reed' | 'shield' | 'porter' | 'hat';
export type EliteAffix = 'swift' | 'tough' | 'splitting';
export type EnemyMode = 'sleep' | 'chase' | 'windup' | 'recover';
export type EnemyAttackKind = 'melee' | 'throw' | 'sweep' | 'slam' | 'summon';

export interface Enemy extends Vec {
  id: number; kind: EnemyKind; elite: EliteAffix | null; boss: boolean; room: number;
  hp: number; maxHp: number; damage: number; speed: number; radius: number; facing: number;
  mode: EnemyMode; modeUntil: number; attack: EnemyAttackKind | null; attackTarget: Vec;
  nextSpecial: number; staggerUntil: number; slowed: boolean; flashUntil: number;
  /** 시야가 막혔을 때만 쓰는 길찾기 중간 지점 */
  waypoint: Vec | null; repathAt: number;
}

export interface GroundItem extends Vec { id: number; item: Item }
export interface Globe extends Vec { id: number }
export interface Projectile extends Vec { id: number; vx: number; vz: number; until: number; damage: number }
export interface FireZone extends Vec { id: number; until: number; nextPulse: number; radius: number; damage: number }
export interface Delayed extends Vec { at: number; kind: 'echo_spin' | 'split_blast'; damage: number; radius: number }

export type SimEvent =
  | { type: 'cast'; skill: SkillId; x: number; z: number; tx: number; tz: number }
  | { type: 'hit'; enemy: number; amount: number; crit: boolean; x: number; z: number }
  | { type: 'blocked'; enemy: number; x: number; z: number }
  | { type: 'blast'; x: number; z: number; radius: number; source: string }
  | { type: 'kill'; enemy: number; kind: EnemyKind; elite: boolean; boss: boolean; x: number; z: number }
  | { type: 'player_hit'; amount: number; source: EnemyAttackKind }
  | { type: 'telegraph'; enemy: number; attack: EnemyAttackKind; x: number; z: number; radius: number; ticks: number }
  | { type: 'drop'; item: number; rarity: Rarity; x: number; z: number }
  | { type: 'pickup'; item: number; rarity: Rarity }
  | { type: 'inventory_full' }
  | { type: 'globe'; heal: number }
  | { type: 'level_up'; level: number; unlocked: SkillId[] }
  | { type: 'boss_dead'; x: number; z: number }
  | { type: 'player_dead' };

export interface RunState {
  seed: number; rng: number; tick: number; dungeonLevel: number; hitstop: number;
  status: 'playing' | 'cleared' | 'dead'; portal: Vec | null; nextId: number; nextItemId: number;
  player: Player; enemies: Enemy[]; items: GroundItem[]; globes: Globe[];
  projectiles: Projectile[]; fires: FireZone[]; delayed: Delayed[];
  kills: number; events: SimEvent[];
}

export type Command =
  | { type: 'equip'; item: number }
  | { type: 'unequip'; slot: EquipSlot }
  | { type: 'assign'; slot: HotSlot; skill: SkillId | null }
  | { type: 'drop_item'; item: number };

/** 한 틱의 입력. 클라이언트가 마우스·키 상태를 이 형태로 바꿔 넘긴다. */
export interface TickInput {
  moveTo: Vec | null; attack: number | null; pickup: number | null;
  cast: { slot: HotSlot | 'lmb'; at: Vec } | null; standStill: boolean;
  commands: Command[];
}
export const EMPTY_INPUT: TickInput = { moveTo: null, attack: null, pickup: null, cast: null, standStill: false, commands: [] };
