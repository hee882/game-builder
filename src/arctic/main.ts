/**
 * 북극 사냥 식당 — 셸: 루프, 조이스틱, HUD, 저장.
 * 규칙은 world.ts, 그리기는 renderer.ts 가 한다. 여기서는 연결만 한다.
 */
import './arctic.css';
import { TICK, UPGRADES, UPGRADE_ORDER, type UpgradeId } from './content.ts';
import { screenToWorldDir } from './iso.ts';
import { createRenderer } from './renderer.ts';
import * as W from './world.ts';

const MAX_FRAME_SECONDS = 0.25;
const AUTOSAVE_SECONDS = 5;
/** 조이스틱 손잡이가 움직일 수 있는 최대 반경(px) */
const STICK_RADIUS = 56;

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
    /* 저장 실패가 플레이를 막지 않는다 */
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setText(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

function formatMoney(value: number): string {
  const n = Math.floor(value);
  if (n < 10_000) return n.toLocaleString('ko-KR');
  if (n < 100_000_000) return `${(n / 10_000).toFixed(n < 100_000 ? 1 : 0)}만`;
  return `${(n / 100_000_000).toFixed(1)}억`;
}

function upgradeEffect(id: UpgradeId, level: number): string {
  const spec = UPGRADES[id];
  const value = spec.unit === '%' ? `+${Math.round(spec.perLevel * level * 100)}%` : `+${spec.perLevel * level}${spec.unit}`;
  return `현재 ${value}`;
}

interface UpgradeRow {
  level: HTMLElement;
  effect: HTMLElement;
  button: HTMLButtonElement;
}

export function boot(root: HTMLElement): void {
  const state = W.parse(readLocal(W.SAVE_KEY), 20260928);

  const shell = el('div', 'ac');
  const canvas = el('canvas');
  canvas.setAttribute('aria-label', '북극 식당');
  const hud = el('div', 'ac-hud');
  const moneyBox = el('div', 'ac-money');
  const coin = el('i', 'ac-coin');
  const money = el('b');
  moneyBox.append(coin, money);
  const goal = el('div', 'ac-goal');
  hud.append(moneyBox, goal);
  const stickBase = el('div', 'ac-stick ac-hidden');
  const stickKnob = el('i');
  stickBase.append(stickKnob);
  const hint = el('div', 'ac-hint', '화면을 누른 채 끌어서 이동');
  const panel = buildUpgradePanel();
  shell.append(canvas, hud, stickBase, hint, panel.root);
  root.append(shell);

  const renderer = createRenderer(canvas);
  renderer.onMoneyArrive(() => {
    coin.classList.remove('ac-bump');
    void coin.offsetWidth; // 연속으로 들어와도 튀는 애니메이션이 다시 재생되도록
    coin.classList.add('ac-bump');
  });

  function buildUpgradePanel() {
    const rootNode = el('section', 'ac-panel ac-hidden');
    const title = el('h2', undefined, '업그레이드 창고');
    rootNode.append(title);
    const rows = new Map<UpgradeId, UpgradeRow>();
    for (const id of UPGRADE_ORDER) {
      const spec = UPGRADES[id];
      const row = el('div', 'ac-row');
      const icon = el('span', 'ac-icon', spec.icon);
      const info = el('div', 'ac-info');
      const name = el('b', undefined, spec.name);
      const level = el('small');
      name.append(' ', level);
      const effect = el('span');
      info.append(name, effect);
      const button = el('button', 'ac-buy');
      button.type = 'button';
      button.addEventListener('click', () => {
        if (W.buyUpgrade(state, id) && typeof navigator.vibrate === 'function') navigator.vibrate(15);
      });
      row.append(icon, info, button);
      rootNode.append(row);
      rows.set(id, { level, effect, button });
    }
    return { root: rootNode, rows };
  }

  /* ── 조이스틱: 화면 어디든 누르면 그 자리에 생긴다 ── */
  let stickId = -1;
  let originX = 0;
  let originY = 0;
  const keys = new Set<string>();

  function setStick(dx: number, dy: number): void {
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(STICK_RADIUS, len);
    const kx = len > 0 ? (dx / len) * clamped : 0;
    const ky = len > 0 ? (dy / len) * clamped : 0;
    stickKnob.style.transform = `translate(${kx}px, ${ky}px)`;
    if (len < 6) {
      W.setInput(state, 0, 0);
      return;
    }
    const dir = screenToWorldDir(dx, dy);
    const power = Math.min(1, len / (STICK_RADIUS * 0.6));
    W.setInput(state, dir.x * power, dir.y * power);
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (stickId !== -1) return;
    stickId = event.pointerId;
    originX = event.clientX;
    originY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    stickBase.style.left = `${originX}px`;
    stickBase.style.top = `${originY}px`;
    stickBase.classList.remove('ac-hidden');
    hint.classList.add('ac-hidden');
    setStick(0, 0);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId === stickId) setStick(event.clientX - originX, event.clientY - originY);
  });
  const release = (event: PointerEvent): void => {
    if (event.pointerId !== stickId) return;
    stickId = -1;
    stickBase.classList.add('ac-hidden');
    W.setInput(state, 0, 0);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  /* 데스크톱 보조: WASD·화살표 (화면 기준 방향) */
  function applyKeys(): void {
    if (stickId !== -1) return;
    const sx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    const sy = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
    if (sx === 0 && sy === 0) {
      W.setInput(state, 0, 0);
      return;
    }
    const dir = screenToWorldDir(sx, sy);
    W.setInput(state, dir.x, dir.y);
  }
  const KEYMAP: Record<string, string> = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };
  window.addEventListener('keydown', (event) => {
    const key = KEYMAP[event.code];
    if (!key) return;
    keys.add(key);
    hint.classList.add('ac-hidden');
    applyKeys();
  });
  window.addEventListener('keyup', (event) => {
    const key = KEYMAP[event.code];
    if (!key) return;
    keys.delete(key);
    applyKeys();
  });

  /* ── HUD 동기화 ── */
  function syncHud(): void {
    setText(money, formatMoney(state.money));
    const objective = W.objective(state);
    setText(goal, objective.text);
    renderer.setGuide(objective.target);
    const open = W.atOffice(state);
    panel.root.classList.toggle('ac-hidden', !open);
    if (!open) return;
    for (const [id, row] of panel.rows) {
      const level = state.upgrades[id];
      const maxed = level >= UPGRADES[id].maxLevel;
      const cost = W.upgradeCost(id, level);
      setText(row.level, `Lv.${level}`);
      setText(row.effect, upgradeEffect(id, level));
      setText(row.button, maxed ? 'MAX' : `💰 ${formatMoney(cost)}`);
      row.button.disabled = maxed || state.money < cost;
    }
  }

  function resize(): void {
    const rect = shell.getBoundingClientRect();
    renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    const c = coin.getBoundingClientRect();
    renderer.setMoneyTarget(c.left + c.width / 2 - rect.left, c.top + c.height / 2 - rect.top);
  }

  function save(): void {
    writeLocal(W.SAVE_KEY, W.serialize(state));
  }

  let last = performance.now();
  let accumulator = 0;
  let sinceSave = 0;
  function frame(now: number): void {
    window.requestAnimationFrame(frame);
    const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - last) / 1000));
    last = now;
    accumulator += dt;
    while (accumulator >= TICK) {
      W.step(state);
      accumulator -= TICK;
    }
    renderer.draw(state, W.drainEvents(state), dt);
    syncHud();
    sinceSave += dt;
    if (sinceSave >= AUTOSAVE_SECONDS) {
      sinceSave = 0;
      save();
    }
  }

  new ResizeObserver(resize).observe(shell);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
    last = performance.now();
  });
  window.addEventListener('pagehide', save);
  resize();
  window.requestAnimationFrame(frame);
}

const mount = document.getElementById('app');
if (mount) boot(mount);
