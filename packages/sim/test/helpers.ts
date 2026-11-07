import { EMPTY_INPUT, createRun, makeEnemy, makeWorld, starterProfile, step } from '../src/index';
import type { EnemyKind, Profile, TickInput, Vec, World } from '../src/index';

export function input(partial: Partial<TickInput>): TickInput { return { ...EMPTY_INPUT, ...partial, commands: partial.commands ?? [] }; }

/** 시작 방 안에서 적 없이 시작하는 월드. 개별 규칙을 고립해서 확인할 때 쓴다. */
export function emptyWorld(seed = 7, profile: Profile = starterProfile()): World {
  const { state, dungeon } = createRun(profile, seed);
  state.enemies = [];
  return makeWorld(state, dungeon);
}
export function addEnemy(world: World, kind: EnemyKind, offset: Vec, awake = true): number {
  const s = world.state; const id = s.nextId++;
  const enemy = makeEnemy(id, kind, { x: s.player.x + offset.x, z: s.player.z + offset.z }, s.dungeonLevel, null, 0, kind === 'hat');
  if (awake) enemy.mode = 'chase';
  s.enemies.push(enemy);
  return id;
}
export function run(world: World, ticks: number, make: (world: World) => TickInput = () => EMPTY_INPUT): void {
  for (let i = 0; i < ticks; i++) step(world, make(world));
}
export function profileAt(level: number): Profile { return { ...starterProfile(), level }; }

/** 가장 가까운 적을 때리고 기가 차면 회전베기를 쓰는 단순 봇 — 결정성·한 바퀴 시험용 */
export function bot(world: World): TickInput {
  const p = world.state.player;
  let best = null as null | { id: number; d: number; x: number; z: number };
  for (const e of world.state.enemies) {
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (!best || d < best.d) best = { id: e.id, d, x: e.x, z: e.z };
  }
  if (!best) return EMPTY_INPUT;
  if (best.d < 3 && p.spirit >= 25) return input({ cast: { slot: 'rmb', at: { x: best.x, z: best.z } } });
  return input({ attack: best.id });
}
