import type { EnemyKind, EquipSlot, LegendaryId, Rarity, SkillId, StatKey } from './types';

export const HZ = 30;
export const MAX_LEVEL = 10;
export const INVENTORY_SIZE = 30;

export interface SkillDef {
  id: SkillId; name: string; unlock: number; cost: number; gain: number; cooldown: number;
  castTicks: number; hitTick: number; mult: number; range: number; radius: number; halfAngle: number;
}
// 모든 수치는 가설 — slice-spec §4.
export const SKILLS: Record<SkillId, SkillDef> = {
  slash: { id: 'slash', name: '베기', unlock: 1, cost: 0, gain: 8, cooldown: 0, castTicks: 12, hitTick: 4, mult: 1, range: 2.2, radius: 0, halfAngle: 0.9 },
  spin: { id: 'spin', name: '회전베기', unlock: 1, cost: 25, gain: 0, cooldown: 0, castTicks: 12, hitTick: 5, mult: 1.6, range: 0, radius: 3, halfAngle: Math.PI },
  dash: { id: 'dash', name: '질풍 돌진', unlock: 2, cost: 0, gain: 0, cooldown: 120, castTicks: 8, hitTick: 8, mult: 1.2, range: 6, radius: 1.2, halfAngle: 0 },
  talisman: { id: 'talisman', name: '폭염 부적', unlock: 3, cost: 30, gain: 0, cooldown: 0, castTicks: 10, hitTick: 6, mult: 2.2, range: 12, radius: 3, halfAngle: 0 },
  cleave: { id: 'cleave', name: '혼백 가르기', unlock: 5, cost: 0, gain: 0, cooldown: 180, castTicks: 15, hitTick: 7, mult: 4, range: 4.5, radius: 0, halfAngle: 1.22 },
  ward: { id: 'ward', name: '금줄 결계', unlock: 7, cost: 0, gain: 0, cooldown: 450, castTicks: 6, hitTick: 3, mult: 0, range: 0, radius: 6, halfAngle: 0 },
};
export const SKILL_ORDER: readonly SkillId[] = ['slash', 'spin', 'dash', 'talisman', 'cleave', 'ward'];
export const WARD_TICKS = 150;
export const WARD_SLOW = 0.4;
export const WARD_REDUCTION = 0.3;

export interface EnemyDef {
  name: string; hp: number; damage: number; speed: number; radius: number;
  range: number; windup: number; recover: number; attack: 'melee' | 'throw' | 'sweep';
}
export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  reed: { name: '억새 잔향', hp: 16, damage: 3, speed: 0.13, radius: 0.4, range: 1.3, windup: 8, recover: 14, attack: 'melee' },
  shield: { name: '방패 역졸', hp: 60, damage: 6, speed: 0.08, radius: 0.55, range: 1.6, windup: 12, recover: 18, attack: 'melee' },
  porter: { name: '그림자 등짐장수', hp: 35, damage: 4, speed: 0.1, radius: 0.45, range: 8, windup: 12, recover: 24, attack: 'throw' },
  hat: { name: '되돌이 삿갓', hp: 1500, damage: 25, speed: 0.09, radius: 1.1, range: 5, windup: 24, recover: 20, attack: 'sweep' },
};
export const ELITE_NAMES = { swift: '날쌘', tough: '단단한', splitting: '분열하는' } as const;
export const SHIELD_FRONT_REDUCTION = 0.5;
export const PROJECTILE_SPEED = 0.35;
export const AWAKE_RANGE = 12;
/** 공격 출처별 넉백 총 이동 거리(m). 가설 — 타격감 조정용. */
export const KNOCKBACK: Record<string, number> = {
  slash: 0.7, spin: 1.6, echo_spin: 1.3, dash: 1.8, talisman: 2.6, split_blast: 1.3, cleave: 3.2, fire: 0,
};
/** 넉백 속도 감쇠(틱당). 총 거리 = 초기 속도 / (1 - 감쇠). */
export const KNOCK_DECAY = 0.7;

export function levelMult(level: number): number { return 1 + 0.35 * (level - 1); }
export function xpToNext(level: number): number { return Math.round(100 * level ** 1.5); }
export function killXp(dungeonLevel: number, elite: boolean, boss: boolean): number {
  return 10 * dungeonLevel * (boss ? 30 : elite ? 5 : 1);
}

export const SLOT_NAMES: Record<EquipSlot, string> = {
  weapon: '환도', hat: '흑립', robe: '도포', gloves: '토시', boots: '미투리', charm: '노리개',
};
export const RARITY_AFFIXES: Record<Rarity, [number, number]> = {
  common: [0, 0], magic: [1, 2], rare: [3, 4], legendary: [3, 3],
};
/** 옵션 값 범위는 아이템 레벨 1 기준, 레벨당 비례 증가가 필요한 것만 scale=true */
export const AFFIXES: Record<StatKey, { label: string; min: number; max: number; scale: boolean; prefix: string }> = {
  damagePct: { label: '공격력 +{v}%', min: 4, max: 10, scale: false, prefix: '날 선' },
  life: { label: '체력 +{v}', min: 8, max: 16, scale: true, prefix: '굳센' },
  attackSpeedPct: { label: '공격 속도 +{v}%', min: 3, max: 8, scale: false, prefix: '재빠른' },
  critChance: { label: '치명타 확률 +{v}%', min: 2, max: 5, scale: false, prefix: '매서운' },
  critDamage: { label: '치명타 피해 +{v}%', min: 10, max: 30, scale: false, prefix: '잔혹한' },
  moveSpeedPct: { label: '이동 속도 +{v}%', min: 4, max: 10, scale: false, prefix: '바람 같은' },
  spiritRegen: { label: '초당 기 회복 +{v}', min: 1, max: 3, scale: false, prefix: '맑은' },
  lifeOnKill: { label: '처치 시 체력 +{v}', min: 3, max: 8, scale: true, prefix: '굶주린' },
  cooldownPct: { label: '재사용 대기시간 -{v}%', min: 3, max: 8, scale: false, prefix: '흐르는' },
  spinPct: { label: '회전베기 피해 +{v}%', min: 10, max: 25, scale: false, prefix: '맴도는' },
  talismanPct: { label: '폭염 부적 피해 +{v}%', min: 10, max: 25, scale: false, prefix: '타오르는' },
  cleavePct: { label: '혼백 가르기 피해 +{v}%', min: 10, max: 25, scale: false, prefix: '혼을 베는' },
  dashPct: { label: '질풍 돌진 피해 +{v}%', min: 10, max: 25, scale: false, prefix: '질풍의' },
};
export const RARE_NAMES = ['저승', '달빛', '피안개', '서리', '귀곡', '먹구름', '잿빛', '무당'] as const;
export const RARE_SUFFIX = ['자락', '숨결', '그림자', '울음', '매듭'] as const;

export const LEGENDARIES: Record<LegendaryId, { slot: EquipSlot; name: string; text: string }> = {
  fire_walker: { slot: 'weapon', name: '불길 걷는 환도', text: '질풍 돌진 경로에 3초간 불길이 남는다(초당 무기 피해 60%).' },
  echo_charm: { slot: 'charm', name: '메아리 노리개', text: '회전베기가 0.4초 뒤 한 번 더 회전한다.' },
  split_talisman: { slot: 'gloves', name: '귀화 부적 토시', text: '폭염 부적이 작은 부적 3개로 갈라져 주변에 추가 폭발한다.' },
};

export const DROP = {
  normalItem: 0.08, globe: 0.1, eliteItems: [1, 2] as [number, number], bossItems: 3,
  legendary: { normal: 0.01, elite: 0.05, boss: 0.25 },
  rare: { normal: 0.12, elite: 0.35, boss: 1 },
  magic: { normal: 0.45, elite: 0.5, boss: 0 },
};
export const GLOBE_HEAL = 0.25;
