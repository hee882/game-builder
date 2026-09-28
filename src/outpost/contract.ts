/**
 * 심해 전초기지(Abyss Outpost) — 동결된 구현 계약.
 *
 * 이 파일은 타입·상수만 담는다. 구현은 절대 들어오지 않는다.
 *   sim.ts      createSim       순수 시뮬레이션(DOM·Math.random·Date 금지)
 *   content.ts  데이터 테이블(건물·적·웨이브·레이아웃·경제 상수)
 *   path.ts     가중 Dijkstra 흐름장   save.ts  버전 검증 직렬화
 *   renderer.ts createRenderer (Canvas 2D)   layout.ts  순수 좌표 수학
 *   hud.ts / format.ts / main.ts / outpost.css  DOM 셸
 *
 * 결정 근거와 경제 수치는 docs/outpost-decisions.md 가 단일 출처다.
 * 계약 변경은 코디네이터 경유 + 필드 추가만 허용한다.
 */

/* ─────────────────────────── 그리드·시간 ─────────────────────────── */

/** 타일 인덱스 = y * GRID_W + x. 0..107 */
export type TileIndex = number;
/** 고정 스텝 번호. 1 tick = 1/30초 */
export type Tick = number;

export const GRID_W = 9;
export const GRID_H = 12;
export const TILE_COUNT = 108;
export const TICK_SECONDS = 1 / 30;
/** advance() 한 번에 진행할 수 있는 최대 스텝(탭 복귀 폭주 방지) */
export const MAX_STEPS_PER_ADVANCE = 6;
/** 동시 적 상한. 보스 소환 포함 */
export const MAX_ENEMIES = 80;
/** 코어 2×2는 화면 아래(행 9~10), 분출구는 화면 위(행 0). 방어 방향은 위 → 아래. */
export const CORE_ROW_ANCHOR = 9;
export const VENT_ROW = 0;

/** 타일 단위 실수 좌표(정수 = 타일 중심 아님, 타일 좌상단 기준 오프셋) */
export type Vec2 = { readonly x: number; readonly y: number };

/* ─────────────────────────── 식별자 ─────────────────────────── */

export type TerrainKind = 'water' | 'rock' | 'core' | 'vent' | 'wreck' | 'thermal';
export type ChapterId = 1 | 2;
export type ResourceId = 'scrap' | 'biomass';
export type Resources = Readonly<Record<ResourceId, number>>;

/** 건물 6종. 전력망은 이번 슬라이스에 없다(경로·사거리·자원 상충으로 깊이를 만든다). */
export type BuildingId =
  | 'bulkhead' // 격벽: 경로 비용만. 공격 없음
  | 'collector' // 수집기: 잔해 직교 인접 필수
  | 'harpoon' // 작살: 단일 타겟, 지상+공중
  | 'mortar' // 박격포: 폭발, 지상 전용, 최소 사거리 있음
  | 'droneBay' // 드론 정비고: 자동화(인양/정비)
  | 'resonator'; // 공명기: 열수 타일 전용, 방어 무시 — 숨은 해금

export type EnemyRole = 'drifter' | 'swarm' | 'breacher' | 'glider' | 'leviathan';
/** 2장은 같은 역할에 elite 변형(장갑·속도·HP)을 붙여 카운터를 바꾼다 */
export type EnemyVariant = 'base' | 'elite';
export type PathClass = 'ground' | 'breaker' | 'flyer';
export type AbilityId = 'sonarPulse' | 'weld';
export type TechId = 'piercingHarpoon' | 'wideBlast' | 'reinforcedWalls' | 'droneLogistics';
/**
 * 숨은 해금 3종. 누적 클릭·반복 카운터는 쓰지 않는다 — 전부 1회성 «의도적 행동».
 *   ventResonance   열수 타일에 공격 건물 2기를 동시에 세운다
 *   flawlessPair    코어 피해 0으로 2웨이브 연속 클리어
 *   deepArchaeology 웨이브 전투 중에 전방 잔해(행 0~3)를 직접 인양해 낸다
 */
export type DiscoveryId = 'ventResonance' | 'flawlessPair' | 'deepArchaeology';
export type PerkId = 'startScrap' | 'subSpeed' | 'wallHp';
/** 터렛 사격 정책. leader = 코어에 가장 가까운 적 */
export type TargetPolicy = 'nearest' | 'leader' | 'air';
export type AutomationKey = 'droneRole' | 'autoRebuildWalls';

/**
 * build = 안전 건설 단계(시간 제한 없음, 적 없음). 인양은 웨이브별 유한 리저브로만 가능.
 * chapterCleared = 1장 종료 → advanceChapter 대기. defeat = 코어 파괴 → retryWave 대기.
 */
export type Phase = 'build' | 'wave' | 'chapterCleared' | 'defeat' | 'victory';

/* ─────────────────────────── 명령 ─────────────────────────── */

export type SimCommand =
  | { readonly kind: 'build'; readonly tile: TileIndex; readonly building: BuildingId }
  | { readonly kind: 'upgrade'; readonly tile: TileIndex }
  | { readonly kind: 'sell'; readonly tile: TileIndex }
  | { readonly kind: 'setPolicy'; readonly tile: TileIndex; readonly policy: TargetPolicy }
  | { readonly kind: 'moveSub'; readonly to: Vec2 }
  | { readonly kind: 'ability'; readonly ability: AbilityId; readonly at: Vec2 }
  | { readonly kind: 'startWave' }
  | { readonly kind: 'research'; readonly tech: TechId }
  | { readonly kind: 'setAutomation'; readonly key: AutomationKey; readonly value: number }
  | { readonly kind: 'advanceChapter' }
  | { readonly kind: 'retryWave' }
  | { readonly kind: 'spendInsight'; readonly perk: PerkId };

export type RejectReason =
  | 'notEnoughResources'
  | 'tileOccupied'
  | 'tileNotBuildable'
  | 'outOfBounds'
  | 'buildingLocked'
  | 'maxLevel'
  | 'notAdjacentToWreck'
  | 'thermalOnly'
  | 'onCooldown'
  | 'wrongPhase'
  | 'alreadyResearched'
  | 'notEnoughInsight'
  | 'perkMaxed'
  | 'subDowned'
  | 'salvageExhausted'
  | 'nothingToRetry';

export type CommandResult = { readonly ok: true } | { readonly ok: false; readonly reason: RejectReason };

/** 거부는 상태를 전혀 바꾸지 않는다. HUD가 이유를 한국어로 바꾼다(format.ts). */
export type Dispatch = (command: SimCommand) => CommandResult;

/* ─────────────────────────── 뷰(읽기 전용) ─────────────────────────── */

export interface EnemyView {
  readonly id: number;
  readonly role: EnemyRole;
  readonly variant: EnemyVariant;
  readonly pos: Vec2;
  readonly prev: Vec2; // 렌더러 보간용
  readonly hp: number;
  readonly maxHp: number;
  readonly facing: number; // 라디안
  readonly slowTicks: number;
  readonly armor: number; // 정액 피해 감소(정예). 피해 표시·판독용
  readonly breaching: boolean; // 구조물 타격 중
}

export interface BuildingView {
  readonly tile: TileIndex;
  readonly id: BuildingId;
  readonly level: number; // 0..2
  readonly hp: number;
  readonly maxHp: number;
  readonly charge: number; // 0..1 발사 충전(연출)
  readonly aim: number; // 라디안
  readonly policy: TargetPolicy;
  readonly onThermal: boolean;
}

export interface ShotView {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly kind: 'harpoon' | 'mortar' | 'resonator' | 'pulse';
  readonly life: number; // 1 → 0
}

export interface DroneView {
  readonly pos: Vec2;
  readonly prev: Vec2;
  readonly role: 'harvest' | 'repair';
  readonly carrying: number;
}

export interface WreckView {
  readonly tile: TileIndex;
  readonly yieldPerSecond: number; // 이 노드의 현재 인양 속도
  readonly forward: boolean; // 분출구 쪽 고수익 노드
}

export interface AbilityStateView {
  readonly id: AbilityId;
  readonly unlocked: boolean;
  readonly cooldown: number; // 남은 초
  readonly cooldownMax: number;
  readonly meter: number; // 0..1 왕복 — 정밀 판정 게이지
  readonly perfectWindow: number; // 0..1 폭
}

export interface SubView {
  readonly pos: Vec2;
  readonly prev: Vec2;
  readonly hp: number;
  readonly maxHp: number;
  readonly downedTicks: number;
  readonly harvesting: boolean;
  readonly abilities: readonly AbilityStateView[]; // 길이 2
}

/** 안전 건설 단계가 무한 수입이 되지 않게 하는 장치. HUD는 남은 리저브를 항상 표시한다. */
export interface SalvageView {
  readonly reserveRemaining: number; // 이번 사이클에 더 캘 수 있는 고철
  readonly reserveTotal: number; // 이번 사이클 배정량
  readonly harvestedThisCycle: number;
  readonly exhausted: boolean; // true면 인양·수집기·드론 수입 0
  readonly offlineGranted: number; // 마지막 복귀 시 오프라인으로 지급된 양(리저브 안에서만)
}

export interface UnlockProgressView {
  readonly building: BuildingId;
  readonly unlocked: boolean;
  readonly requirement: 'start' | 'waveClear' | 'discovery';
  readonly wavesRemaining: number; // waveClear 기준 남은 웨이브 수, 그 외 0
  readonly discovery: DiscoveryId | null;
}

/** 실패는 초반 재반복을 요구하지 않는다: 같은 웨이브를 웨이브 시작 배치 + 재건 예산으로 다시 한다. */
export interface RetryView {
  readonly available: boolean; // phase === 'defeat'
  readonly chapter: ChapterId;
  readonly wave: number; // 다시 시도할 웨이브(실패한 그 웨이브)
  readonly rebuildGrant: number; // retryWave 시 지급되는 고철
  readonly attempts: number; // 표시용. 보상 감소·카운터 벌점 없음
  readonly keepsDiscoveries: true; // 발견·테크·통찰·해금은 항상 유지된다
}

export interface WaveView {
  readonly index: number; // 1..8
  readonly total: number; // 8
  readonly chapter: ChapterId;
  readonly phase: Phase;
  readonly buildSeconds: number; // 건설 단계 경과(증가). 조기 시작 보너스 판정
  readonly earlyBonusActive: boolean;
  readonly rewardScrap: number; // 클리어 시 지급 예정 고철(보너스 반영)
  readonly spawnRemaining: number;
  readonly spawnCountdown: number; // 웨이브 시작 후 첫 스폰까지 초. 없으면 -1
  readonly composition: readonly {
    readonly role: EnemyRole;
    readonly variant: EnemyVariant;
    readonly count: number;
  }[];
  /** 분출구별 예고 세기. 0 = 없음, 3 = 최대(경고는 항상 방향을 가진다) */
  readonly incoming: readonly { readonly vent: TileIndex; readonly strength: 0 | 1 | 2 | 3 }[];
  /** 어느 분출구에서 무엇이 오는지(2장은 분출구 3곳이라 방향 예고에 필요) */
  readonly spawns: readonly {
    readonly vent: TileIndex;
    readonly role: EnemyRole;
    readonly variant: EnemyVariant;
    readonly count: number;
  }[];
}

export interface SimStats {
  readonly manualSalvage: number;
  readonly autoSalvage: number;
  readonly kills: number;
  readonly wallsLost: number;
  readonly perfects: number;
  readonly abilityUses: number;
  readonly leaks: number;
  readonly elapsed: number; // 초
}

/**
 * view()는 항상 같은 객체를 돌려준다(프레임당 할당 0). 배열도 재사용되며 *Count가 유효 길이다.
 * 읽는 쪽은 동결된 것처럼 취급한다 — 정렬·변형·프레임 간 참조 보관 금지.
 */
export interface SimView {
  readonly tick: Tick;
  readonly chapter: ChapterId;
  readonly phase: Phase;
  readonly chapterCleared: boolean; // 1장 종료 후 advanceChapter 대기 중
  readonly terrain: Readonly<Int8Array>; // TerrainKind 인덱스, 길이 108
  readonly flooded: Readonly<Int8Array>; // 0 또는 남은 웨이브 수
  readonly pathHint: Readonly<Int32Array>; // ground 흐름장 dist — 경로 오버레이용
  readonly fieldVersion: number; // 지형·구조물 변경 카운터(캐시 무효화)
  readonly resources: Resources;
  readonly incomePerSecond: Resources;
  readonly salvage: SalvageView;
  readonly core: { readonly hp: number; readonly maxHp: number };
  readonly wave: WaveView;
  readonly retry: RetryView;
  readonly sub: SubView;
  readonly enemies: readonly EnemyView[];
  readonly enemyCount: number;
  readonly buildings: readonly BuildingView[];
  readonly buildingCount: number;
  readonly shots: readonly ShotView[];
  readonly shotCount: number;
  readonly drones: readonly DroneView[];
  readonly droneCount: number;
  readonly wrecks: readonly WreckView[];
  readonly unlockedBuildings: readonly BuildingId[];
  readonly unlockProgress: readonly UnlockProgressView[];
  readonly researched: readonly TechId[];
  readonly automationUnlocked: readonly AutomationKey[];
  readonly automation: Readonly<Record<AutomationKey, number>>;
  readonly discovered: readonly DiscoveryId[];
  /** 달성률 60% 이상인 숨은 해금의 암시 한 줄 */
  readonly hints: readonly { readonly id: DiscoveryId; readonly text: string }[];
  readonly insight: number;
  readonly perks: Readonly<Record<PerkId, number>>;
  readonly stats: SimStats;
}

/* ─────────────────────────── 이벤트 ─────────────────────────── */

/** main.ts가 프레임당 1회만 drain 해서 renderer·hud 양쪽에 같은 배열을 넘긴다(이중 drain 금지). */
export type SimEvent =
  | { readonly kind: 'built'; readonly tile: TileIndex; readonly building: BuildingId }
  | { readonly kind: 'destroyed'; readonly tile: TileIndex; readonly building: BuildingId }
  | { readonly kind: 'enemyKilled'; readonly at: Vec2; readonly role: EnemyRole; readonly biomass: number }
  | { readonly kind: 'coreHit'; readonly damage: number }
  | { readonly kind: 'gain'; readonly at: Vec2; readonly resource: ResourceId; readonly amount: number }
  | { readonly kind: 'salvageExhausted'; readonly at: Vec2 }
  | { readonly kind: 'salvageRefilled'; readonly reserve: number }
  | { readonly kind: 'abilityCast'; readonly ability: AbilityId; readonly at: Vec2; readonly perfect: boolean }
  | { readonly kind: 'subDowned'; readonly at: Vec2 }
  | { readonly kind: 'waveStart'; readonly index: number }
  | { readonly kind: 'waveClear'; readonly index: number; readonly flawless: boolean; readonly rewardScrap: number }
  | { readonly kind: 'discovered'; readonly id: DiscoveryId; readonly at: Vec2 }
  | { readonly kind: 'unlocked'; readonly building: BuildingId; readonly at: Vec2 }
  | { readonly kind: 'automationUnlocked'; readonly key: AutomationKey }
  | { readonly kind: 'flooded'; readonly tiles: readonly TileIndex[] }
  | { readonly kind: 'chapterEntered'; readonly chapter: ChapterId }
  | { readonly kind: 'collapsed'; readonly wave: number }
  | { readonly kind: 'victory'; readonly elapsed: number };

/* ─────────────────────────── 시뮬레이션 API ─────────────────────────── */

/** 건설 고스트 미리보기. 셸이 매 프레임 호출해도 상태를 바꾸지 않는다. */
export interface BuildPreview {
  readonly result: CommandResult;
  readonly cost: Resources;
  /** 최단 경로가 벽을 포함하게 되는가(= 적이 부수고 들어온다) */
  readonly sealsPath: boolean;
  /** sealsPath일 때 적이 때릴 벽 타일. 없으면 -1 */
  readonly breachTile: TileIndex;
  /** 이 배치로 늘어나는 ground 이동 시간(초). 음수면 짧아진다 */
  readonly pathDeltaSeconds: number;
  /** 경로가 달라지는 타일(점선 애니메이션용) */
  readonly changedTiles: readonly TileIndex[];
  /** 고스트를 반영한 ground 흐름장 dist. 렌더러는 경로를 직접 계산하지 않는다 */
  readonly ghostDist: Readonly<Int32Array>;
}

export interface OutpostSim {
  /** 실제 경과 시간을 누적해 고정 스텝으로 진행. 반환값 = 실행한 스텝 수(≤ MAX_STEPS_PER_ADVANCE). */
  advance(realSeconds: number): number;
  /** 정확히 1스텝. 셸의 일시정지·2배속·테스트가 이걸로 속도를 제어한다. */
  step(): void;
  issue(command: SimCommand): CommandResult;
  /** 읽기 전용 질의 — 상태 불변 */
  preview(tile: TileIndex, building: BuildingId): BuildPreview;
  view(): SimView;
  drainEvents(): readonly SimEvent[];
  /** 마지막 스텝 이후 비율 0..1 (렌더 보간) */
  readonly alpha: number;
  serialize(): string;
  /** 결정성 테스트용 FNV-1a 해시 */
  digest(): string;
}

export interface SimOptions {
  readonly seed: number;
  readonly save?: string | null; // 검증 실패 시 새 캠페인
  readonly offlineSeconds?: number; // 리저브 안에서만 정산. sim은 시간을 직접 조회하지 않는다
}

/** sim.ts 가 이 시그니처로 createSim 을 내보낸다. */
export type CreateSim = (options: SimOptions) => OutpostSim;

/* ─────────────────────────── 렌더러·HUD API ─────────────────────────── */

export interface GhostState {
  readonly tile: TileIndex;
  readonly building: BuildingId;
  readonly preview: BuildPreview;
}

/** HUD가 차지하는 영역. layout.fitView 가 이 값을 받아 타일 하한 40 px를 지킨다 */
export interface ViewportInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface OutpostRenderer {
  resize(cssWidth: number, cssHeight: number, dpr: number, insets: ViewportInsets): void;
  draw(view: SimView, events: readonly SimEvent[], alpha: number): void;
  setGhost(ghost: GhostState | null): void;
  /** 화면 좌표 → 타일. 반경 스냅 적용. 유효 타일이 없으면 -1 */
  pickTile(cssX: number, cssY: number): TileIndex;
  pickPoint(cssX: number, cssY: number): Vec2;
  setReducedMotion(value: boolean): void;
  setFrameSkip(skip: boolean): void; // 30fps 설정
  destroy(): void;
}

/** renderer.ts 가 이 시그니처로 createRenderer 를 내보낸다. */
export type CreateRenderer = (canvas: HTMLCanvasElement) => OutpostRenderer;

export interface OutpostHud {
  /** rAF당 1회. 이전 값과 달라진 노드만 갱신한다(innerHTML 재생성 금지). */
  sync(view: SimView, events: readonly SimEvent[]): void;
  toast(reason: RejectReason): void;
  setBuildSelection(building: BuildingId | null): void;
  destroy(): void;
}

export type CreateHud = (root: HTMLElement, dispatch: Dispatch) => OutpostHud;

/* ─────────────────────────── content.ts 스키마 ─────────────────────────── */

export type UnlockRule =
  | { readonly kind: 'start' }
  | { readonly kind: 'waveClear'; readonly wave: number }
  | { readonly kind: 'discovery'; readonly id: DiscoveryId };

export interface BuildingSpec {
  readonly id: BuildingId;
  readonly cost: Resources;
  readonly maxHp: number;
  readonly maxLevel: number; // 0 기반. 현재 전부 2
  readonly damage: number; // 0이면 비전투
  readonly fireInterval: number; // 초. 0이면 비전투
  readonly range: number;
  readonly minRange: number;
  readonly splashRadius: number;
  readonly targets: 'none' | 'ground' | 'air' | 'both';
  readonly piercesArmor: boolean;
  readonly requiresWreckAdjacent: boolean;
  readonly requiresThermal: boolean;
  readonly salvagePerSecond: number; // 수집기만 > 0
  readonly unlock: UnlockRule;
}

/**
 * 카탈로그 메타데이터는 content.ts 가 채운다(다음 sim 태스크 소유). 고정된 export 이름:
 *   BUILDINGS: BuildingCatalog · ENEMIES: EnemyCatalog · VARIANTS: VariantTable
 *   WAVES: readonly WaveSpec[] · CHAPTERS: readonly ChapterSpec[]
 *   TECHS: TechCatalog · PERKS: PerkCatalog · ECONOMY: EconomyTuning
 */
export type BuildingCatalog = Readonly<Record<BuildingId, BuildingSpec>>;

export interface EnemySpec {
  readonly role: EnemyRole;
  readonly hp: number;
  readonly speed: number; // 타일/초
  readonly pathClass: PathClass;
  readonly wallCost: number; // 흐름장에서 격벽 1장의 추가 통행 비용(정수)
  readonly wallDps: number;
  readonly coreDamage: number;
  readonly biomass: number;
  readonly flying: boolean;
}

export type EnemyCatalog = Readonly<Record<EnemyRole, EnemySpec>>;

export interface TechSpec {
  readonly cost: Resources;
  readonly name: string;
  readonly effect: string;
}
export type TechCatalog = Readonly<Record<TechId, TechSpec>>;

export interface PerkSpec {
  readonly cost: number; // 통찰 1레벨 비용
  readonly maxLevel: number;
  readonly name: string;
  readonly effect: string;
}
export type PerkCatalog = Readonly<Record<PerkId, PerkSpec>>;

export interface VariantModifier {
  readonly hpMultiplier: number;
  readonly speedMultiplier: number;
  readonly flatArmor: number; // 피해 정액 감소. piercesArmor 무시
}
export type VariantTable = Readonly<Record<EnemyVariant, VariantModifier>>;

export interface WaveSpec {
  readonly index: number;
  readonly chapter: ChapterId;
  readonly composition: readonly {
    readonly role: EnemyRole;
    readonly variant: EnemyVariant;
    readonly count: number;
  }[];
  readonly spawnInterval: number; // 초
  readonly rewardScrap: number;
  readonly salvageReserve: number; // 이 웨이브 건설 단계에 배정되는 유한 인양량
}

export interface ChapterSpec {
  readonly id: ChapterId;
  /** 9행 × 12줄 문자열 아트. '.' 물 '#' 암반 'C' 코어 'V' 분출구 'W' 잔해 'T' 열수 */
  readonly layout: readonly string[];
  readonly waves: readonly number[]; // 포함된 웨이브 번호
}

export interface EconomyTuning {
  readonly startScrap: number;
  readonly manualSalvagePerSecond: number;
  readonly dronePerSecond: number;
  readonly forwardWreckMultiplier: number;
  readonly sellRefund: number; // 0..1
  readonly upgradeCostFactor: number;
  readonly upgradeEffectFactor: number;
  readonly offlineCapSeconds: number;
  readonly offlineEfficiency: number; // 0..1
  readonly earlyBonusSeconds: number;
  readonly earlyBonusRate: number;
  readonly retryGrantBase: number;
  readonly retryGrantPerAttempt: number;
  /** 장갑이 전략을 삭제하지 않도록 하는 피해 하한: max(minDamageFlat, 표기 × minDamageRatio) */
  readonly minDamageRatio: number;
  readonly minDamageFlat: number;
}

/* ─────────────────────────── 저장 스키마 ─────────────────────────── */

export const OUTPOST_SAVE_VERSION = 1;
/** sim.serialize() 결과 전체(메타 + 런)가 이 키 하나에 들어간다 */
export const SAVE_KEY_RUN = 'outpost-run-v1';
/** 셸 소유: 설정과 마지막 저장 시각은 시뮬레이션 페이로드와 분리한다 */
export const SAVE_KEY_SETTINGS = 'outpost-settings-v1';
export const SAVE_KEY_SAVED_AT = 'outpost-saved-at-v1';

export interface OutpostSettings {
  readonly sound: boolean;
  readonly haptics: boolean;
  readonly reducedMotion: boolean;
  readonly fps: 30 | 60;
  readonly volume: number; // 0..1
}

/** 영구 — 실패해도 유지된다. 설정은 포함하지 않는다(셸이 SAVE_KEY_SETTINGS로 따로 보관). */
export interface MetaSave {
  readonly version: 1;
  readonly insight: number;
  readonly perks: Readonly<Record<PerkId, number>>;
  readonly discovered: readonly DiscoveryId[];
  readonly best: { readonly wave: number; readonly chapter: ChapterId; readonly elapsed: number };
}

/** 진행 중 캠페인. 웨이브 시작 스냅샷을 함께 들고 있어야 retryWave 가 성립한다. */
export interface RunSave {
  readonly version: 1;
  readonly seed: number;
  readonly chapter: ChapterId;
  readonly tick: Tick;
  readonly phase: Phase;
  readonly wave: number;
  readonly resources: Resources;
  readonly coreHp: number;
  readonly salvageRemaining: number;
  readonly buildings: readonly {
    readonly tile: TileIndex;
    readonly id: BuildingId;
    readonly level: number;
    readonly hp: number;
    readonly policy: TargetPolicy;
  }[];
  /** 실패 시 복원 기준이 되는 웨이브 시작 배치 */
  readonly waveStartBuildings: readonly {
    readonly tile: TileIndex;
    readonly id: BuildingId;
    readonly level: number;
  }[];
  readonly researched: readonly TechId[];
  readonly automation: Readonly<Record<AutomationKey, number>>;
  readonly flooded: readonly number[];
  readonly retryAttempts: number;
  readonly stats: SimStats;
  /** 웨이브 시작 시점의 자원·코어·잔해. 웨이브 도중 저장은 이 값으로 되돌려야 판매 환급·수확이 복제되지 않는다. 구버전 저장은 null */
  readonly waveStartEconomy: WaveStartEconomy | null;
  /** 무피해 연속 웨이브 수. 저장하지 않으면 새로고침으로 발견 진행이 사라진다 */
  readonly consecutiveFlawless: number;
}

export interface WaveStartEconomy {
  readonly resources: Resources;
  readonly coreHp: number;
  readonly salvageRemaining: number;
}

/** SAVE_KEY_RUN 에 저장되는 단일 봉투. sim.serialize() 가 이 모양을 직렬화한다. */
export interface OutpostSave {
  readonly version: 1;
  readonly meta: MetaSave;
  readonly run: RunSave | null;
}

export type SerializeSave = (save: OutpostSave) => string;
/** 손상·버전 불일치면 기본 메타 + run: null 로 수렴한다(예외를 던지지 않는다) */
export type ParseSave = (raw: string | null) => OutpostSave;
