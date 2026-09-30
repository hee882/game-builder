/**
 * 북극 사냥 식당 — 수치·배치. 밸런스는 이 파일에서만 조정한다.
 *
 * 월드 좌표는 바닥 평면의 타일 단위 (x, y)다. 화면에는 아이소메트릭으로 투영된다.
 * x 가 커지면 화면 오른쪽 아래, y 가 커지면 화면 왼쪽 아래로 간다.
 */

export const TICK = 1 / 30;

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** 걸어 다닐 수 있는 전체 영역 */
export const WORLD: Rect = { x0: 0, y0: 0, x1: 12, y1: 17 };
/** 곰이 돌아다니는 설원 */
export const HUNT_FIELD: Rect = { x0: 1, y0: 0.6, x1: 11, y1: 5.4 };
/** 식당 바닥(나무 마루) */
export const FLOOR: Rect = { x0: 1, y0: 8, x1: 10, y1: 16 };

export const PLAYER = {
  start: { x: 5.5, y: 7 } as Vec,
  speed: 3.4,
  capacity: 5,
  attackRange: 1.4,
  attackSeconds: 0.4,
  damage: 1,
} as const;

export const BEAR = {
  hp: 3,
  baseCount: 3,
  respawnSeconds: 3.5,
  wanderSpeed: 0.7,
  meatDrop: 2,
} as const;

export const COOK = {
  seconds: 1.6,
  inputCap: 10,
  outputCap: 16,
  /** 패드 위에서 한 개씩 옮기는 간격. 한 번에 넘기지 않아야 «촤르르» 손맛이 산다 */
  transferSeconds: 0.09,
} as const;

export const COUNTER = {
  stockCap: 24,
  price: 6,
  buySeconds: 0.35,
  spawnSeconds: 2.2,
  queueMax: 6,
  wantMin: 1,
  wantMax: 3,
} as const;

/** 서 있으면 돈이 빨려 들어가는 속도: 비용을 이 시간 안에 다 채운다(최소 초당 값 보장) */
export const PAD_FILL_SECONDS = 1.4;
export const PAD_MIN_RATE = 30;
export const PAD_RADIUS = 0.75;

export const WORKER = {
  speed: 2.4,
  capacity: 4,
} as const;

export type UpgradeId = 'speed' | 'capacity' | 'cook' | 'price';

export interface UpgradeSpec {
  readonly name: string;
  readonly icon: string;
  readonly maxLevel: number;
  readonly baseCost: number;
  readonly costGrowth: number;
  readonly perLevel: number;
  readonly unit: string;
}

export const UPGRADES: Readonly<Record<UpgradeId, UpgradeSpec>> = {
  speed: { name: '이동 속도', icon: '👟', maxLevel: 6, baseCost: 50, costGrowth: 1.9, perLevel: 0.12, unit: '%' },
  capacity: { name: '운반량', icon: '🎒', maxLevel: 6, baseCost: 60, costGrowth: 1.9, perLevel: 2, unit: '개' },
  cook: { name: '굽기 속도', icon: '🔥', maxLevel: 6, baseCost: 80, costGrowth: 1.9, perLevel: 0.12, unit: '%' },
  price: { name: '판매 가격', icon: '💰', maxLevel: 8, baseCost: 100, costGrowth: 1.8, perLevel: 0.2, unit: '%' },
};

export const UPGRADE_ORDER: readonly UpgradeId[] = ['speed', 'capacity', 'cook', 'price'];

export type BuildId =
  | 'grill2'
  | 'office'
  | 'carrier1'
  | 'field'
  | 'hunter1'
  | 'register'
  | 'grill3'
  | 'carrier2'
  | 'fishing';

export interface BuildSpec {
  readonly name: string;
  readonly cost: number;
  readonly pad: Vec;
  /** 이 건물이 지어져야 패드가 보인다. 한꺼번에 다 보이면 목표가 흐려진다 */
  readonly after: BuildId | null;
}

/**
 * 순서가 곧 성장 곡선이다. 앞 단계가 벌어 주는 속도에 맞춰 가격을 올린다.
 * 화로 칸은 화로가 생길 바로 그 자리에 둔다. 손님 줄(QUEUE_HEAD 에서 +x·+y 로 늘어남)은 피한다.
 */
export const BUILDS: Readonly<Record<BuildId, BuildSpec>> = {
  grill2: { name: '화로 추가', cost: 30, pad: { x: 2.2, y: 11.6 }, after: null },
  office: { name: '업그레이드 창고', cost: 60, pad: { x: 8.6, y: 9.2 }, after: 'grill2' },
  carrier1: { name: '운반 알바 고용', cost: 120, pad: { x: 4.6, y: 14.2 }, after: 'grill2' },
  field: { name: '사냥터 확장 (곰 +2)', cost: 160, pad: { x: 10.4, y: 6.4 }, after: 'carrier1' },
  hunter1: { name: '사냥꾼 고용', cost: 260, pad: { x: 1.2, y: 6.6 }, after: 'carrier1' },
  register: { name: '계산대 확장 (손님 2배)', cost: 420, pad: { x: 6.4, y: 15.4 }, after: 'hunter1' },
  grill3: { name: '화로 추가', cost: 600, pad: { x: 2.2, y: 14.1 }, after: 'register' },
  carrier2: { name: '운반 알바 고용', cost: 800, pad: { x: 4.6, y: 16.2 }, after: 'grill3' },
  fishing: { name: '얼음 낚시터 (다음 업데이트)', cost: 2000, pad: { x: 11, y: 11 }, after: 'carrier2' },
};

export const BUILD_ORDER: readonly BuildId[] = [
  'grill2',
  'office',
  'carrier1',
  'field',
  'hunter1',
  'register',
  'grill3',
  'carrier2',
  'fishing',
];

/** 화로 위치(상자 중심)와 앞의 작업 패드. 처음 하나는 공짜로 놓여 있다 */
export const GRILLS: readonly { readonly box: Vec; readonly pad: Vec; readonly build: BuildId | null }[] = [
  { box: { x: 2.2, y: 9.2 }, pad: { x: 3.4, y: 9.9 }, build: null },
  { box: { x: 2.2, y: 11.6 }, pad: { x: 3.4, y: 12.3 }, build: 'grill2' },
  { box: { x: 2.2, y: 14.1 }, pad: { x: 3.4, y: 14.8 }, build: 'grill3' },
];

export const COUNTER_BOX: Vec = { x: 6.4, y: 12.2 };
/** 플레이어가 서서 구운 고기를 내려놓는 곳(카운터 안쪽) */
export const COUNTER_PAD: Vec = { x: 5.4, y: 11.2 };
/** 손님 줄: 카운터 바깥쪽으로 늘어선다 */
export const QUEUE_HEAD: Vec = { x: 7.5, y: 13.2 };
export const QUEUE_STEP: Vec = { x: 0.55, y: 0.75 };
export const MONEY_PAD: Vec = { x: 7.4, y: 11 };
export const OFFICE_PAD: Vec = { x: 8.6, y: 9.2 };
