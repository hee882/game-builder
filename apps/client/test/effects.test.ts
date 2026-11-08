import { describe, expect, it } from 'vitest';
import { createRun, starterProfile, makeEnemy, TELEGRAPH_RADIUS } from '@yeonmu/sim';
import type { SimEvent } from '@yeonmu/sim';
import { DEATH_BUDGET, EFFECT_LIMIT, Effects } from '../src/render/effects';
import { InstancedMesh } from 'three';

describe('bounded render effects (no simulation writes)', () => {
  it('reuses the oldest slot at saturation and expires all transient effects', () => {
    const { state } = createRun(starterProfile(), 1); const fx = new Effects();
    const before = JSON.stringify(state);
    const drops: SimEvent[] = Array.from({ length: 100 }, (_, i) => ({ type: 'drop', item: i, rarity: 'legendary', x: i, z: 0 }));
    fx.events(drops, state); fx.update(state, .1, 0);
    expect(fx.stats.active).toBe(EFFECT_LIMIT); expect(fx.stats.reused).toBe(36);
    const mesh = fx.root.children[0] as InstancedMesh;
    // The earliest 36 positions have been evicted, all remaining slots are rendered.
    const positions = Array.from({ length: mesh.count / 7 }, (_, i) => mesh.instanceMatrix.array[i * 7 * 16 + 12]!);
    expect(Math.min(...positions)).toBe(36); expect(Math.max(...positions)).toBe(99);
    fx.update(state, 1, 1); expect(fx.stats.active).toBe(0);
    expect(JSON.stringify(state)).toBe(before); fx.dispose();
  });
  it('caps simultaneous death smoke and clears state effects immediately on expiry', () => {
    const { state } = createRun(starterProfile(), 1); const fx = new Effects();
    fx.events(Array.from({ length: 100 }, (_, i) => ({ type: 'kill', enemy: i, kind: 'reed', elite: false, boss: false, x: 0, z: 0 })), state);
    expect(fx.active).toBe(DEATH_BUDGET);
    fx.update(state, 1, 1);
    state.player.wardUntil = state.tick + 150;
    state.fires.push({ id: 500, x: 1, z: 1, radius: 1.2, until: 90, nextPulse: 10, damage: 10 });
    fx.update(state, .1, 2); expect(fx.active).toBe(2);
    state.fires.length = 0; state.tick += 150;
    fx.update(state, .1, 2.1); expect(fx.active).toBe(0); fx.dispose();
  });
  it('holds telegraph timing through hitstop and removes it when the boss dies', () => {
    const { state } = createRun(starterProfile(), 1); const fx = new Effects();
    const boss = makeEnemy(777, 'hat', state.player, 1, null, 0, true);
    boss.mode = 'windup'; boss.attack = 'sweep'; boss.modeUntil = state.tick + 12; state.enemies = [boss];
    fx.update(state, .1, 1); const mesh = fx.root.children[0] as InstancedMesh;
    const attr = mesh.geometry.getAttribute('fx');
    expect(mesh.count).toBe(2); expect(mesh.instanceMatrix.array[0]).toBe(TELEGRAPH_RADIUS.sweep);
    const progress = attr.getZ(0); fx.update(state, .5, 1.5);
    expect(attr.getZ(0)).toBe(progress);
    state.tick += 6; fx.update(state, .1, 1.6); expect(attr.getZ(0)).toBeGreaterThan(progress);
    state.enemies.length = 0; fx.update(state, .1, 1.7); expect(fx.active).toBe(0); fx.dispose();
  });
});
