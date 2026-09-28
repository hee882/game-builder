/**
 * 심해 전초기지 — 셸 진입점.
 *
 * 소유 범위: 부트스트랩, 고정 루프, 포인터 입력, 오디오, 저장, 디버그 창구.
 * 규칙
 *  - 이벤트는 프레임당 정확히 1회만 drain 해서 renderer와 hud에 같은 배열을 넘긴다.
 *  - dt를 반드시 상한으로 자른다(탭 복귀 폭주 방지). 시뮬은 고정 스텝이다.
 *  - 리스너는 AbortController 하나로 묶어 중복 등록·누수를 막는다.
 *  - 시뮬레이션·경제 계산을 여기서 하지 않는다. 명령은 전부 sim.issue()를 지난다.
 */
import './outpost.css';
import { createRenderer } from './renderer.ts';
import { createSim } from './sim.ts';
import { ECONOMY } from './content.ts';
import { SAVE_KEY_RUN } from './contract.ts';
import type {
  AbilityId,
  BuildingId,
  OutpostRenderer,
  OutpostSettings,
  OutpostSim,
  SimCommand,
  SimEvent,
  SimView,
  TileIndex,
  Vec2,
  ViewportInsets,
} from './contract.ts';
import { SHELL_EVENT, createHud } from './hud.ts';
import type { ShellDetail, ShellHud, ShellMode } from './hud.ts';

const SETTINGS_KEY = 'outpost-settings-v1';
const SAVED_AT_KEY = 'outpost-saved-at-v1';
/** 한 프레임에 시뮬에 넘길 수 있는 실시간 상한. 이보다 길면 잘라낸다. */
const MAX_FRAME_SECONDS = 0.25;
/** 탭 판정 이동 한계(CSS px). 넘으면 잠수정 이동으로 넘긴다. */
const DRAG_THRESHOLD = 10;
const AUTOSAVE_SECONDS = 5;

const DEFAULT_SETTINGS: OutpostSettings = {
  sound: false,
  haptics: true,
  reducedMotion: false,
  fps: 60,
  volume: 0.6,
};

/* ───────────────── 저장 (문자열 보관만. 스키마 해석은 sim 몫) ───────────────── */

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
    /* 사파리 프라이빗 모드 등 — 저장 실패는 플레이를 막지 않는다 */
  }
}

function removeLocal(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* 무시 */
  }
}

function loadSettings(): OutpostSettings {
  const raw = readLocal(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SETTINGS;
    const record = parsed as Record<string, unknown>;
    return {
      sound: typeof record.sound === 'boolean' ? record.sound : DEFAULT_SETTINGS.sound,
      haptics: typeof record.haptics === 'boolean' ? record.haptics : DEFAULT_SETTINGS.haptics,
      reducedMotion:
        typeof record.reducedMotion === 'boolean' ? record.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
      fps: record.fps === 30 ? 30 : 60,
      volume: typeof record.volume === 'number' && record.volume >= 0 && record.volume <= 1 ? record.volume : 0.6,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** 저장 시각은 별도 키. 미래·음수·비정상 값은 오프라인 0으로 본다. */
function readOfflineSeconds(capSeconds: number): number {
  const raw = readLocal(SAVED_AT_KEY);
  if (!raw) return 0;
  const savedAt = Number(raw);
  if (!Number.isFinite(savedAt) || savedAt <= 0) return 0;
  const elapsed = (Date.now() - savedAt) / 1000;
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  return Math.min(elapsed, capSeconds);
}

/* ───────────────── 오디오 (합성. 외부 자산 없음) ───────────────── */

interface Audio {
  play(events: readonly SimEvent[]): void;
  setSettings(settings: OutpostSettings): void;
  resume(): void;
  close(): void;
}

function createAudio(initial: OutpostSettings): Audio {
  let ctx: AudioContext | null = null;
  let settings = initial;

  const ensure = (): AudioContext | null => {
    if (!settings.sound) return null;
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  };

  const tone = (freq: number, duration: number, type: OscillatorType, gain: number): void => {
    const audio = ensure();
    if (!audio) return;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audio.currentTime);
    amp.gain.setValueAtTime(0.0001, audio.currentTime);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * settings.volume), audio.currentTime + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
    osc.connect(amp).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + duration + 0.02);
  };

  return {
    play(events) {
      if (!settings.sound) return;
      for (const event of events) {
        switch (event.kind) {
          case 'built':
            tone(520, 0.09, 'square', 0.05);
            break;
          case 'destroyed':
            tone(120, 0.22, 'sawtooth', 0.07);
            break;
          case 'enemyKilled':
            tone(680, 0.06, 'triangle', 0.03);
            break;
          case 'coreHit':
            tone(90, 0.3, 'sawtooth', 0.09);
            break;
          case 'abilityCast':
            tone(event.perfect ? 980 : 620, event.perfect ? 0.18 : 0.12, 'square', 0.06);
            if (event.perfect) tone(1470, 0.14, 'triangle', 0.04);
            break;
          case 'waveStart':
            tone(150, 0.5, 'sawtooth', 0.07);
            break;
          case 'waveClear':
            tone(523, 0.14, 'triangle', 0.05);
            tone(784, 0.2, 'triangle', 0.04);
            break;
          case 'discovered':
          case 'unlocked':
            tone(660, 0.12, 'triangle', 0.05);
            tone(990, 0.22, 'triangle', 0.04);
            break;
          case 'salvageExhausted':
            tone(160, 0.35, 'sine', 0.06);
            break;
          case 'salvageRefilled':
            tone(440, 0.16, 'sine', 0.04);
            break;
          default:
            break;
        }
      }
    },
    setSettings(next) {
      settings = next;
      if (!next.sound && ctx) void ctx.suspend();
    },
    resume() {
      ensure();
    },
    close() {
      if (ctx) void ctx.close();
      ctx = null;
    },
  };
}

/* ───────────────── 디버그 창구 ───────────────── */

export interface OutpostDebug {
  /** 현재 뷰. 읽기 전용으로 다룬다(시뮬이 재사용하는 객체다) */
  view(): SimView;
  /** 실제 명령 경로. HUD 버튼과 같은 곳으로 들어간다 */
  dispatch(command: SimCommand): ReturnType<OutpostSim['issue']>;
  preview(tile: TileIndex, building: BuildingId): ReturnType<OutpostSim['preview']>;
  settings(): OutpostSettings;
  /** 강제 저장. 브라우저 수락 시 새로고침 복원 확인용 */
  save(): void;
  restart(): void;
  ready: true;
}

declare global {
  interface Window {
    __outpost?: OutpostDebug;
  }
}

/* ───────────────── 부트스트랩 ───────────────── */

let booted = false;

export function boot(root: HTMLElement): () => void {
  if (booted) throw new Error('outpost: 이미 부트되었습니다');
  booted = true;

  const abort = new AbortController();
  const { signal } = abort;
  let settings = loadSettings();

  const hud: ShellHud = createHud(root, (command) => sim.issue(command));
  const found = root.querySelector<HTMLCanvasElement>('canvas[data-op="canvas"]');
  if (!found) throw new Error('outpost: 캔버스를 찾지 못했습니다');
  const canvas: HTMLCanvasElement = found;
  const renderer: OutpostRenderer = createRenderer(canvas);

  let sim: OutpostSim = createSim({
    seed: 20260913,
    save: readLocal(SAVE_KEY_RUN),
    offlineSeconds: readOfflineSeconds(ECONOMY.offlineCapSeconds),
  });

  const audio = createAudio(settings);
  hud.setSettings(settings);
  applySettings(settings);

  /* ── 셸 상태 ── */
  let mode: ShellMode = 'select';
  let selectedBuilding: BuildingId | null = null;
  let aiming: AbilityId | null = null;
  let ghostTile: TileIndex | null = null;

  function applySettings(next: OutpostSettings): void {
    renderer.setReducedMotion(next.reducedMotion);
    renderer.setFrameSkip(next.fps === 30);
    root.classList.toggle('op-reduced', next.reducedMotion);
  }

  function setMode(next: ShellMode, ability?: AbilityId | null): void {
    mode = next;
    aiming = next === 'aim' ? (ability ?? null) : null;
    if (next !== 'build') {
      selectedBuilding = null;
      hud.setBuildSelection(null);
      clearGhost();
    }
    hud.setMode(next, aiming);
  }

  function clearGhost(): void {
    ghostTile = null;
    hud.setGhost(null);
    renderer.setGhost(null);
  }

  function refreshGhost(): void {
    if (ghostTile === null || selectedBuilding === null) return;
    const preview = sim.preview(ghostTile, selectedBuilding);
    const info = { tile: ghostTile, building: selectedBuilding, preview };
    hud.setGhost(info);
    renderer.setGhost(info);
  }

  function confirmBuild(): void {
    if (ghostTile === null || selectedBuilding === null) return;
    const result = sim.issue({ kind: 'build', tile: ghostTile, building: selectedBuilding });
    if (!result.ok) {
      hud.toast(result.reason);
      return;
    }
    buzz(12);
    clearGhost();
  }

  function buzz(ms: number): void {
    if (!settings.haptics) return;
    if (typeof navigator.vibrate === 'function') navigator.vibrate(ms);
  }

  /* ── HUD → 셸 ── */
  root.addEventListener(
    SHELL_EVENT,
    (event) => {
      const detail = (event as CustomEvent<ShellDetail>).detail;
      if (detail.kind === 'selectBuilding') {
        const next = selectedBuilding === detail.building ? null : detail.building;
        clearGhost();
        selectedBuilding = next;
        if (next === null) {
          setMode('select');
        } else {
          mode = 'build';
          aiming = null;
          hud.setMode('build', null);
          hud.setBuildSelection(next);
        }
      } else if (detail.kind === 'mode') {
        setMode(detail.mode, detail.ability ?? null);
      } else if (detail.kind === 'confirmBuild') {
        confirmBuild();
      } else if (detail.kind === 'cancelBuild') {
        clearGhost();
      } else if (detail.kind === 'settings') {
        settings = detail.settings;
        writeLocal(SETTINGS_KEY, JSON.stringify(settings));
        applySettings(settings);
        audio.setSettings(settings);
        if (settings.sound) audio.resume();
      } else if (detail.kind === 'restart') {
        restart();
      }
    },
    { signal },
  );

  /* ── 포인터 입력 ── */
  let pointerId = -1;
  let startX = 0;
  let startY = 0;
  let dragged = false;
  let pendingMove: Vec2 | null = null;

  function localPoint(event: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (pointerId !== -1) return;
      pointerId = event.pointerId;
      dragged = false;
      startX = event.clientX;
      startY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      if (settings.sound) audio.resume();
    },
    { signal },
  );

  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerId !== pointerId) return;
      const far = Math.hypot(event.clientX - startX, event.clientY - startY) > DRAG_THRESHOLD;
      if (!far) return;
      dragged = true;
      const local = localPoint(event);
      pendingMove = renderer.pickPoint(local.x, local.y);
    },
    { signal },
  );

  canvas.addEventListener(
    'pointerup',
    (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = -1;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      const local = localPoint(event);
      if (dragged) return;
      handleTap(local.x, local.y);
    },
    { signal },
  );

  canvas.addEventListener(
    'pointercancel',
    (event) => {
      if (event.pointerId === pointerId) pointerId = -1;
    },
    { signal },
  );

  function handleTap(x: number, y: number): void {
    if (mode === 'aim' && aiming) {
      const result = sim.issue({ kind: 'ability', ability: aiming, at: renderer.pickPoint(x, y) });
      if (!result.ok) hud.toast(result.reason);
      else buzz(10);
      setMode('select');
      return;
    }
    if (mode === 'move') {
      sim.issue({ kind: 'moveSub', to: renderer.pickPoint(x, y) });
      return;
    }
    const tile = renderer.pickTile(x, y);
    if (tile < 0) return;
    if (mode === 'build' && selectedBuilding) {
      ghostTile = tile;
      refreshGhost();
      buzz(8);
      return;
    }
    hud.setSelected(tile);
  }

  /* 데스크톱 보조 조작 — 같은 명령 경로를 쓴다 */
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        clearGhost();
        setMode('select');
        hud.setSelected(null);
      } else if (event.key === '1' || event.key === '2') {
        const ability: AbilityId = event.key === '1' ? 'sonarPulse' : 'weld';
        setMode('aim', ability);
      } else if (event.key === 'Enter' && ghostTile !== null) {
        confirmBuild();
      }
    },
    { signal },
  );

  /* ── 리사이즈 ── */
  /**
   * 월드 영역(.op-world)은 이미 상단 바·하단 독·safe-area를 제외한 grid 칸이다.
   * 그래서 인셋은 0이다 — HUD가 캔버스를 덮는 구조가 아니다. 고스트 콜아웃만 일시적으로 떠 있다.
   * 캔버스가 아니라 월드 영역을 잰다: 렌더러가 캔버스에 px 크기를 고정하므로, 캔버스를 재면
   * 예고 행·독이 자라 월드가 줄어도 캔버스가 줄지 않고 아래 행과 코어가 잘린다.
   */
  const NO_INSETS: ViewportInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  const worldBox: HTMLElement = canvas.parentElement ?? canvas;

  function resize(): void {
    const rect = worldBox.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.resize(rect.width, rect.height, dpr, NO_INSETS);
  }
  window.addEventListener('resize', resize, { signal });
  window.addEventListener('orientationchange', resize, { signal });
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  if (observer) observer.observe(worldBox);
  resize();

  /* ── 저장 ── */
  function save(): void {
    writeLocal(SAVE_KEY_RUN, sim.serialize());
    writeLocal(SAVED_AT_KEY, String(Date.now()));
  }

  function restart(): void {
    removeLocal(SAVE_KEY_RUN);
    removeLocal(SAVED_AT_KEY);
    sim = createSim({ seed: Date.now() % 2147483647, save: null, offlineSeconds: 0 });
    clearGhost();
    setMode('select');
    hud.setSelected(null);
  }

  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') save();
    },
    { signal },
  );
  window.addEventListener('pagehide', save, { signal });

  /* ── 루프 ── */
  let last = performance.now();
  let frame = 0;
  let sinceSave = 0;
  let rafId = 0;
  let running = true;

  function tick(now: number): void {
    rafId = window.requestAnimationFrame(tick);
    if (!running) return;
    const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - last) / 1000));
    last = now;

    if (pendingMove) {
      sim.issue({ kind: 'moveSub', to: pendingMove });
      pendingMove = null;
    }
    sim.advance(dt);
    const events = sim.drainEvents(); // 프레임당 정확히 1회
    const view = sim.view();

    frame += 1;
    const skip = settings.fps === 30 && frame % 2 === 1;
    if (!skip) renderer.draw(view, events, sim.alpha);
    hud.sync(view, events);
    audio.play(events);
    if (ghostTile !== null) refreshGhost();

    sinceSave += dt;
    if (sinceSave >= AUTOSAVE_SECONDS) {
      sinceSave = 0;
      save();
    }
  }
  rafId = window.requestAnimationFrame(tick);

  window.__outpost = {
    view: () => sim.view(),
    dispatch: (command) => sim.issue(command),
    preview: (tile, building) => sim.preview(tile, building),
    settings: () => settings,
    save,
    restart,
    ready: true,
  };

  return function destroy(): void {
    running = false;
    window.cancelAnimationFrame(rafId);
    abort.abort();
    if (observer) observer.disconnect();
    audio.close();
    renderer.destroy();
    hud.destroy();
    delete window.__outpost;
    booted = false;
  };
}

const mount = document.getElementById('app');
if (mount) boot(mount);
