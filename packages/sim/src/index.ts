import { blast, updatePlayer } from './player';
import { updateEnemies, updateProjectiles, updateZones } from './enemies';
import { SpatialHash } from './spatial';
import type { World } from './combat';
import type { Dungeon } from './dungeon';
import type { RunState, TickInput } from './types';

export * from './types';
export * from './data';
export { generateDungeon, findPath, isFloor, canStand, lineOfSight, GRID } from './dungeon';
export type { Dungeon, Room, RoomKind } from './dungeon';
export { computeStats, rollItem, starterProfile, affixText } from './loot';
export { createRun, profileFromRun, makeEnemy } from './spawn';
export type { RunOptions } from './spawn';
export { canCast } from './player';
export { BOSS_WINDUP } from './enemies';
export { serializeProfile, parseProfile } from './save';
export type { World } from './combat';

export function makeWorld(state: RunState, dungeon: Dungeon): World {
  return { state, dungeon, grid: new SpatialHash() };
}

/**
 * 한 틱 진행. 상태를 제자리에서 바꾼다 — 몹 100마리 이상을 매 틱 깊은 복사하지 않기 위해서다.
 * 같은 시드·같은 입력열이면 같은 상태가 나온다(난수는 state.rng만 쓴다).
 */
export function step(world: World, input: TickInput): void {
  const { state } = world;
  state.events = [];
  if (state.status !== 'playing') return;
  if (state.hitstop > 0) { state.hitstop--; return; }
  world.grid.rebuild(state.enemies);
  updatePlayer(world, input);
  resolveDelayed(world);
  updateZones(world);
  world.grid.rebuild(state.enemies);
  updateEnemies(world);
  updateProjectiles(world);
  state.tick++;
}

function resolveDelayed(world: World): void {
  const { state } = world;
  const due = state.delayed.filter(item => item.at <= state.tick);
  state.delayed = state.delayed.filter(item => item.at > state.tick);
  for (const item of due) {
    const center = item.kind === 'echo_spin' ? state.player : item;
    blast(world, center, item.radius, item.damage, item.kind, 8, item.kind === 'split_blast');
  }
}

export class FixedStepper {
  private accumulator = 0;
  /** 비활성 탭 복귀 시 긴 추격 루프를 막는다. 반환값은 보간 비율(0~1). */
  advance(milliseconds: number, onTick: () => void): number {
    this.accumulator += Math.max(0, Math.min(milliseconds, 250));
    while (this.accumulator >= 1000 / 30) { onTick(); this.accumulator -= 1000 / 30; }
    return this.accumulator / (1000 / 30);
  }
  reset(): void { this.accumulator = 0; }
}
