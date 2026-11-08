import './style.css';
import './ui/ui.css';
import { Hud } from './ui/hud';
import { Inventory } from './ui/inventory';
import { Skills } from './ui/skills';
import { Nameplates } from './ui/nameplates';
import { Screens } from './ui/screens';
import type { UiActions } from './ui/common';
import {
  FixedStepper, createRun, makeWorld, parseProfile, profileFromRun,
  serializeProfile, starterProfile, step,
} from '@yeonmu/sim';
import type { Profile, SimEvent, World } from '@yeonmu/sim';
import { GameScene } from './render/scene';
import { DungeonMesh } from './render/dungeon-mesh';
import { Actors } from './render/actors';
import { Pickups } from './render/pickups';
import { InputController } from './input';
import { PerformanceMeter } from './perf';
import { Effects } from './render/effects';
import { Floaters } from './render/floaters';
import { CombatAudio } from './audio';

const SAVE_KEY = 'yeonmu.save.v1';
const params = new URLSearchParams(location.search);
const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
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
const audio = new CombatAudio(params.has('mute'));
let dungeon: DungeonMesh;
let actors: Actors;
let pickups: Pickups;
let effects: Effects;
let floaters: Floaters;
// Every tick contributes, even when a render frame advances several sim ticks.
// Effects in slice ② can consume this same frame batch after Actors.events().
let eventQueue: SimEvent[] = [];
let frameEvents: SimEvent[] = [];
mountRun();
const input = new InputController(view, () => world, () => actors, () => pickups,
  () => inventory.toggle(), reenter);
const actions: UiActions = {
  command: command => input.command(command), cast: slot => input.cast(slot), pickup: id => input.pickup(id),
  inventory: () => inventory.toggle(), skills: () => skills.toggle(), reenter,
};
const hud = new Hud(actions);
const inventory = new Inventory(actions, text => hud.notify(text));
const skills = new Skills(actions);
const nameplates = new Nameplates((at, y) => view.project(at, y), actions.pickup);
const screens = new Screens(reenter);
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (!event.repeat && event.key.toLowerCase() === 'k') skills.toggle();
  if (event.key === 'Escape') {
    if (!inventory.root.hidden) inventory.toggle();
    if (!skills.root.hidden) skills.toggle();
  }
});

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
  effects = new Effects(); floaters = new Floaters();
  view.scene.add(dungeon.root, actors.root, pickups.root, effects.root); view.snap(world.state.player);
  actors.update(world.state, 1, 0, null); pickups.update(world.state, 0);
}
function reenter(): void {
  screens.leave(world.state);
  profile = profileFromRun(world.state, profile); saveProfile(profile);
  input.clear(); dungeon.dispose(); actors.dispose(); pickups.dispose();
  effects.dispose(); floaters.dispose(); audio.silence();
  world = newRun(); stepper.reset(); eventQueue.length = 0; frameEvents = []; mountRun();
}
function autosave(): void { saveProfile(profileFromRun(world.state, { ...profile, runCount: profile.runCount - 1 })); }

let last = performance.now(); let savedAt = last; let hudAt = 0;
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
  const spare = frameEvents; frameEvents = eventQueue; eventQueue = spare; eventQueue.length = 0;
  actors.events(frameEvents, world.state); effects.events(frameEvents, world.state);
  floaters.events(frameEvents, world.state); audio.events(frameEvents);
  hud.events(frameEvents); screens.events(frameEvents);
  const dt = Math.min(delta / 1000, 0.1);
  actors.update(world.state, alpha, dt, input.aim.enemy);
  effects.update(world.state, dt, now / 1000);
  const position = actors.player.root.position;
  view.follow(position, dt, now / 1000); dungeon.update(position, view.camera, now / 1000);
  if (params.get('shake') !== '0') view.shake(effects.shake, now / 1000);
  pickups.update(world.state, now / 1000); input.updateAim();
  floaters.update(view.camera, dt, effects.hurt, canvas.clientWidth, canvas.clientHeight); view.render();
  if (delta > 0) perf.frame(delta, view.renderer.info.render.calls, view.renderCpuMs);
  if (now - savedAt > 10000) { savedAt = now; autosave(); }
  nameplates.position(world.state);
  if (now - hudAt > 100) {
    hudAt = now;
    hud.update(world.state, now); inventory.update(world.state.player); skills.update(world.state.player);
    nameplates.update(world.state, input.aim.enemy); screens.update(world.state, now);
    if (!perfText.hidden) {
      const sample = perf.snapshot();
      perfText.textContent = `frame p95 ${sample.frameP95.toFixed(1)} ms · sim p95 ${sample.simP95.toFixed(2)} ms\nrender CPU p95 ${sample.renderCpuP95.toFixed(2)} ms · draw ${sample.drawCalls}\nmobs ${world.state.enemies.length} · FX ${effects.active}/64 · numbers ${floaters.active}/40 · bloom ${view.bloom ? 'on' : 'off'}`;
    }
  }
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
  get effects() { return effects.stats; }, get floaters() { return floaters.stats; }, get audio() { return audio.stats; },
  project: (x: number, z: number, y = 0) => view.project({ x, z }, y),
  resetPerf: () => perf.reset(),
} });
