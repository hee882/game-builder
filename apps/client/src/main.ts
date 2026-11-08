import './style.css';
import {
  FixedStepper, affixText, createRun, makeWorld, parseProfile, profileFromRun,
  serializeProfile, starterProfile, step,
} from '@yeonmu/sim';
import type { Profile, SimEvent, World } from '@yeonmu/sim';
import { GameScene } from './render/scene';
import { DungeonMesh } from './render/dungeon-mesh';
import { Actors } from './render/actors';
import { Pickups } from './render/pickups';
import { InputController } from './input';
import { PerformanceMeter } from './perf';

const SAVE_KEY = 'yeonmu.save.v1';
const params = new URLSearchParams(location.search);
const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const hud = document.querySelector<HTMLDivElement>('#hud')!;
const inv = document.querySelector<HTMLDivElement>('#inv')!;
const perfText = document.createElement('div'); perfText.id = 'perf';
perfText.hidden = !params.has('perf'); document.body.append(perfText);

function loadProfile(): Profile {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (!text) return starterProfile();
    const saved = parseProfile(text);
    if (saved) return saved;
    localStorage.setItem(`${SAVE_KEY}.broken`, text);
  } catch { /* Storage denial must not prevent playing. */ }
  return starterProfile();
}
function saveProfile(saved: Profile): void {
  try { localStorage.setItem(SAVE_KEY, serializeProfile(saved)); } catch { /* Optional offline persistence. */ }
}

let profile = loadProfile();
let world: World = newRun();
const view = new GameScene(canvas, params.get('bloom') !== '0');
const stepper = new FixedStepper();
const perf = new PerformanceMeter();
let dungeon: DungeonMesh;
let actors: Actors;
let pickups: Pickups;
// Every tick contributes, even when a render frame advances several sim ticks.
// Effects in slice ② can consume this same frame batch after Actors.events().
const eventQueue: SimEvent[] = [];
let frameEvents: readonly SimEvent[] = [];
mountRun();
const input = new InputController(view, () => world, () => actors, () => pickups,
  () => { inv.hidden = !inv.hidden; renderInventory(); }, reenter);

function newRun(): World {
  const requested = Number(params.get('mobs'));
  const mobs = params.has('mobs') && Number.isFinite(requested) ? Math.max(1, Math.min(400, Math.floor(requested))) : undefined;
  const seedParam = Number(params.get('seed'));
  const seed = params.has('seed') && Number.isFinite(seedParam) ? seedParam | 0 : (Date.now() & 0x7fffffff) ^ profile.runCount;
  const run = createRun(profile, seed, mobs === undefined ? {} : { totalMobs: mobs });
  return makeWorld(run.state, run.dungeon);
}
function mountRun(): void {
  dungeon = new DungeonMesh(world.dungeon); actors = new Actors(world.state); pickups = new Pickups();
  view.scene.add(dungeon.root, actors.root, pickups.root); view.snap(world.state.player);
  actors.update(world.state, 1, 0, null); pickups.update(world.state, 0);
}
function reenter(): void {
  profile = profileFromRun(world.state, profile); saveProfile(profile);
  input.clear(); dungeon.dispose(); actors.dispose(); pickups.dispose();
  world = newRun(); stepper.reset(); eventQueue.length = 0; frameEvents = []; mountRun(); renderInventory();
}
function autosave(): void { saveProfile(profileFromRun(world.state, { ...profile, runCount: profile.runCount - 1 })); }

function renderInventory(): void {
  if (inv.hidden) return;
  inv.replaceChildren();
  const title = document.createElement('b'); title.textContent = '장착'; inv.append(title);
  for (const [slot, item] of Object.entries(world.state.player.equipped)) {
    const row = document.createElement('div'); row.className = item?.rarity ?? ''; row.textContent = `${slot}: ${item?.name ?? '-'}`; inv.append(row);
  }
  const heading = document.createElement('p'); heading.textContent = `가방 ${world.state.player.inventory.length}/30 · 클릭하여 장착`; inv.append(heading);
  for (const item of world.state.player.inventory) {
    const button = document.createElement('button'); button.className = item.rarity;
    button.textContent = `${item.name} [${item.slot}] ${item.slot === 'weapon' ? '피해' : '체력'} ${item.base}`;
    button.title = item.affixes.map(affixText).join('\n') + (item.legendary ? '\n★ 전설 효과' : '');
    button.onclick = () => input.command({ type: 'equip', item: item.id }); inv.append(button);
  }
}

let last = performance.now(); let savedAt = last; let hudAt = 0; let inventoryAt = 0;
let wasHidden = false;
function frame(now: number): void {
  const elapsed = now - last; last = now;
  if (document.hidden) { wasHidden = true; requestAnimationFrame(frame); return; }
  const delta = wasHidden ? 0 : elapsed;
  if (wasHidden) { stepper.reset(); actors.capture(world.state); wasHidden = false; }
  const alpha = stepper.advance(delta, () => {
    actors.capture(world.state);
    const tickInput = input.build(); const start = performance.now();
    step(world, tickInput); perf.tick(performance.now() - start);
    eventQueue.push(...world.state.events);
  });
  frameEvents = eventQueue.splice(0); actors.events(frameEvents);
  const dt = Math.min(delta / 1000, 0.1);
  actors.update(world.state, alpha, dt, input.aim.enemy);
  const position = actors.player.root.position;
  view.follow(position, dt, now / 1000); dungeon.update(position, view.camera, now / 1000);
  pickups.update(world.state, now / 1000); input.updateAim(); view.render();
  if (delta > 0) perf.frame(delta, view.renderer.info.render.calls);
  if (now - savedAt > 10000) { savedAt = now; autosave(); }
  if (now - hudAt > 150) {
    hudAt = now; const { player: p, kills, status } = world.state;
    hud.textContent = `연무  /  Lv ${p.level}   체력 ${Math.ceil(p.hp)} / ${p.stats.maxHp}   기 ${Math.floor(p.spirit)}   처치 ${kills}`
      + (status === 'dead' ? '\n쓰러졌습니다 · R 재진입' : world.state.portal ? '\n푸른 문을 통해 귀환할 수 있습니다' : '');
    if (!perfText.hidden) {
      const sample = perf.snapshot();
      perfText.textContent = `frame p95 ${sample.frameP95.toFixed(1)} ms · sim p95 ${sample.simP95.toFixed(2)} ms\ndraw ${sample.drawCalls} · mobs ${world.state.enemies.length} · bloom ${view.bloom ? 'on' : 'off'}`;
    }
  }
  if (!inv.hidden && now - inventoryAt > 500) { inventoryAt = now; renderInventory(); }
  input.afterFrame(); requestAnimationFrame(frame);
}
window.addEventListener('pagehide', autosave);
document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(); });
requestAnimationFrame(frame);

// Read-only getters preserve the existing browser inspection handle.
// project() enables input tests using the same moving camera as the player sees.
Object.assign(window, { yeonmu: {
  get world() { return world; }, get scale() { return canvas.clientHeight / 17; },
  get events() { return frameEvents; }, get aim() { return input.aim; },
  get perf() { return perf.snapshot(); }, get bloom() { return view.bloom; },
  get renderer() { return view.renderer; }, get camera() { return view.camera; },
  project: (x: number, z: number, y = 0) => view.project({ x, z }, y),
  resetPerf: () => perf.reset(),
} });
