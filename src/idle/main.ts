/**
 * 꼬마 용사 키우기 — 셸: 루프, DOM UI, 입력, 저장, 방치 보상.
 * 규칙 계산은 logic.ts, 월드 그리기는 renderer.ts 가 한다. 여기서는 연결만 한다.
 */
import './idle.css';
import {
  ENEMY,
  GOLD,
  HERO,
  REBIRTH,
  SKILL,
  TICK,
  UNLOCK_STAGE,
  UPGRADES,
  UPGRADE_ORDER,
  WEAPONS,
  CRIT_PER_LEVEL,
  GOLD_PER_LEVEL,
  SPEED_PER_LEVEL,
  COMPANION,
  type UnlockId,
  type UpgradeId,
} from './content.ts';
import * as L from './logic.ts';
import { formatBig, formatDuration, formatPercent } from './format.ts';
import { createRenderer } from './renderer.ts';

const SAVED_AT_KEY = 'idle-hero-saved-at-v1';
const MAX_FRAME_SECONDS = 0.25;
const AUTOSAVE_SECONDS = 5;

const ICONS: Readonly<Record<UpgradeId, string>> = { attack: '⚔️', speed: '⚡', crit: '💥', gold: '💰', companion: '🧚' };

const UNLOCK_TEXT: Readonly<Record<UnlockId, readonly [string, string]>> = {
  skill: ['필살기 해금!', '번개 베기 — 버튼을 눌러 25배 피해'],
  companion: ['동료 요정 합류!', '강화 목록에서 요정을 키울 수 있어요'],
  auto: ['자동 전투 해금!', '필살기와 보스 도전을 자동으로 맡겨요'],
  rebirth: ['환생 해금!', '영혼석을 모아 영구히 강해져요'],
};

/* ───────────── 저장 ───────────── */

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 프라이빗 모드 등 — 저장 실패가 플레이를 막지 않는다 */
  }
}

function awaySeconds(): number {
  const savedAt = Number(readLocal(SAVED_AT_KEY));
  if (!Number.isFinite(savedAt) || savedAt <= 0) return 0;
  return Math.max(0, (Date.now() - savedAt) / 1000);
}

/* ───────────── DOM 유틸 ───────────── */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setText(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

function toggle(node: HTMLElement, name: string, on: boolean): void {
  if (node.classList.contains(name) !== on) node.classList.toggle(name, on);
}

/* ───────────── 강화 설명 ───────────── */

function effectText(state: L.GameState, id: UpgradeId): string {
  const level = state.levels[id];
  switch (id) {
    case 'attack': {
      const next = { ...state, levels: { ...state.levels, attack: level + 1 } };
      const evolveIn = HERO.evolveEvery - (level % HERO.evolveEvery);
      return `${formatBig(L.heroAttack(state))} → ${formatBig(L.heroAttack(next))} · 진화까지 ${evolveIn}`;
    }
    case 'speed':
      return `초당 ${(1 + SPEED_PER_LEVEL * level).toFixed(2)}회`;
    case 'crit':
      return `확률 ${formatPercent(CRIT_PER_LEVEL * level)} · 피해 ×${HERO.critMultiplier}`;
    case 'gold':
      return `골드 +${formatPercent(GOLD_PER_LEVEL * level)}`;
    case 'companion':
      return `초당 ${formatBig(L.companionHit(state) * COMPANION.attacksPerSecond)} 피해`;
  }
}

/* ───────────── 부트 ───────────── */

interface UpgradeRow {
  root: HTMLElement;
  level: HTMLElement;
  effect: HTMLElement;
  button: HTMLButtonElement;
  cost: HTMLElement;
  lock: HTMLElement;
}

export function boot(root: HTMLElement): void {
  const state = L.parse(readLocal(L.SAVE_KEY), Date.now() >>> 0);
  let buyAmount: L.BuyAmount = 1;

  const shell = el('div', 'ih');
  const top = buildTop();
  const world = el('main', 'ih-world');
  const canvas = el('canvas');
  canvas.setAttribute('aria-label', '전투 화면');
  const controls = buildWorldControls();
  const banner = el('div', 'ih-banner ih-hidden');
  const bannerTitle = el('b');
  const bannerBody = el('span');
  banner.append(bannerTitle, bannerBody);
  world.append(canvas, controls.autos, controls.root, banner);
  const panel = buildPanel();
  const modal = buildModal();
  shell.append(top.root, world, panel.root, modal.root);
  root.append(shell);

  const renderer = createRenderer(canvas);
  renderer.setReducedMotion(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

  /* ── 상단 ── */
  function buildTop() {
    const rootNode = el('header', 'ih-top');
    const goldBox = el('div', 'ih-gold');
    const coin = el('i', 'ih-coin');
    const gold = el('b', 'ih-num');
    goldBox.append(coin, gold);
    const stageBox = el('div', 'ih-stage');
    const stage = el('b');
    const zone = el('span');
    const pips = el('div', 'ih-pips');
    const pipNodes: HTMLElement[] = [];
    for (let i = 0; i < ENEMY.killsPerStage; i++) {
      const pip = el('i');
      pipNodes.push(pip);
      pips.append(pip);
    }
    const bossBar = el('div', 'ih-bossbar ih-hidden');
    const bossFill = el('i');
    bossBar.append(bossFill);
    stageBox.append(stage, zone, pips, bossBar);
    const stones = el('div', 'ih-stones ih-hidden');
    rootNode.append(goldBox, stageBox, stones);
    return { root: rootNode, coin, gold, stage, zone, pipNodes, bossBar, bossFill, stones };
  }

  /* ── 월드 위 버튼 ── */
  function buildWorldControls() {
    const rootNode = el('div', 'ih-controls');
    const skill = el('button', 'ih-skill');
    skill.type = 'button';
    skill.setAttribute('aria-label', '필살기 번개 베기');
    const skillIcon = el('span', undefined, '⚡');
    const skillCd = el('em', 'ih-num');
    skill.append(skillIcon, skillCd);
    const boss = el('button', 'ih-boss ih-hidden', '👑 보스 도전');
    boss.type = 'button';
    const autoSkill = el('button', 'ih-auto ih-hidden', '자동 필살기');
    autoSkill.type = 'button';
    const autoBoss = el('button', 'ih-auto ih-hidden', '자동 보스');
    autoBoss.type = 'button';
    const autos = el('div', 'ih-autos');
    autos.append(autoSkill, autoBoss);
    rootNode.append(boss, skill);
    return { root: rootNode, autos, skill, skillCd, boss, autoSkill, autoBoss };
  }

  /* ── 강화 패널 ── */
  function buildPanel() {
    const rootNode = el('section', 'ih-panel');
    const head = el('div', 'ih-panel-head');
    const dps = el('span', 'ih-dps');
    const amounts = el('div', 'ih-amounts');
    const amountButtons = new Map<L.BuyAmount, HTMLButtonElement>();
    for (const amount of [1, 10, 'max'] as const) {
      const button = el('button', undefined, amount === 'max' ? 'MAX' : `×${amount}`);
      button.type = 'button';
      button.addEventListener('click', () => (buyAmount = amount));
      amountButtons.set(amount, button);
      amounts.append(button);
    }
    head.append(dps, amounts);
    const list = el('div', 'ih-list');
    const rows = new Map<UpgradeId, UpgradeRow>();
    for (const id of UPGRADE_ORDER) {
      const row = buildRow(id);
      rows.set(id, row);
      list.append(row.root);
    }
    const rebirth = buildRebirth();
    list.append(rebirth.root);
    rootNode.append(head, list);
    return { root: rootNode, dps, amountButtons, rows, rebirth };
  }

  function buildRow(id: UpgradeId): UpgradeRow {
    const rowRoot = el('div', 'ih-row');
    const icon = el('div', 'ih-icon', ICONS[id]);
    const info = el('div', 'ih-info');
    const name = el('b', undefined, UPGRADES[id].name);
    const level = el('small', 'ih-lv');
    name.append(' ', level);
    const effect = el('span');
    info.append(name, effect);
    const button = el('button', 'ih-buy');
    button.type = 'button';
    const cost = el('span', 'ih-num');
    const lock = el('span', 'ih-lock ih-hidden');
    button.append(cost);
    button.addEventListener('click', () => {
      if (L.buy(state, id, buyAmount)) {
        rowRoot.classList.remove('ih-pop');
        void rowRoot.offsetWidth; // 연속 구매에도 반짝임이 다시 재생되도록
        rowRoot.classList.add('ih-pop');
        buzz(8);
      }
    });
    rowRoot.append(icon, info, button, lock);
    return { root: rowRoot, level, effect, button, cost, lock };
  }

  function buildRebirth() {
    const rootNode = el('div', 'ih-row ih-rebirth');
    const icon = el('div', 'ih-icon', '🔮');
    const info = el('div', 'ih-info');
    const name = el('b', undefined, '환생');
    const effect = el('span');
    info.append(name, effect);
    const button = el('button', 'ih-buy');
    button.type = 'button';
    const label = el('span');
    button.append(label);
    button.addEventListener('click', () => {
      const stones = L.rebirthStones(state);
      if (stones <= 0) return;
      const ok = window.confirm(`환생하면 스테이지·골드·강화가 초기화되고 영혼석 ${stones}개를 얻습니다.\n공격력·골드가 영구히 +${formatPercent(REBIRTH.bonusPerStone * stones)} 됩니다.`);
      if (ok) L.rebirth(state);
    });
    rootNode.append(icon, info, button);
    return { root: rootNode, effect, button, label };
  }

  function buildModal() {
    const rootNode = el('div', 'ih-modal ih-hidden');
    const card = el('div', 'ih-card');
    const title = el('h2', undefined, '다녀오셨어요!');
    const body = el('p');
    const button = el('button', 'ih-buy', '받기');
    button.type = 'button';
    card.append(title, body, button);
    rootNode.append(card);
    return { root: rootNode, body, button };
  }

  /* ── 방치 보상 ── */
  let pendingAway = 0;
  modal.button.addEventListener('click', () => {
    // 받기를 눌러야 들어온다 — 받는 순간의 코인 연출이 방치형의 보상감이다
    state.gold += pendingAway;
    pendingAway = 0;
    modal.root.classList.add('ih-hidden');
    renderer.coinRain(30);
    buzz(30);
  });

  function grantAway(seconds: number): void {
    const gold = L.offlineGold(state, seconds);
    if (gold <= 0) return;
    pendingAway += gold;
    const capped = Math.min(seconds, GOLD.offlineCapSeconds);
    setText(modal.body, `${formatDuration(capped)} 동안 용사가 사냥했어요.\n💰 ${formatBig(pendingAway)} 골드`);
    modal.root.classList.remove('ih-hidden');
  }

  /* ── 입력 ── */
  function buzz(ms: number): void {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(ms);
  }

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    L.tap(state);
  });
  controls.skill.addEventListener('click', () => {
    if (L.castSkill(state)) buzz(20);
  });
  controls.boss.addEventListener('click', () => L.challengeBoss(state));
  controls.autoSkill.addEventListener('click', () => L.setAuto(state, 'skill', !state.auto.skill));
  controls.autoBoss.addEventListener('click', () => L.setAuto(state, 'boss', !state.auto.boss));

  /* ── 배너 ── */
  let bannerTimer = 0;
  function showBanner(title: string, body: string): void {
    setText(bannerTitle, title);
    setText(bannerBody, body);
    banner.classList.remove('ih-hidden', 'ih-banner-in');
    void banner.offsetWidth;
    banner.classList.add('ih-banner-in');
    window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => banner.classList.add('ih-hidden'), 2600);
  }

  function handleEvents(events: readonly L.GameEvent[]): void {
    for (const event of events) {
      if (event.kind === 'unlock') showBanner(...UNLOCK_TEXT[event.unlock]);
      else if (event.kind === 'evolve') showBanner('무기 진화!', `${event.weapon} — 공격력 ×2`);
      else if (event.kind === 'bossFail') showBanner('보스를 놓쳤어요', '조금 더 강해져서 다시 도전!');
      else if (event.kind === 'rebirth') showBanner('환생!', `영혼석 +${event.stones}`);
      else if (event.kind === 'stageClear' && event.stage % 10 === 0) {
        showBanner('새 지역!', L.zoneOf(event.stage + 1).name);
      } else if (event.kind === 'kill') {
        top.coin.classList.remove('ih-bump');
        void top.coin.offsetWidth;
        top.coin.classList.add('ih-bump');
      }
    }
  }

  /* ── UI 동기화 ── */
  function syncTop(): void {
    setText(top.gold, formatBig(state.gold));
    setText(top.stage, `${state.stage} 스테이지`);
    const zone = L.zoneOf(state.stage);
    setText(top.zone, `${zone.name} · ${zone.monster}`);
    const bossFight = state.enemy?.boss ?? false;
    top.pipNodes.forEach((pip, i) => toggle(pip, 'on', i < state.kills));
    toggle(top.bossBar, 'ih-hidden', !bossFight);
    if (bossFight) top.bossFill.style.width = `${(state.bossTimer / ENEMY.bossSeconds) * 100}%`;
    toggle(top.stones, 'ih-hidden', state.stones === 0);
    setText(top.stones, `🔮 ${formatBig(state.stones)} · +${formatPercent(REBIRTH.bonusPerStone * state.stones)}`);
  }

  function syncControls(): void {
    const skillOpen = L.isUnlocked(state, 'skill');
    toggle(controls.skill, 'ih-hidden', !skillOpen);
    const ready = state.skillCooldown === 0;
    toggle(controls.skill, 'ready', ready);
    controls.skill.style.setProperty('--cd', String(state.skillCooldown / SKILL.cooldownSeconds));
    setText(controls.skillCd, ready ? '' : String(Math.ceil(state.skillCooldown)));
    toggle(controls.boss, 'ih-hidden', !state.farming || (state.auto.boss && L.isUnlocked(state, 'auto')));
    const autoOpen = L.isUnlocked(state, 'auto');
    toggle(controls.autoSkill, 'ih-hidden', !autoOpen);
    toggle(controls.autoBoss, 'ih-hidden', !autoOpen);
    toggle(controls.autoSkill, 'on', state.auto.skill);
    toggle(controls.autoBoss, 'on', state.auto.boss);
  }

  function syncRow(id: UpgradeId, row: UpgradeRow): void {
    const unlock = UPGRADES[id].unlock;
    const locked = unlock !== undefined && !L.isUnlocked(state, unlock);
    toggle(row.root, 'locked', locked);
    toggle(row.lock, 'ih-hidden', !locked);
    toggle(row.button, 'ih-hidden', locked);
    if (locked && unlock) {
      setText(row.lock, `🔒 ${UNLOCK_STAGE[unlock]}스테이지`);
      setText(row.effect, '아직 만나지 못했어요');
      return;
    }
    const level = state.levels[id];
    const maxed = level >= UPGRADES[id].maxLevel;
    setText(row.level, `Lv.${level}`);
    setText(row.effect, effectText(state, id));
    const plan = L.purchasePlan(state, id, buyAmount === 'max' ? 'max' : buyAmount);
    const shown = plan.count > 0 ? plan : L.purchasePlan(state, id, 1);
    const affordable = plan.count > 0 && plan.cost <= state.gold;
    row.button.disabled = maxed || !affordable;
    setText(row.cost, maxed ? 'MAX' : `${formatBig(shown.cost)}${shown.count > 1 ? ` (+${shown.count})` : ''}`);
    if (id === 'attack') toggle(row.root, 'evolve-soon', HERO.evolveEvery - (level % HERO.evolveEvery) <= 3);
  }

  function syncPanel(): void {
    setText(panel.dps, `초당 피해 ${formatBig(L.expectedDps(state))} · ${WEAPONS[L.weaponTier(state.levels.attack)].name}`);
    for (const [amount, button] of panel.amountButtons) toggle(button, 'on', amount === buyAmount);
    for (const [id, row] of panel.rows) syncRow(id, row);
    const open = L.isUnlocked(state, 'rebirth');
    const stones = L.rebirthStones(state);
    toggle(panel.rebirth.root, 'locked', !open);
    if (!open) setText(panel.rebirth.effect, `${UNLOCK_STAGE.rebirth}스테이지에 도달하면 열려요`);
    else setText(panel.rebirth.effect, stones > 0 ? `지금 환생하면 영혼석 +${stones}` : `${REBIRTH.offsetStage + 2}스테이지를 넘으면 영혼석을 얻어요`);
    panel.rebirth.button.disabled = !open || stones <= 0;
    setText(panel.rebirth.label, open ? '환생' : '🔒');
  }

  /* ── 루프 ── */
  function save(): void {
    writeLocal(L.SAVE_KEY, L.serialize(state));
    writeLocal(SAVED_AT_KEY, String(Date.now()));
  }

  function resize(): void {
    const rect = world.getBoundingClientRect();
    renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    const gold = top.coin.getBoundingClientRect();
    renderer.setCoinTarget(gold.left + gold.width / 2 - rect.left, gold.top + gold.height / 2 - rect.top);
  }

  let last = performance.now();
  let accumulator = 0;
  let sinceSave = 0;
  let sinceUi = 0;
  function frame(now: number): void {
    window.requestAnimationFrame(frame);
    const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - last) / 1000));
    last = now;
    accumulator += dt;
    while (accumulator >= TICK) {
      L.step(state);
      accumulator -= TICK;
    }
    const events = L.drainEvents(state);
    renderer.draw(state, events, dt);
    handleEvents(events);
    syncTop();
    syncControls();
    // 패널은 행이 많아 10fps로만 갱신한다
    sinceUi += dt;
    if (sinceUi >= 0.1 || events.length > 0) {
      sinceUi = 0;
      syncPanel();
    }
    sinceSave += dt;
    if (sinceSave >= AUTOSAVE_SECONDS) {
      sinceSave = 0;
      save();
    }
  }

  new ResizeObserver(resize).observe(world);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
    else {
      grantAway(awaySeconds());
      last = performance.now();
    }
  });
  window.addEventListener('pagehide', save);
  resize();
  grantAway(awaySeconds());
  save();
  window.requestAnimationFrame(frame);
}

const mount = document.getElementById('app');
if (mount) boot(mount);
