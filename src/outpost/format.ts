/**
 * 심해 전초기지 — 순수 표시 계층.
 *
 * DOM·시뮬레이션·난수·시간에 접근하지 않는다. 숫자 규칙은 content.ts가, 한국어 문구는 여기가 소유한다.
 * Record<전체 키, …> 매핑이라 라벨이 하나라도 빠지면 타입 에러가 난다(한국어 누락 방지).
 */
import type {
  AbilityId,
  AutomationKey,
  BuildingId,
  DiscoveryId,
  EnemyRole,
  EnemyVariant,
  Phase,
  RejectReason,
  Resources,
  TargetPolicy,
  UnlockProgressView,
} from './contract.ts';

export interface BuildingLabel {
  readonly name: string;
  readonly short: string;
  /** 건설 칩과 고스트 콜아웃에 쓰는 한 줄. "무엇을 하는가"만 적는다 */
  readonly hint: string;
  /** 전략 판독용 기하 — 면/점/선 (아트 검토 §7) */
  readonly geometry: '면' | '점' | '선' | '—';
}

export const BUILDING_LABELS: Readonly<Record<BuildingId, BuildingLabel>> = {
  bulkhead: { name: '격벽', short: '격벽', hint: '경로를 길게 돌린다. 공격은 하지 않는다', geometry: '면' },
  collector: { name: '수집기', short: '수집', hint: '잔해에 붙여 자동으로 인양한다', geometry: '—' },
  harpoon: { name: '작살', short: '작살', hint: '단일 표적. 지상과 공중을 모두 친다', geometry: '점' },
  mortar: { name: '박격포', short: '박격', hint: '폭발 광역. 지상 전용이고 최소 사거리가 있다', geometry: '면' },
  droneBay: { name: '드론 정비고', short: '드론', hint: '드론이 인양과 정비를 대신한다', geometry: '—' },
  resonator: { name: '공명기', short: '공명', hint: '열수 위에만. 장갑을 무시한다', geometry: '선' },
};

export interface EnemyLabel {
  readonly name: string;
  /** 무엇으로 막는가 — 예고 카드의 카운터 힌트 */
  readonly counter: string;
}

export const ENEMY_LABELS: Readonly<Record<EnemyRole, EnemyLabel>> = {
  drifter: { name: '표류체', counter: '작살로 하나씩' },
  swarm: { name: '군체', counter: '박격포 광역이 필요' },
  breacher: { name: '굴착체', counter: '벽을 부순다 — 2선 배치' },
  glider: { name: '부유체', counter: '벽을 무시한다 — 작살 대공' },
  leviathan: { name: '리바이어던', counter: '지속 화력 + 액티브' },
};

export const VARIANT_LABELS: Readonly<Record<EnemyVariant, string>> = { base: '', elite: '정예' };

export const ABILITY_LABELS: Readonly<Record<AbilityId, { readonly name: string; readonly hint: string }>> = {
  sonarPulse: { name: '소나 충격파', hint: '범위 피해 + 둔화' },
  weld: { name: '긴급 용접', hint: '구조물·코어 즉시 수리' },
};

export const POLICY_LABELS: Readonly<Record<TargetPolicy, { readonly name: string; readonly hint: string }>> = {
  nearest: { name: '근접', hint: '가장 가까운 적' },
  leader: { name: '선두', hint: '코어에 가장 가까운 적' },
  air: { name: '대공', hint: '공중을 우선' },
};

export const AUTOMATION_LABELS: Readonly<Record<AutomationKey, { readonly name: string; readonly options: readonly string[] }>> = {
  droneRole: { name: '드론 역할', options: ['인양', '정비', '혼합'] },
  autoRebuildWalls: { name: '격벽 자동 재건', options: ['끔', '켬'] },
};

export const DISCOVERY_LABELS: Readonly<Record<DiscoveryId, { readonly name: string; readonly reward: string }>> = {
  ventResonance: { name: '벤트 공명', reward: '공명기 설계도' },
  flawlessPair: { name: '무손실', reward: '정밀 사격' },
  deepArchaeology: { name: '심해 고고학', reward: '잠수정 강화' },
};

export const PHASE_LABELS: Readonly<Record<Phase, string>> = {
  build: '건설 단계',
  wave: '교전 중',
  chapterCleared: '1장 완료',
  defeat: '전초기지 침수',
  victory: '캠페인 완료',
};

export const REJECT_MESSAGES: Readonly<Record<RejectReason, string>> = {
  notEnoughResources: '자원이 모자랍니다',
  tileOccupied: '이미 무언가 있습니다',
  tileNotBuildable: '여기에는 지을 수 없습니다',
  outOfBounds: '전장 밖입니다',
  buildingLocked: '아직 해금되지 않았습니다',
  maxLevel: '이미 최대 강화입니다',
  notAdjacentToWreck: '잔해에 붙여야 합니다',
  thermalOnly: '열수 분출구 위에만 세울 수 있습니다',
  onCooldown: '재사용 대기 중입니다',
  wrongPhase: '지금은 할 수 없습니다',
  alreadyResearched: '이미 연구했습니다',
  notEnoughInsight: '통찰이 모자랍니다',
  perkMaxed: '이미 최대 단계입니다',
  subDowned: '잠수정이 복귀 중입니다',
  salvageExhausted: '이번 분출의 잔해가 고갈됐습니다',
  nothingToRetry: '다시 시도할 웨이브가 없습니다',
};

export function rejectMessage(reason: RejectReason): string {
  return REJECT_MESSAGES[reason];
}

/** 1,000 미만은 정수, 1천~9999는 1.2천, 10,000 이상은 3.4만 */
export function formatNumber(value: number): string {
  const v = Math.floor(Number.isFinite(value) ? value : 0);
  if (v < 0) return `-${formatNumber(-v)}`;
  if (v < 1000) return String(v);
  if (v < 10000) return `${trimZero(v / 1000)}천`;
  return `${trimZero(v / 10000)}만`;
}

/** 반올림하면 9,999가 "10천"이 되어 단위가 어긋난다. 버림으로 단위를 유지한다. */
function trimZero(value: number): string {
  const fixed = (Math.floor(value * 10) / 10).toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

export function formatRate(perSecond: number): string {
  const v = Number.isFinite(perSecond) ? perSecond : 0;
  const sign = v < 0 ? '-' : '+';
  return `${sign}${Math.abs(v).toFixed(1)}/초`;
}

/** 60초 미만은 "12초", 그 이상은 "2분 05초" */
export function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  if (total < 60) return `${total}초`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}분 ${String(s).padStart(2, '0')}초`;
}

export function formatPercent(ratio: number): string {
  const v = Number.isFinite(ratio) ? ratio : 0;
  return `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
}

/** 비용 표기. 0인 자원은 적지 않는다 — 테크는 생체물질만 쓰므로 "고철 0"이 뜨면 안 된다 */
export function formatCost(cost: Resources): string {
  const parts: string[] = [];
  if (cost.scrap > 0) parts.push(`고철 ${formatNumber(cost.scrap)}`);
  if (cost.biomass > 0) parts.push(`생체 ${formatNumber(cost.biomass)}`);
  return parts.length > 0 ? parts.join(' · ') : '무료';
}

export type Affordability = 'ok' | 'tooExpensive';

export function affordability(resources: Resources, cost: Resources): Affordability {
  return resources.scrap >= cost.scrap && resources.biomass >= cost.biomass ? 'ok' : 'tooExpensive';
}

export interface CompositionEntry {
  readonly role: EnemyRole;
  readonly variant: EnemyVariant;
  readonly count: number;
}

/** "정예 표류체 10 · 굴착체 3" — 예고 카드 제목 */
export function describeComposition(composition: readonly CompositionEntry[]): string {
  if (composition.length === 0) return '적 없음';
  return composition
    .map((entry) => {
      const variant = VARIANT_LABELS[entry.variant];
      const name = ENEMY_LABELS[entry.role].name;
      return `${variant ? `${variant} ` : ''}${name} ${entry.count}`;
    })
    .join(' · ');
}

/**
 * 예고 카드의 카운터 힌트. 가장 수가 많은 역할 하나만 고른다 —
 * 전부 나열하면 읽지 않는다. 정예가 섞이면 장갑 경고를 앞에 붙인다.
 */
export function threatAdvice(composition: readonly CompositionEntry[]): string {
  if (composition.length === 0) return '';
  let top = composition[0];
  for (const entry of composition) if (entry.count > top.count) top = entry;
  const advice = ENEMY_LABELS[top.role].counter;
  const hasElite = composition.some((entry) => entry.variant === 'elite');
  return hasElite ? `장갑 있음 — ${advice}` : advice;
}

/** 위협 세기 0~3을 글자 없이 읽히는 막대로 */
export function strengthBar(strength: 0 | 1 | 2 | 3): string {
  return '▁▃▅█'.charAt(strength);
}

export function unlockLabel(progress: UnlockProgressView): string {
  if (progress.unlocked) return '해금됨';
  if (progress.requirement === 'discovery') return '??? 발견으로 열린다';
  if (progress.requirement === 'waveClear') {
    return progress.wavesRemaining <= 0 ? '다음 웨이브 클리어' : `웨이브 ${progress.wavesRemaining}회 더`;
  }
  return '해금됨';
}

/** 상단 리본의 리저브 문구. 고갈은 문장으로도 말해 준다(버그로 오인 방지) */
export function salvageLabel(remaining: number, total: number, exhausted: boolean): string {
  if (exhausted) return '잔해 고갈 — 웨이브를 시작하면 새 잔해가 내려옵니다';
  return `잔해 ${formatNumber(remaining)} / ${formatNumber(total)}`;
}
