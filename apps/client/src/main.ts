// 임시 2D 디버그 화면 — sim 규칙을 눈으로 확인하기 위한 것. 정식 three.js 화면으로 교체 예정.
import './style.css';
import {
  EMPTY_INPUT, FixedStepper, SKILLS, affixText, createRun, makeWorld, parseProfile, profileFromRun,
  serializeProfile, starterProfile, step, xpToNext,
} from '@yeonmu/sim';
import type { Command, HotSlot, Profile, TickInput, Vec, World } from '@yeonmu/sim';

const SAVE_KEY = 'yeonmu.save.v1';
const SCALE = 22;
const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const ctx = canvas.getContext('2d')!;
const hud = document.querySelector<HTMLDivElement>('#hud')!;
const inv = document.querySelector<HTMLDivElement>('#inv')!;

function loadProfile(): Profile {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (!text) return starterProfile();
    const profile = parseProfile(text);
    if (profile) return profile;
    localStorage.setItem(`${SAVE_KEY}.broken`, text); // 손상 원본은 지우지 않고 남긴다.
  } catch { /* 저장소 차단 환경에서도 플레이는 되게 한다 */ }
  return starterProfile();
}
function saveProfile(profile: Profile): void {
  try { localStorage.setItem(SAVE_KEY, serializeProfile(profile)); } catch { /* 무시 */ }
}

let profile = loadProfile();
let world: World = newRun();
const stepper = new FixedStepper();
const mouse = { x: 0, y: 0, left: false };
const keys = new Set<string>();
let pending: Command[] = [];
let castQueue: TickInput['cast'] = null;

function newRun(): World {
  const extra = Number(new URLSearchParams(location.search).get('mobs') ?? 0);
  const { state, dungeon } = createRun(profile, (Date.now() & 0x7fffffff) ^ profile.runCount, { extraMobs: extra });
  return makeWorld(state, dungeon);
}
function toWorld(sx: number, sy: number): Vec {
  const p = world.state.player;
  return { x: p.x + (sx - canvas.width / 2) / SCALE, z: p.z + (sy - canvas.height / 2) / SCALE };
}
function nearest<T extends Vec>(list: readonly T[], at: Vec, range: number): T | null {
  let best: T | null = null; let bestD = range;
  for (const item of list) { const d = Math.hypot(item.x - at.x, item.z - at.z); if (d < bestD) { best = item; bestD = d; } }
  return best;
}

function buildInput(): TickInput {
  const at = toWorld(mouse.x, mouse.y);
  const input: TickInput = { ...EMPTY_INPUT, commands: pending, cast: castQueue, standStill: keys.has('Shift') };
  pending = []; castQueue = null;
  if (mouse.left) {
    const enemy = nearest(world.state.enemies, at, 1);
    const item = nearest(world.state.items, at, 0.8);
    if (enemy) input.attack = enemy.id; else if (item) input.pickup = item.id; else input.moveTo = at;
  }
  const slots: [string, HotSlot][] = [['1', 's1'], ['2', 's2'], ['3', 's3'], ['4', 's4']];
  for (const [key, slot] of slots) if (keys.has(key)) input.cast = { slot, at };
  return input;
}

canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('mousedown', e => {
  if (e.button === 0) mouse.left = true;
  if (e.button === 2) castQueue = { slot: 'rmb', at: toWorld(e.clientX, e.clientY) };
  if (world.state.portal && e.button === 0 && Math.hypot(toWorld(e.clientX, e.clientY).x - world.state.portal.x, toWorld(e.clientX, e.clientY).z - world.state.portal.z) < 1.5) reenter();
});
window.addEventListener('mouseup', e => { if (e.button === 0) mouse.left = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', e => {
  keys.add(e.key);
  if (e.key === 'i' || e.key === 'I') { inv.hidden = !inv.hidden; renderInventory(); }
  if (e.key === 'r' && world.state.status === 'dead') reenter();
});
window.addEventListener('keyup', e => keys.delete(e.key));
window.addEventListener('blur', () => { keys.clear(); mouse.left = false; });

function reenter(): void {
  profile = profileFromRun(world.state, profile); saveProfile(profile);
  world = newRun(); stepper.reset();
}

function renderInventory(): void {
  if (inv.hidden) return;
  const p = world.state.player;
  inv.innerHTML = '<b>착용</b>' + Object.entries(p.equipped).map(([slot, item]) => `<div class="${item?.rarity ?? ''}">${slot}: ${item ? item.name : '-'}</div>`).join('')
    + `<br><b>가방 ${p.inventory.length}/30</b> (클릭 = 장착)`;
  for (const item of p.inventory) {
    const button = document.createElement('button');
    button.className = item.rarity;
    button.textContent = `${item.name} [${item.slot}] ${item.slot === 'weapon' ? `피해 ${item.base}` : `체력 ${item.base}`}`;
    button.title = item.affixes.map(affixText).join('\n') + (item.legendary ? '\n★ 전설 효과' : '');
    button.onclick = () => { pending.push({ type: 'equip', item: item.id }); setTimeout(renderInventory, 60); };
    inv.append(button);
  }
}

const RARITY_COLOR = { common: '#e6e6e6', magic: '#7fa8ff', rare: '#ffe066', legendary: '#ff9a3c' };
function draw(): void {
  canvas.width = innerWidth; canvas.height = innerHeight;
  const { state, dungeon } = world; const p = state.player;
  const sx = (x: number): number => (x - p.x) * SCALE + canvas.width / 2;
  const sy = (z: number): number => (z - p.z) * SCALE + canvas.height / 2;
  ctx.fillStyle = '#0b1113'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#2a3639';
  for (let z = 0; z < dungeon.height; z++) for (let x = 0; x < dungeon.width; x++) if (dungeon.floor[z * dungeon.width + x]) ctx.fillRect(sx(x), sy(z), SCALE + 0.5, SCALE + 0.5);
  for (const fire of state.fires) circle(sx(fire.x), sy(fire.z), fire.radius * SCALE, '#ff6a2a55');
  for (const e of state.enemies) if (e.mode === 'windup' && (e.attack === 'sweep' || e.attack === 'slam'))
    circle(sx(e.attackTarget.x), sy(e.attackTarget.z), (e.attack === 'sweep' ? 5 : 2.5) * SCALE, '#ff404044');
  for (const g of state.globes) circle(sx(g.x), sy(g.z), 5, '#e0303a');
  for (const g of state.items) { ctx.fillStyle = RARITY_COLOR[g.item.rarity]; ctx.fillRect(sx(g.x) - 4, sy(g.z) - 4, 8, 8); }
  for (const e of state.enemies) {
    const color = e.flashUntil > state.tick ? '#fff' : e.boss ? '#c0503a' : e.elite ? '#c9a2ff' : { reed: '#8a9a5b', shield: '#6f8790', porter: '#9a7aa0', hat: '#c0503a' }[e.kind];
    circle(sx(e.x), sy(e.z), e.radius * SCALE, e.mode === 'sleep' ? '#555' : color);
    if (e.boss || e.elite) { ctx.fillStyle = '#fff'; ctx.fillText(`${e.elite ?? '보스'} ${e.hp}/${e.maxHp}`, sx(e.x) - 20, sy(e.z) - e.radius * SCALE - 4); }
  }
  for (const shot of state.projectiles) circle(sx(shot.x), sy(shot.z), 3, '#d4b26a');
  if (state.portal) circle(sx(state.portal.x), sy(state.portal.z), 1.2 * SCALE, '#5fd4ff88');
  circle(sx(p.x), sy(p.z), 0.4 * SCALE, p.wardUntil > state.tick ? '#ffd76a' : '#e6e0c9');
  const slots = (['rmb', 's1', 's2', 's3', 's4'] as const).map(slot => {
    const id = p.slots[slot]; if (!id) return `${slot}:-`;
    const cd = Math.max(0, p.cooldowns[id] - state.tick);
    return `${slot}:${SKILLS[id].name}${cd ? `(${(cd / 30).toFixed(1)})` : ''}`;
  }).join('  ');
  hud.textContent = `Lv ${p.level}  경험치 ${Math.round(p.xp)}/${xpToNext(p.level)}  체력 ${p.hp}/${p.stats.maxHp}  기 ${Math.round(p.spirit)}\n${slots}\n처치 ${state.kills}  남은 적 ${state.enemies.length}  던전 Lv ${state.dungeonLevel}`
    + `\n좌클릭 이동·공격·줍기 / 우클릭·1~4 스킬 / Shift 제자리 / I 가방`
    + (state.portal ? '\n보스 처치! 파란 문 클릭 = 재진입' : '') + (state.status === 'dead' ? '\n쓰러짐 — R 키로 재진입(장비·레벨 유지)' : '');
}
function circle(x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

let last = performance.now();
let autosave = 0;
function frame(now: number): void {
  stepper.advance(now - last, () => step(world, buildInput()));
  last = now;
  // 판 도중 종료해도 성장분이 남게 10초마다 저장한다(재진입 횟수는 올리지 않음).
  if (now - autosave > 10000) { autosave = now; saveProfile(profileFromRun(world.state, { ...profile, runCount: profile.runCount - 1 })); }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 자동 점검(브라우저 스모크)이 상태를 읽을 수 있게 노출한다. 쓰기 용도로 쓰지 않는다.
(window as unknown as { yeonmu: { readonly world: World; readonly scale: number } }).yeonmu = { get world() { return world; }, scale: SCALE };
