/**
 * 심해 전초기지 — DOM HUD.
 *
 * 규칙
 *  - 시뮬레이션을 하지 않는다. view와 events를 읽어 화면에만 반영한다.
 *  - 경제 공식을 다시 쓰지 않는다. 비용은 content.ts 데이터와 sim.preview()가 준 값만 쓴다.
 *  - sync()는 rAF당 1회. 달라진 노드만 건드린다(innerHTML 재생성 금지).
 *  - 입력은 셸 이벤트로 main.ts에 올린다. HUD는 issue() 외의 경로로 상태를 바꾸지 않는다.
 */
import { BUILDINGS, ECONOMY, PERKS, TECHS } from './content.ts';
import type {
  AbilityId,
  AutomationKey,
  BuildPreview,
  BuildingId,
  Dispatch,
  OutpostHud,
  OutpostSettings,
  RejectReason,
  SimEvent,
  SimView,
  TargetPolicy,
  TechId,
  TileIndex,
} from './contract.ts';
import {
  ABILITY_LABELS,
  AUTOMATION_LABELS,
  BUILDING_LABELS,
  DISCOVERY_LABELS,
  PHASE_LABELS,
  POLICY_LABELS,
  affordability,
  describeComposition,
  formatCost,
  formatNumber,
  formatRate,
  formatSeconds,
  rejectMessage,
  salvageLabel,
  strengthBar,
  threatAdvice,
  unlockLabel,
} from './format.ts';

export const SHELL_EVENT = 'outpost:shell';
export type ShellMode = 'select' | 'build' | 'move' | 'aim';

export type ShellDetail =
  | { readonly kind: 'mode'; readonly mode: ShellMode; readonly ability?: AbilityId }
  | { readonly kind: 'selectBuilding'; readonly building: BuildingId }
  | { readonly kind: 'confirmBuild' }
  | { readonly kind: 'cancelBuild' }
  | { readonly kind: 'settings'; readonly settings: OutpostSettings }
  | { readonly kind: 'restart' }
  | { readonly kind: 'togglePause' }
  /** 모바일 시트가 월드를 가리는 동안 시뮬을 멈추기 위해 셸에 알린다 */
  | { readonly kind: 'sheet'; readonly open: boolean };

export interface GhostInfo {
  readonly building: BuildingId;
  readonly tile: TileIndex;
  readonly preview: BuildPreview;
}

/** 계약(OutpostHud) + 셸 전용 메서드. main.ts만 쓴다. */
export interface ShellHud extends OutpostHud {
  setMode(mode: ShellMode, ability?: AbilityId | null): void;
  setGhost(info: GhostInfo | null): void;
  setSelected(tile: TileIndex | null): void;
  setSettings(settings: OutpostSettings): void;
  setPaused(paused: boolean): void;
}

const BUILD_ORDER: readonly BuildingId[] = ['bulkhead', 'collector', 'harpoon', 'mortar', 'droneBay', 'resonator'];
const TECH_ORDER: readonly TechId[] = ['piercingHarpoon', 'wideBlast', 'reinforcedWalls', 'droneLogistics'];
const POLICIES: readonly TargetPolicy[] = ['nearest', 'leader', 'air'];
const ABILITY_ORDER: readonly AbilityId[] = ['sonarPulse', 'weld'];

/* ───────────── DOM 헬퍼 (달라질 때만 쓴다) ───────────── */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  attrs?: Record<string, string>,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function setText(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

function setAttr(node: Element, name: string, value: string | null): void {
  if (value === null) {
    if (node.hasAttribute(name)) node.removeAttribute(name);
  } else if (node.getAttribute(name) !== value) {
    node.setAttribute(name, value);
  }
}

function setHidden(node: HTMLElement, hidden: boolean): void {
  node.classList.toggle('op-hidden', hidden);
}

function setWidth(node: HTMLElement, ratio: number): void {
  const pct = `${(Math.max(0, Math.min(1, ratio)) * 100).toFixed(1)}%`;
  if (node.style.width !== pct) node.style.width = pct;
}

function setDisabled(node: HTMLButtonElement, disabled: boolean): void {
  if (node.disabled !== disabled) node.disabled = disabled;
}

interface StatCell {
  readonly root: HTMLElement;
  readonly value: HTMLElement;
}

function statCell(tone: string, label: string, op: string): StatCell {
  const root = el('div', 'op-stat', { 'data-tone': tone, 'data-op': op });
  const value = el('b', 'op-num');
  const caption = el('span');
  caption.textContent = label;
  root.append(value, caption);
  return { root, value };
}

interface MeterParts {
  readonly root: HTMLElement;
  readonly fill: HTMLElement;
}

function meter(kind: string, op: string): MeterParts {
  const root = el('div', 'op-meter', { 'data-kind': kind, 'data-op': op });
  const fill = el('i');
  root.append(fill);
  return { root, fill };
}

/* ───────────── 본체 ───────────── */

export function createHud(root: HTMLElement, dispatch: Dispatch): ShellHud {
  const emit = (detail: ShellDetail): void => {
    root.dispatchEvent(new CustomEvent<ShellDetail>(SHELL_EVENT, { detail, bubbles: false }));
  };

  const shell = el('div', 'op', { 'data-op': 'shell' });

  /* 상단 리본 */
  const bar = el('header', 'op-bar', { 'data-op': 'bar' });
  const scrap = statCell('scrap', '고철', 'scrap');
  const biomass = statCell('biomass', '생체', 'biomass');
  const salvageBox = el('div', 'op-salvage', { 'data-op': 'salvage' });
  const salvageMeter = meter('salvage', 'salvage-meter');
  const salvageText = el('small', 'op-num');
  salvageBox.append(salvageMeter.root, salvageText);
  const coreBox = el('div', 'op-salvage', { 'data-op': 'core' });
  const coreMeter = meter('core', 'core-meter');
  const coreText = el('small', 'op-num');
  coreBox.append(coreMeter.root, coreText);
  const waveCell = statCell('wave', '웨이브', 'wave');
  bar.append(scrap.root, biomass.root, waveCell.root, salvageBox, coreBox);

  /* 월드 */
  const world = el('main', 'op-world', { 'data-op': 'world' });
  const canvas = el('canvas', undefined, { 'data-op': 'canvas', 'aria-label': '전장' });
  const overlay = el('div', 'op-overlay', { 'data-op': 'overlay' });
  const banner = el('div', 'op-banner op-hidden', { 'data-op': 'banner', role: 'status' });
  const bannerTitle = el('b');
  const bannerBody = el('span');
  banner.append(bannerTitle, bannerBody);
  const callout = el('div', 'op-callout op-hidden', { 'data-op': 'callout' });
  const calloutTitle = el('b', undefined, { 'data-op': 'callout-title' });
  const calloutBody = el('span', undefined, { 'data-op': 'callout-body' });
  callout.append(calloutTitle, calloutBody);
  const confirmRow = el('div', 'op-confirm op-hidden', { 'data-op': 'confirm-row' });
  const confirmBtn = el('button', 'op-btn', {
    'data-op': 'confirm-build',
    'data-primary': 'true',
    type: 'button',
    'aria-label': '건설 확정',
  });
  confirmBtn.textContent = '✓';
  const cancelBtn = el('button', 'op-btn', {
    'data-op': 'cancel-build',
    type: 'button',
    'aria-label': '건설 취소',
  });
  cancelBtn.textContent = '✕';
  confirmRow.append(confirmBtn, cancelBtn);
  const toastNode = el('div', 'op-toast op-hidden', { 'data-op': 'toast', role: 'alert' });
  const modal = el('div', 'op-modal op-hidden', { 'data-op': 'modal' });
  const modalCard = el('div');
  const modalTitle = el('h2');
  const modalBody = el('p');
  const modalBtn = el('button', 'op-btn', { 'data-op': 'modal-action', 'data-primary': 'true', type: 'button' });
  modalCard.append(modalTitle, modalBody, modalBtn);
  modal.append(modalCard);
  overlay.append(banner, callout, confirmRow, toastNode, modal);
  world.append(canvas, overlay);

  /* 독 */
  const topInfo = el('div', 'op-topinfo', { 'data-op': 'topinfo' });
  const dock = el('footer', 'op-dock', { 'data-op': 'dock' });
  const prompt = el('div', 'op-prompt', { 'data-op': 'prompt', role: 'status' });
  const threat = el('div', 'op-threat', { 'data-op': 'threat' });
  const threatBars = el('u', undefined, { 'data-op': 'threat-bars' });
  const threatText = el('div');
  const threatTitle = el('b', undefined, { 'data-op': 'threat-title' });
  const threatAdviceNode = el('span', undefined, { 'data-op': 'threat-advice' });
  threatText.append(threatTitle, threatAdviceNode);
  threat.append(threatBars, threatText);
  topInfo.append(threat, prompt);
  const buildStrip = el('div', 'op-strip', { 'data-op': 'build-strip', role: 'group', 'aria-label': '건설' });
  const context = el('div', 'op-panel op-hidden', { 'data-op': 'context' });
  const controlRow = el('div', 'op-row', { 'data-op': 'control-row' });
  const abilityRow = controlRow;
  const actionRow = controlRow;
  dock.append(buildStrip, context, controlRow);

  const rail = el('aside', 'op-rail', { 'data-op': 'rail' });
  const sheet = el('div', 'op-sheet op-hidden', { 'data-op': 'sheet' });
  const sheetHead = el('header');
  const sheetTitle = el('h2');
  const sheetClose = el('button', 'op-btn', { 'data-op': 'sheet-close', type: 'button' });
  sheetClose.textContent = '닫기';
  sheetHead.append(sheetTitle, sheetClose);
  const sheetBody = el('div', 'op-list', { 'data-op': 'sheet-body' });
  sheet.append(sheetHead, sheetBody);

  // 예고·다음 한 수는 월드 «위»가 아니라 «앞»에 둔다. 오버레이로 띄우면 분출구가 있는 0행을 가려
  // 위협의 출처가 보이지 않는다. 남는 세로 공간은 짧은 화면용 압축 스타일이 흡수한다.
  shell.append(bar, topInfo, world, rail, dock, sheet);
  root.append(shell);

  /* ── 건설 칩 ── */
  interface Chip {
    readonly button: HTMLButtonElement;
    readonly cost: HTMLElement;
  }
  const chips = new Map<BuildingId, Chip>();
  for (const id of BUILD_ORDER) {
    const label = BUILDING_LABELS[id];
    const button = el('button', 'op-chip', {
      type: 'button',
      'data-op': `chip-${id}`,
      'data-building': id,
      'aria-pressed': 'false',
      'aria-label': `${label.name} 건설`,
    });
    const name = el('b');
    name.textContent = label.name;
    const cost = el('span', 'op-num');
    button.append(name, cost);
    button.addEventListener('click', () => emit({ kind: 'selectBuilding', building: id }));
    buildStrip.append(button);
    chips.set(id, { button, cost });
  }

  /* ── 액티브 버튼 ── */
  interface AbilityUi {
    readonly button: HTMLButtonElement;
    readonly cool: HTMLElement;
    readonly meterBar: HTMLElement;
    readonly readout: HTMLElement;
  }
  const abilityUi = new Map<AbilityId, AbilityUi>();
  for (const id of ABILITY_ORDER) {
    const label = ABILITY_LABELS[id];
    const button = el('button', 'op-btn op-ability', {
      type: 'button',
      'data-op': `ability-${id}`,
      'aria-pressed': 'false',
      'aria-label': `${label.name} 사용`,
    });
    const text = el('span');
    text.textContent = label.name;
    const cool = el('i');
    const meterBar = el('u');
    const readout = el('em', 'op-num');
    button.append(text, cool, meterBar, readout);
    button.addEventListener('click', () => emit({ kind: 'mode', mode: 'aim', ability: id }));
    abilityRow.append(button);
    abilityUi.set(id, { button, cool, meterBar, readout });
  }

  /* ── 행동 행 ── */
  const startBtn = el('button', 'op-btn', {
    type: 'button',
    'data-op': 'start-wave',
    'data-primary': 'true',
    'aria-label': '웨이브 시작',
  });
  const startLabel = el('b');
  const startBonus = el('em', 'op-num op-hidden');
  startBtn.append(startLabel, startBonus);
  const moveBtn = el('button', 'op-btn', {
    type: 'button',
    'data-op': 'mode-move',
    'aria-pressed': 'false',
    'aria-label': '잠수정 조타',
  });
  moveBtn.textContent = '조타';
  const menuBtn = el('button', 'op-btn', { type: 'button', 'data-op': 'open-menu', 'aria-label': '패널 열기' });
  menuBtn.textContent = '패널';
  const pauseBtn = el('button', 'op-btn', {
    type: 'button',
    'data-op': 'pause',
    'aria-pressed': 'false',
    'aria-label': '일시정지',
  });
  pauseBtn.textContent = '⏸';
  actionRow.append(startBtn, moveBtn, pauseBtn, menuBtn);

  startBtn.addEventListener('click', () => {
    const result = dispatch({ kind: 'startWave' });
    if (!result.ok) showToast(result.reason);
  });
  moveBtn.addEventListener('click', () => {
    const next = moveBtn.getAttribute('aria-pressed') === 'true' ? 'select' : 'move';
    emit({ kind: 'mode', mode: next });
  });
  pauseBtn.addEventListener('click', () => emit({ kind: 'togglePause' }));
  confirmBtn.addEventListener('click', () => emit({ kind: 'confirmBuild' }));
  cancelBtn.addEventListener('click', () => emit({ kind: 'cancelBuild' }));

  /* ── 패널들 ── */
  const panels = new Map<string, HTMLElement>();
  function panel(key: string, title: string): HTMLElement {
    const node = el('section', 'op-panel', { 'data-op': `panel-${key}`, 'data-panel': key });
    const heading = el('h2');
    heading.textContent = title;
    const list = el('div', 'op-list', { 'data-op': `list-${key}` });
    node.append(heading, list);
    panels.set(key, node);
    return list;
  }

  const researchList = panel('research', '연구');
  const automationList = panel('automation', '자동화');
  const unlockList = panel('unlock', '해금');
  const discoveryList = panel('discovery', '발견');
  const perkList = panel('perk', '통찰 퍼크');
  const settingsList = panel('settings', '설정');

  /* 연구 */
  const techRows = new Map<TechId, { button: HTMLButtonElement; detail: HTMLElement }>();
  for (const id of TECH_ORDER) {
    const spec = TECHS[id];
    const button = el('button', 'op-item', { type: 'button', 'data-op': `tech-${id}` });
    const box = el('div');
    const name = el('b');
    name.textContent = spec.name;
    const detail = el('span');
    box.append(name, detail);
    button.append(box);
    button.addEventListener('click', () => {
      const result = dispatch({ kind: 'research', tech: id });
      if (!result.ok) showToast(result.reason);
    });
    researchList.append(button);
    techRows.set(id, { button, detail });
  }

  /* 자동화 */
  const autoRows = new Map<AutomationKey, { root: HTMLElement; buttons: HTMLButtonElement[]; note: HTMLElement }>();
  for (const key of ['droneRole', 'autoRebuildWalls'] as const) {
    const spec = AUTOMATION_LABELS[key];
    const row = el('div', 'op-item', { 'data-op': `automation-${key}`, 'data-static': 'true' });
    const box = el('div');
    const name = el('b');
    name.textContent = spec.name;
    const note = el('span');
    box.append(name, note);
    const seg = el('div', 'op-seg');
    const buttons: HTMLButtonElement[] = [];
    spec.options.forEach((option, index) => {
      const button = el('button', 'op-btn', {
        type: 'button',
        'data-op': `automation-${key}-${index}`,
        'aria-pressed': 'false',
      });
      button.textContent = option;
      button.addEventListener('click', () => {
        const result = dispatch({ kind: 'setAutomation', key, value: index });
        if (!result.ok) showToast(result.reason);
      });
      buttons.push(button);
      seg.append(button);
    });
    row.append(box, seg);
    automationList.append(row);
    autoRows.set(key, { root: row, buttons, note });
  }

  /* 해금 진행 */
  const unlockRows = new Map<BuildingId, { root: HTMLElement; detail: HTMLElement }>();
  for (const id of BUILD_ORDER) {
    const row = el('div', 'op-item', { 'data-op': `unlock-${id}`, 'data-static': 'true' });
    const box = el('div');
    const name = el('b');
    name.textContent = BUILDING_LABELS[id].name;
    const detail = el('span');
    box.append(name, detail);
    row.append(box);
    unlockList.append(row);
    unlockRows.set(id, { root: row, detail });
  }

  /* 퍼크 */
  const perkRows = new Map<string, { button: HTMLButtonElement; detail: HTMLElement }>();
  for (const id of Object.keys(PERKS) as (keyof typeof PERKS)[]) {
    const spec = PERKS[id];
    const button = el('button', 'op-item', { type: 'button', 'data-op': `perk-${String(id)}` });
    const box = el('div');
    const name = el('b');
    name.textContent = spec.name;
    const detail = el('span');
    box.append(name, detail);
    button.append(box);
    button.addEventListener('click', () => {
      const result = dispatch({ kind: 'spendInsight', perk: id });
      if (!result.ok) showToast(result.reason);
    });
    perkList.append(button);
    perkRows.set(String(id), { button, detail });
  }

  /* 설정 */
  let settings: OutpostSettings = { sound: false, haptics: true, reducedMotion: false, fps: 60, volume: 0.6 };
  const settingToggles = new Map<string, HTMLButtonElement>();
  function toggleRow(key: 'sound' | 'haptics' | 'reducedMotion', label: string): void {
    const row = el('div', 'op-item', { 'data-static': 'true' });
    const box = el('div');
    const name = el('b');
    name.textContent = label;
    box.append(name);
    const button = el('button', 'op-btn', {
      type: 'button',
      'data-op': `setting-${key}`,
      'aria-pressed': 'false',
      'aria-label': label,
    });
    button.textContent = '끔';
    button.addEventListener('click', () => {
      settings = { ...settings, [key]: !settings[key] };
      emit({ kind: 'settings', settings });
      renderSettings();
    });
    row.append(box, button);
    settingsList.append(row);
    settingToggles.set(key, button);
  }
  toggleRow('sound', '소리');
  toggleRow('haptics', '진동');
  toggleRow('reducedMotion', '모션 줄이기');

  const fpsRow = el('div', 'op-item', { 'data-static': 'true' });
  const fpsBox = el('div');
  const fpsName = el('b');
  fpsName.textContent = '프레임';
  fpsBox.append(fpsName);
  const fpsButton = el('button', 'op-btn', { type: 'button', 'data-op': 'setting-fps', 'aria-label': '프레임 설정' });
  fpsButton.addEventListener('click', () => {
    settings = { ...settings, fps: settings.fps === 60 ? 30 : 60 };
    emit({ kind: 'settings', settings });
    renderSettings();
  });
  fpsRow.append(fpsBox, fpsButton);
  settingsList.append(fpsRow);

  const restartRow = el('div', 'op-item', { 'data-static': 'true' });
  const restartBox = el('div');
  const restartName = el('b');
  restartName.textContent = '캠페인 초기화';
  const restartNote = el('span');
  restartNote.textContent = '통찰과 발견은 유지됩니다';
  restartBox.append(restartName, restartNote);
  const restartButton = el('button', 'op-btn', {
    type: 'button',
    'data-op': 'setting-restart',
    'data-danger': 'true',
    'aria-label': '캠페인 초기화',
  });
  restartButton.textContent = '초기화';
  restartButton.addEventListener('click', () => emit({ kind: 'restart' }));
  restartRow.append(restartBox, restartButton);
  settingsList.append(restartRow);

  function renderSettings(): void {
    for (const [key, button] of settingToggles) {
      const on = Boolean(settings[key as 'sound' | 'haptics' | 'reducedMotion']);
      setAttr(button, 'aria-pressed', on ? 'true' : 'false');
      setText(button, on ? '켬' : '끔');
    }
    setText(fpsButton, settings.fps === 60 ? '60fps' : '30fps');
  }
  renderSettings();

  /* ── 컨텍스트 트레이(선택한 구조물) ── */
  const contextTitle = el('b', undefined, { 'data-op': 'context-title' });
  const contextNote = el('span', undefined, { 'data-op': 'context-note' });
  const contextHead = el('div');
  contextHead.append(contextTitle, contextNote);
  const contextActions = el('div', 'op-seg');
  const upgradeBtn = el('button', 'op-btn', { type: 'button', 'data-op': 'upgrade', 'aria-label': '강화' });
  upgradeBtn.textContent = '강화';
  const sellBtn = el('button', 'op-btn', {
    type: 'button',
    'data-op': 'sell',
    'data-danger': 'true',
    'aria-label': '판매',
  });
  sellBtn.textContent = '판매';
  const closeCtxBtn = el('button', 'op-btn', { type: 'button', 'data-op': 'context-close', 'aria-label': '선택 해제' });
  closeCtxBtn.textContent = '해제';
  contextActions.append(upgradeBtn, sellBtn, closeCtxBtn);
  const policyRow = el('div', 'op-seg', { 'data-op': 'policy-row' });
  const policyButtons = new Map<TargetPolicy, HTMLButtonElement>();
  for (const policy of POLICIES) {
    const button = el('button', 'op-btn', {
      type: 'button',
      'data-op': `policy-${policy}`,
      'aria-pressed': 'false',
      'aria-label': `사격 정책 ${POLICY_LABELS[policy].name}`,
    });
    button.textContent = POLICY_LABELS[policy].name;
    button.addEventListener('click', () => {
      if (selectedTile === null) return;
      const result = dispatch({ kind: 'setPolicy', tile: selectedTile, policy });
      if (!result.ok) showToast(result.reason);
    });
    policyButtons.set(policy, button);
    policyRow.append(button);
  }
  context.append(contextHead, contextActions, policyRow);

  upgradeBtn.addEventListener('click', () => {
    if (selectedTile === null) return;
    const result = dispatch({ kind: 'upgrade', tile: selectedTile });
    if (!result.ok) showToast(result.reason);
  });
  sellBtn.addEventListener('click', () => {
    if (selectedTile === null) return;
    const result = dispatch({ kind: 'sell', tile: selectedTile });
    if (result.ok) setSelected(null);
    else showToast(result.reason);
  });
  closeCtxBtn.addEventListener('click', () => setSelected(null));

  /* ── 패널 배치: 데스크톱은 레일, 모바일은 시트 ── */
  const desktop = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 900px)') : null;
  let activePanel: string | null = null;
  let sheetWasOpen = false;

  function mountPanels(): void {
    const wide = desktop ? desktop.matches : false;
    for (const [key, node] of panels) {
      if (wide) {
        if (node.parentElement !== rail) rail.append(node);
        setHidden(node, false);
      } else {
        if (node.parentElement !== sheetBody) sheetBody.append(node);
        setHidden(node, key !== activePanel);
      }
    }
    const sheetOpen = !wide && activePanel !== null;
    setHidden(sheet, !sheetOpen);
    setHidden(menuBtn, wide);
    if (sheetOpen !== sheetWasOpen) {
      sheetWasOpen = sheetOpen;
      emit({ kind: 'sheet', open: sheetOpen });
    }
  }

  function openPanel(key: string | null): void {
    activePanel = key;
    if (key) setText(sheetTitle, panels.get(key)?.querySelector('h2')?.textContent ?? '패널');
    mountPanels();
  }

  menuBtn.addEventListener('click', () => openPanel(activePanel ? null : 'research'));
  sheetClose.addEventListener('click', () => openPanel(null));
  if (desktop) desktop.addEventListener('change', mountPanels);
  mountPanels();

  /* 모바일 시트에서 패널 사이 이동용 탭 */
  const sheetTabs = el('div', 'op-seg', { 'data-op': 'sheet-tabs' });
  for (const [key, node] of panels) {
    const button = el('button', 'op-btn', { type: 'button', 'data-op': `tab-${key}` });
    button.textContent = node.querySelector('h2')?.textContent ?? key;
    button.addEventListener('click', () => openPanel(key));
    sheetTabs.append(button);
  }
  sheet.insertBefore(sheetTabs, sheetBody);

  /* ── 토스트 ── */
  let toastTimer = 0;
  function showToast(reason: RejectReason): void {
    setText(toastNode, rejectMessage(reason));
    setHidden(toastNode, false);
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => setHidden(toastNode, true), 2400);
  }

  /* ── 배너(해금·발견·마일스톤) ── */
  let bannerTimer = 0;
  function showBanner(title: string, body: string): void {
    setText(bannerTitle, title);
    setText(bannerBody, body);
    setHidden(banner, false);
    if (bannerTimer) window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => setHidden(banner, true), 3200);
  }

  function handleEvents(events: readonly SimEvent[], replay: boolean): void {
    if (replay) return;
    for (const event of events) {
      if (event.kind === 'unlocked') {
        showBanner(`${BUILDING_LABELS[event.building].name} 해금`, BUILDING_LABELS[event.building].hint);
      } else if (event.kind === 'discovered') {
        const label = DISCOVERY_LABELS[event.id];
        showBanner(`발견 — ${label.name}`, label.reward);
      } else if (event.kind === 'automationUnlocked') {
        showBanner(`${AUTOMATION_LABELS[event.key].name} 사용 가능`, '이제 이 잡무는 위임할 수 있습니다');
      } else if (event.kind === 'chapterEntered') {
        showBanner(`${event.chapter}장`, '지형과 적 구성이 바뀝니다');
      } else if (event.kind === 'waveClear') {
        showBanner(
          `웨이브 ${event.index} 클리어`,
          `${event.flawless ? '무손실 · ' : ''}고철 ${formatNumber(event.rewardScrap)} 획득`,
        );
      } else if (event.kind === 'salvageExhausted') {
        showBanner('잔해 고갈', '웨이브를 시작하면 새 잔해가 내려옵니다');
      } else if (event.kind === 'salvageRefilled') {
        showBanner('새 잔해가 내려왔습니다', `이번 사이클 인양 한도 ${formatNumber(event.reserve)}`);
      }
    }
  }

  /* ── 선택·고스트 ── */
  let selectedTile: TileIndex | null = null;
  let mode: ShellMode = 'select';
  let aiming: AbilityId | null = null;
  let lastView: SimView | null = null;

  function setSelected(tile: TileIndex | null): void {
    selectedTile = tile;
    renderContext();
  }

  function renderContext(): void {
    const view = lastView;
    if (selectedTile === null || !view) {
      setHidden(context, true);
      setHidden(buildStrip, false);
      return;
    }
    let found: SimView['buildings'][number] | null = null;
    for (let i = 0; i < view.buildingCount; i += 1) {
      const building = view.buildings[i];
      if (building.tile === selectedTile) {
        found = building;
        break;
      }
    }
    if (!found) {
      setHidden(context, true);
      setHidden(buildStrip, false);
      return;
    }
    // 컨텍스트 트레이와 건설 칩은 자리를 나눠 쓴다 — 독 높이가 변하면 타일 크기가 흔들린다.
    setHidden(context, false);
    setHidden(buildStrip, true);
    const spec = BUILDINGS[found.id];
    setText(contextTitle, `${BUILDING_LABELS[found.id].name} Lv${found.level + 1}`);
    setText(
      contextNote,
      `내구 ${Math.ceil(found.hp)}/${found.maxHp} · ${BUILDING_LABELS[found.id].hint}`,
    );
    setDisabled(upgradeBtn, found.level >= spec.maxLevel);
    const combat = spec.damage > 0;
    setHidden(policyRow, !combat);
    for (const [policy, button] of policyButtons) {
      setAttr(button, 'aria-pressed', found.policy === policy ? 'true' : 'false');
    }
  }

  function setGhost(info: GhostInfo | null): void {
    if (!info) {
      setHidden(callout, true);
      setHidden(confirmRow, true);
      return;
    }
    const label = BUILDING_LABELS[info.building];
    const ok = info.preview.result.ok;
    const seals = info.preview.sealsPath;
    const reason = ok ? '' : rejectMessage(info.preview.result.reason);
    const detour =
      ok && info.preview.pathDeltaSeconds > 0.05 ? ` · 우회 +${info.preview.pathDeltaSeconds.toFixed(1)}초` : '';
    const body = ok ? `${formatCost(info.preview.cost)}${detour} · ${label.hint}` : reason;
    setText(calloutTitle, ok ? label.name : `${label.name} — 불가`);
    setText(calloutBody, ` ${body}${seals && ok ? ' · 길이 모두 막혀 적이 벽을 칩니다' : ''}`);
    setAttr(callout, 'data-invalid', ok ? null : 'true');
    setAttr(callout, 'data-seals', seals ? 'true' : null);
    setHidden(callout, false);
    setHidden(confirmRow, false);
    setDisabled(confirmBtn, !ok);
    confirmRow.style.left = '50%';
    confirmRow.style.bottom = '64px';
  }

  function setMode(next: ShellMode, ability?: AbilityId | null): void {
    mode = next;
    aiming = next === 'aim' ? ability ?? null : null;
    setAttr(moveBtn, 'aria-pressed', next === 'move' ? 'true' : 'false');
    for (const [id, ui] of abilityUi) {
      setAttr(ui.button, 'aria-pressed', aiming === id ? 'true' : 'false');
    }
    if (next !== 'build') setGhost(null);
    setAttr(shell, 'data-mode', next);
  }

  function setBuildSelection(building: BuildingId | null): void {
    for (const [id, chip] of chips) {
      setAttr(chip.button, 'aria-pressed', building === id ? 'true' : 'false');
    }
    if (building === null && mode === 'build') setMode('select');
    if (building !== null) {
      mode = 'build';
      setAttr(shell, 'data-mode', 'build');
      setAttr(moveBtn, 'aria-pressed', 'false');
      for (const ui of abilityUi.values()) setAttr(ui.button, 'aria-pressed', 'false');
      aiming = null;
    }
  }

  /* ── 다음 한 수 안내 ── */
  function nextAction(view: SimView): string {
    if (view.phase === 'defeat') return '재시도하면 웨이브 시작 시점 배치와 재건 예산으로 다시 시작합니다';
    if (view.phase === 'chapterCleared') return '다음 장으로 넘어가면 지형과 적이 바뀝니다';
    if (view.phase === 'victory') return '캠페인을 끝냈습니다';
    if (view.phase === 'wave') {
      if (view.sub.downedTicks > 0) return '잠수정이 복귀 중입니다';
      return '액티브로 버티고, 무너지는 벽은 용접하세요';
    }
    if (view.buildingCount === 0) return '작살을 골라 통로에 세우세요';
    if (!view.salvage.exhausted && !view.sub.harvesting) {
      return '조타로 잠수정을 잔해에 붙이면 회수율 100%로 인양합니다';
    }
    if (view.salvage.exhausted) return '잔해가 고갈됐습니다 — 웨이브를 시작하세요';
    return '예고를 보고 배치를 바꾼 뒤 웨이브를 시작하세요';
  }

  /* ── sync ── */
  let lastFieldVersion = -1;
  let firstSync = true;
  let announcedOffline = false;
  const newlyUnlocked = new Set<BuildingId>();

  function sync(view: SimView, events: readonly SimEvent[]): void {
    lastView = view;
    const replay = firstSync;
    firstSync = false;
    for (const event of events) {
      if (event.kind === 'unlocked' && !replay) newlyUnlocked.add(event.building);
      else if (event.kind === 'waveStart') newlyUnlocked.clear();
    }
    handleEvents(events, replay);

    setText(scrap.value, formatNumber(view.resources.scrap));
    setText(biomass.value, formatNumber(view.resources.biomass));
    setText(waveCell.value, `${view.wave.index}/${view.wave.total}`);

    const salvageRatio = view.salvage.reserveTotal > 0 ? view.salvage.reserveRemaining / view.salvage.reserveTotal : 0;
    setWidth(salvageMeter.fill, salvageRatio);
    setAttr(salvageMeter.root, 'data-exhausted', view.salvage.exhausted ? 'true' : 'false');
    setAttr(salvageBox, 'data-exhausted', view.salvage.exhausted ? 'true' : 'false');
    setText(
      salvageText,
      `${salvageLabel(view.salvage.reserveRemaining, view.salvage.reserveTotal, view.salvage.exhausted)} · ${formatRate(view.incomePerSecond.scrap)}`,
    );

    const coreRatio = view.core.maxHp > 0 ? view.core.hp / view.core.maxHp : 0;
    setWidth(coreMeter.fill, coreRatio);
    setAttr(coreMeter.root, 'data-low', coreRatio <= 0.34 ? 'true' : 'false');
    setText(coreText, `코어 ${Math.ceil(view.core.hp)} · ${PHASE_LABELS[view.phase]}`);

    syncThreat(view);
    syncChips(view);
    syncAbilities(view);
    syncActions(view);
    syncPanels(view);
    setText(prompt, nextAction(view));

    // 오프라인 지급은 첫 동기화에서 한 번만 알린다 — 리저브 안에서만 계산된 값이다.
    if (!announcedOffline) {
      announcedOffline = true;
      if (view.salvage.offlineGranted > 0) {
        showBanner(
          '자리를 비운 동안',
          `드론과 수집기가 고철 ${formatNumber(view.salvage.offlineGranted)}을 모았습니다`,
        );
      }
    }

    if (selectedTile !== null || view.fieldVersion !== lastFieldVersion) {
      lastFieldVersion = view.fieldVersion;
      renderContext();
    }
    syncModal(view);
  }

  function syncThreat(view: SimView): void {
    const composition = view.wave.composition;
    setText(threatTitle, `다음: ${describeComposition(composition)}`);
    setText(threatAdviceNode, threatAdvice(composition));
    let bars = '';
    for (const entry of view.wave.incoming) bars += strengthBar(entry.strength);
    setText(threatBars, bars);
    setHidden(threat, view.phase !== 'build');
  }

  function syncChips(view: SimView): void {
    for (const [id, chip] of chips) {
      const spec = BUILDINGS[id];
      const unlocked = view.unlockedBuildings.includes(id);
      const afford = affordability(view.resources, spec.cost);
      setAttr(chip.button, 'data-locked', unlocked ? null : 'true');
      setAttr(chip.button, 'data-afford', afford);
      setAttr(chip.button, 'data-new', newlyUnlocked.has(id) ? 'true' : null);
      setDisabled(chip.button, !unlocked);
      const progress = view.unlockProgress.find((entry) => entry.building === id);
      setText(chip.cost, unlocked ? formatCost(spec.cost) : progress ? unlockLabel(progress) : '잠김');
    }
  }

  function syncAbilities(view: SimView): void {
    for (const state of view.sub.abilities) {
      const ui = abilityUi.get(state.id);
      if (!ui) continue;
      const ratio = state.cooldownMax > 0 ? state.cooldown / state.cooldownMax : 0;
      setWidth(ui.cool, ratio);
      setWidth(ui.meterBar, state.meter);
      const perfect = Math.abs(state.meter - 1) <= state.perfectWindow;
      setAttr(ui.button, 'data-perfect', perfect ? 'true' : 'false');
      setText(ui.readout, state.cooldown > 0 ? `${state.cooldown.toFixed(1)}` : '준비');
      setDisabled(ui.button, !state.unlocked || state.cooldown > 0 || view.sub.downedTicks > 0);
    }
  }

  function syncActions(view: SimView): void {
    const canStart = view.phase === 'build';
    setDisabled(startBtn, !canStart);
    const bonus = Math.max(0, ECONOMY.earlyBonusSeconds - view.wave.buildSeconds);
    // 보너스는 둘째 줄에 따로 둔다 — 한 줄에 붙이면 360px 폭에서 라벨이 잘린다.
    setText(startLabel, canStart ? `웨이브 ${view.wave.index} 시작` : PHASE_LABELS[view.phase]);
    setText(startBonus, `조기 +25% ${formatSeconds(bonus)}`);
    setHidden(startBonus, !(canStart && view.wave.earlyBonusActive));
    setAttr(startBtn, 'data-early', view.wave.earlyBonusActive ? 'true' : 'false');
    setDisabled(moveBtn, view.sub.downedTicks > 0);
  }

  function syncPanels(view: SimView): void {
    for (const [id, row] of techRows) {
      const spec = TECHS[id];
      const done = view.researched.includes(id);
      setAttr(row.button, 'data-done', done ? 'true' : null);
      setDisabled(row.button, done);
      setText(row.detail, done ? `연구 완료 · ${spec.effect}` : `${formatCost(spec.cost)} · ${spec.effect}`);
    }
    for (const [key, row] of autoRows) {
      const unlocked = view.automationUnlocked.includes(key);
      const value = view.automation[key];
      setAttr(row.root, 'data-locked', unlocked ? null : 'true');
      setText(row.note, unlocked ? AUTOMATION_LABELS[key].name : '아직 해금되지 않았습니다');
      row.buttons.forEach((button, index) => {
        setAttr(button, 'aria-pressed', value === index ? 'true' : 'false');
        setDisabled(button, !unlocked);
      });
    }
    for (const progress of view.unlockProgress) {
      const row = unlockRows.get(progress.building);
      if (!row) continue;
      setAttr(row.root, 'data-done', progress.unlocked ? 'true' : null);
      setText(row.detail, unlockLabel(progress));
    }
    syncDiscoveries(view);
    for (const [key, row] of perkRows) {
      const perkId = key as keyof typeof PERKS;
      const spec = PERKS[perkId];
      const level = view.perks[perkId] ?? 0;
      const maxed = level >= spec.maxLevel;
      setText(row.detail, `${level}/${spec.maxLevel} · 통찰 ${spec.cost} · ${spec.effect}`);
      setDisabled(row.button, maxed || view.insight < spec.cost);
      setAttr(row.button, 'data-done', maxed ? 'true' : null);
    }
  }

  let discoverySignature = '';
  function syncDiscoveries(view: SimView): void {
    const signature = `${view.discovered.join(',')}|${view.hints.map((hint) => hint.id).join(',')}`;
    if (signature === discoverySignature) return;
    discoverySignature = signature;
    discoveryList.replaceChildren();
    for (const id of Object.keys(DISCOVERY_LABELS) as (keyof typeof DISCOVERY_LABELS)[]) {
      const found = view.discovered.includes(id);
      const hint = view.hints.find((entry) => entry.id === id);
      const row = el('div', 'op-item', { 'data-op': `discovery-${id}`, 'data-static': 'true' });
      const box = el('div');
      const name = el('b');
      name.textContent = found ? DISCOVERY_LABELS[id].name : '???';
      const detail = el('span', found ? undefined : 'op-hint');
      detail.textContent = found ? DISCOVERY_LABELS[id].reward : (hint?.text ?? '아직 단서가 없습니다');
      box.append(name, detail);
      row.append(box);
      discoveryList.append(row);
    }
  }

  let modalKey = '';
  function syncModal(view: SimView): void {
    const key = view.phase === 'defeat' || view.phase === 'chapterCleared' || view.phase === 'victory' ? view.phase : '';
    if (key === modalKey) return;
    modalKey = key;
    setHidden(modal, key === '');
    setAttr(modal, 'data-kind', key === '' ? null : key);
    if (key === 'defeat') {
      setText(modalTitle, '전초기지 침수');
      setText(
        modalBody,
        `웨이브 ${view.retry.wave}을 다시 시도합니다. 발견·연구·통찰은 그대로 남고 재건 예산 고철 ${formatNumber(view.retry.rebuildGrant)}을 받습니다. (시도 ${view.retry.attempts + 1}회차)`,
      );
      setText(modalBtn, '같은 웨이브 재시도');
      setAttr(modalBtn, 'aria-label', '같은 웨이브 재시도');
      modalBtn.onclick = () => {
        const result = dispatch({ kind: 'retryWave' });
        if (!result.ok) showToast(result.reason);
      };
    } else if (key === 'chapterCleared') {
      setText(modalTitle, '1장 완료');
      setText(modalBody, '더 깊은 구역으로 내려갑니다. 지형과 적 구성이 함께 바뀝니다.');
      setText(modalBtn, '2장으로');
      setAttr(modalBtn, 'aria-label', '2장으로 진입');
      modalBtn.onclick = () => {
        const result = dispatch({ kind: 'advanceChapter' });
        if (!result.ok) showToast(result.reason);
      };
    } else if (key === 'victory') {
      setText(modalTitle, '캠페인 완료');
      setText(modalBody, `총 ${formatSeconds(view.stats.elapsed)} · 처치 ${formatNumber(view.stats.kills)}`);
      setText(modalBtn, '새 캠페인');
      setAttr(modalBtn, 'aria-label', '새 캠페인 시작');
      modalBtn.onclick = () => emit({ kind: 'restart' });
    }
  }

  function destroy(): void {
    if (toastTimer) window.clearTimeout(toastTimer);
    if (bannerTimer) window.clearTimeout(bannerTimer);
    if (desktop) desktop.removeEventListener('change', mountPanels);
    shell.remove();
  }

  return {
    sync,
    toast: showToast,
    setBuildSelection,
    setMode,
    setGhost,
    setSelected,
    setSettings(next: OutpostSettings) {
      settings = next;
      renderSettings();
    },
    setPaused(paused: boolean) {
      setAttr(pauseBtn, 'aria-pressed', paused ? 'true' : 'false');
      setAttr(pauseBtn, 'aria-label', paused ? '재개' : '일시정지');
      setText(pauseBtn, paused ? '▶' : '⏸');
      setAttr(shell, 'data-paused', paused ? 'true' : null);
    },
    destroy,
  };
}
