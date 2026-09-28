/**
 * 꼬마 용사 키우기 — 수치와 이름. 밸런스 조정은 이 파일에서만 한다.
 *
 * 곡선 설계: 적 체력(1.25^s)이 골드(1.155^s)보다 빠르게 커져서 어느 지점에서 성장이 막힌다.
 * 그 벽이 환생의 이유다. 무기 진화(25레벨마다 ×2)는 벽 직전에 한 번씩 숨통을 틔운다.
 * 탐욕 봇 기준(tests/idle-logic.test.mjs): 5스테이지 약 1분, 10스테이지 약 2.5분, 첫 벽 약 50스테이지·19분.
 */

export type UpgradeId = 'attack' | 'speed' | 'crit' | 'gold' | 'companion';
export type UnlockId = 'skill' | 'companion' | 'auto' | 'rebirth';

export const TICK = 1 / 20;

export const ENEMY = {
  baseHp: 8,
  hpGrowth: 1.25,
  bossHpFactor: 7,
  killsPerStage: 10,
  /** 적 사이 이동 시간 — 처치 직후 숨 돌릴 틈이자 골드가 날아가는 시간 */
  walkSeconds: 0.35,
  bossSeconds: 30,
} as const;

export const GOLD = {
  base: 3,
  growth: 1.155,
  bossFactor: 8,
  /** 자리를 비운 동안 받는 비율. 접속해 있을 때가 더 이득이어야 한다 */
  offlineRate: 0.5,
  offlineCapSeconds: 8 * 60 * 60,
  /** 이보다 짧은 부재는 보상 창을 띄우지 않는다 */
  offlineMinSeconds: 60,
} as const;

export const HERO = {
  baseAttack: 5,
  attackPerLevel: 4,
  /** 이 레벨마다 무기가 진화하고 공격력이 두 배가 된다 */
  evolveEvery: 25,
  baseAttacksPerSecond: 1,
  critMultiplier: 3,
  tapFactor: 0.3,
} as const;

export const SKILL = {
  damageFactor: 25,
  cooldownSeconds: 15,
} as const;

export const COMPANION = {
  /** 동료 1타 = 용사 공격력 × 레벨 × 이 값. 초당 1회 */
  factorPerLevel: 0.15,
  attacksPerSecond: 1,
} as const;

export const REBIRTH = {
  minStage: 25,
  /** 이 스테이지를 넘은 만큼만 영혼석이 된다 */
  offsetStage: 20,
  exponent: 1.4,
  /** 영혼석 1개당 공격력·골드 배율 */
  bonusPerStone: 0.1,
} as const;

export const UNLOCK_STAGE: Readonly<Record<UnlockId, number>> = {
  skill: 5,
  companion: 10,
  auto: 20,
  rebirth: REBIRTH.minStage,
};

export interface UpgradeSpec {
  readonly name: string;
  readonly baseCost: number;
  readonly costGrowth: number;
  readonly maxLevel: number;
  readonly unlock?: UnlockId;
}

export const UPGRADES: Readonly<Record<UpgradeId, UpgradeSpec>> = {
  attack: { name: '공격력', baseCost: 6, costGrowth: 1.08, maxLevel: 10_000 },
  speed: { name: '공격 속도', baseCost: 60, costGrowth: 1.3, maxLevel: 30 },
  crit: { name: '치명타', baseCost: 40, costGrowth: 1.22, maxLevel: 25 },
  gold: { name: '골드 획득', baseCost: 50, costGrowth: 1.16, maxLevel: 10_000 },
  companion: { name: '동료 요정', baseCost: 150, costGrowth: 1.14, maxLevel: 10_000, unlock: 'companion' },
};

export const UPGRADE_ORDER: readonly UpgradeId[] = ['attack', 'speed', 'crit', 'gold', 'companion'];

export const SPEED_PER_LEVEL = 0.05;
export const CRIT_PER_LEVEL = 0.02;
export const GOLD_PER_LEVEL = 0.12;

/** 무기 단계. 25레벨마다 다음 무기로 진화한다 — 수치보다 먼저 눈에 보이는 성장 */
export const WEAPONS: readonly { readonly name: string; readonly color: string; readonly glow: string | null }[] = [
  { name: '나뭇가지', color: '#8a5a33', glow: null },
  { name: '녹슨 단검', color: '#9aa3a8', glow: null },
  { name: '철검', color: '#d7dee3', glow: null },
  { name: '기사의 검', color: '#eef3ff', glow: '#9fd0ff' },
  { name: '룬 소드', color: '#8ff0ff', glow: '#3fd6ff' },
  { name: '화염검', color: '#ffb35c', glow: '#ff6a2b' },
  { name: '서리검', color: '#c9f2ff', glow: '#6cc8ff' },
  { name: '용살검', color: '#ff7a8a', glow: '#ff2d55' },
  { name: '성검', color: '#fff3b0', glow: '#ffd84a' },
  { name: '별의 검', color: '#e6d4ff', glow: '#b07cff' },
];

export interface ZoneSpec {
  readonly name: string;
  readonly monster: string;
  readonly sky: readonly [string, string];
  readonly ground: string;
  readonly hill: string;
  readonly body: string;
  readonly shape: 'slime' | 'mushroom' | 'bat' | 'rock' | 'imp' | 'wolf' | 'ghost';
}

/** 10스테이지마다 지역이 바뀐다. 끝까지 가면 색을 바꿔 다시 돈다 */
export const ZONES: readonly ZoneSpec[] = [
  { name: '햇살 초원', monster: '슬라임', sky: ['#7ec8ff', '#d9f1ff'], ground: '#5cb85c', hill: '#8fd18a', body: '#6fd46a', shape: 'slime' },
  { name: '버섯 숲', monster: '버섯돌이', sky: ['#4f9a8a', '#b7e3c8'], ground: '#3f7d4a', hill: '#5d9b62', body: '#e05a4f', shape: 'mushroom' },
  { name: '박쥐 동굴', monster: '동굴 박쥐', sky: ['#2b2540', '#5a4a78'], ground: '#4a3f5c', hill: '#3a3150', body: '#7b5ea8', shape: 'bat' },
  { name: '바위 협곡', monster: '돌 골렘', sky: ['#e8a86b', '#ffe0b0'], ground: '#b07a4a', hill: '#c99466', body: '#8b8f96', shape: 'rock' },
  { name: '불꽃 화산', monster: '불꽃 임프', sky: ['#3a1a1a', '#b8452a'], ground: '#4a2a22', hill: '#6b2f22', body: '#ff6a3d', shape: 'imp' },
  { name: '얼음 설원', monster: '서리 늑대', sky: ['#a8d8ff', '#f1f8ff'], ground: '#e6f2fb', hill: '#c8e2f5', body: '#9fb8d6', shape: 'wolf' },
  { name: '마왕성', monster: '망령', sky: ['#1a1026', '#4a2560'], ground: '#2a1f33', hill: '#3a2847', body: '#b89cff', shape: 'ghost' },
];

export const STAGES_PER_ZONE = 10;
