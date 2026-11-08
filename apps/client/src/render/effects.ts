import * as THREE from 'three';
import { BOSS_WINDUP, SKILLS, TELEGRAPH_RADIUS } from '@yeonmu/sim';
import type { RunState, SimEvent } from '@yeonmu/sim';
import { EffectBatch } from './effect-batch';

type Kind = 'slash' | 'cleave' | 'spin' | 'echo' | 'fall' | 'blast' | 'dash' | 'smoke'
  | 'block' | 'drop' | 'spark' | 'pillar' | 'boss' | 'ward' | 'fire' | 'shot' | 'danger';
interface Effect {
  kind: Kind; active: boolean; key: number; serial: number; seen: boolean;
  x: number; z: number; angle: number; radius: number; age: number; life: number; color: number; progress: number;
}
const COLORS = { common: 0xdce7e8, magic: 0x608fff, rare: 0xffd35c, legendary: 0xff7c24 };
export const EFFECT_LIMIT = 64;
export const DEATH_BUDGET = 8;

/** Transients and state-backed effects share the same 64 slots, oldest is reused. */
export class Effects {
  readonly root = new THREE.Group();
  private batch = new EffectBatch();
  private pool: Effect[] = Array.from({ length: EFFECT_LIMIT }, () => ({
    kind: 'spark', active: false, key: 0, serial: 0, seen: false,
    x: 0, z: 0, angle: 0, radius: 1, age: 0, life: 1, color: 0xffffff, progress: 0,
  }));
  private serial = 0;
  private peak = 0;
  private reused = 0;
  shake = 0;
  hurt = 0;
  constructor() { this.root.add(this.batch.mesh); }

  private spawn(kind: Kind, x: number, z: number, radius: number, life: number, color: number, angle = 0, key = 0): Effect {
    let slot = this.pool[0]!;
    for (const effect of this.pool) {
      if (!effect.active) { slot = effect; break; }
      if (effect.serial < slot.serial) slot = effect;
    }
    if (slot.active) this.reused++;
    slot.kind = kind; slot.active = true; slot.key = key; slot.serial = ++this.serial; slot.seen = true;
    slot.x = x; slot.z = z; slot.radius = radius; slot.life = life; slot.color = color;
    slot.angle = angle; slot.age = 0; slot.progress = 0;
    return slot;
  }
  events(events: readonly SimEvent[], state: RunState): void {
    let deaths = 0; let blocks = 0; const p = state.player;
    for (const e of events) {
      if (e.type === 'cast') {
        const angle = Math.atan2(e.tx - e.x, e.tz - e.z);
        if (e.skill === 'slash' || e.skill === 'cleave') {
          this.spawn(e.skill, e.x, e.z, SKILLS[e.skill].range, e.skill === 'cleave' ? .5 : .28, e.skill === 'cleave' ? 0xffdc91 : 0xb7f4ff, angle);
          if (e.skill === 'cleave') this.shake = Math.max(this.shake, .055);
        }
        if (e.skill === 'talisman') this.spawn('fall', e.tx, e.tz, 1, .24, 0xffb73d, angle);
      } else if (e.type === 'blast') {
        const spin = e.source === 'spin' || e.source === 'echo_spin';
        this.spawn(spin ? e.source === 'spin' ? 'spin' : 'echo' : 'blast', e.x, e.z, e.radius,
          spin ? .48 : .65, spin ? e.source === 'spin' ? 0x9eeeff : 0xc7afff : 0xff852a);
        if (e.source === 'talisman') this.shake = Math.max(this.shake, .075);
      } else if (e.type === 'kill' && deaths++ < DEATH_BUDGET) this.spawn('smoke', e.x, e.z, e.boss ? 2 : .7, .8, 0x859ca9);
      else if (e.type === 'blocked' && blocks++ < 6) this.spawn('block', e.x, e.z, .7, .3, 0xa9d6ff);
      else if (e.type === 'drop') this.spawn('drop', e.x, e.z, e.rarity === 'legendary' ? 1.5 : .7, .8, COLORS[e.rarity]);
      else if (e.type === 'pickup' || e.type === 'globe') this.spawn('spark', p.x, p.z, 1, .5, e.type === 'globe' ? 0xff6d88 : COLORS[e.rarity]);
      else if (e.type === 'level_up') this.spawn('pillar', p.x, p.z, 2, 1.4, 0xffda67);
      else if (e.type === 'boss_dead') { this.spawn('boss', e.x, e.z, 5, 1.6, 0xffd29a); this.shake = .1; }
      else if (e.type === 'player_hit') this.hurt = .45;
    }
    this.measure();
  }

  private persistent(kind: Kind, key: number, x: number, z: number, radius: number, color: number): Effect {
    let found: Effect | undefined;
    for (const slot of this.pool) if (slot.active && slot.key === key && slot.kind === kind) { found = slot; break; }
    const e = found ?? this.spawn(kind, x, z, radius, Infinity, color, 0, key);
    e.x = x; e.z = z; e.radius = radius; e.seen = true; return e;
  }
  private sync(state: RunState): void {
    for (const e of this.pool) if (e.key) e.seen = false;
    const p = state.player;
    // Limit ambient state effects to 32; leave headroom for impacts and danger cues.
    let count = 0;
    for (const shot of state.projectiles) {
      if (count++ >= 24) break;
      const e = this.persistent('shot', shot.id, shot.x, shot.z, .2, 0xe87eff);
      e.angle = Math.atan2(shot.vx, shot.vz);
    }
    for (const fire of state.fires) {
      if (count++ >= 32) break;
      const e = this.persistent('fire', fire.id, fire.x, fire.z, fire.radius, 0xff6424);
      e.progress = Math.min(1, (fire.until - state.tick) / 15);
    }
    if (state.tick < p.wardUntil) {
      const e = this.persistent('ward', -1, p.x, p.z, SKILLS.ward.radius, 0xffd36c);
      e.progress = Math.min(1, (p.wardUntil - state.tick) / 15);
    }
    if (p.cast?.skill === 'dash') {
      const e = this.persistent('dash', -2, p.x, p.z, 1, 0x87d7ed);
      e.angle = Math.atan2(p.cast.dir.x, p.cast.dir.z);
    }
    for (const enemy of state.enemies) if (enemy.boss && enemy.mode === 'windup' && (enemy.attack === 'sweep' || enemy.attack === 'slam')) {
      const attack = enemy.attack;
      const x = attack === 'sweep' ? enemy.x : enemy.attackTarget.x;
      const z = attack === 'sweep' ? enemy.z : enemy.attackTarget.z;
      const e = this.persistent('danger', enemy.id, x, z, TELEGRAPH_RADIUS[attack], 0xff3e37);
      e.progress = Math.max(0, Math.min(1, 1 - (enemy.modeUntil - state.tick) / BOSS_WINDUP[attack]));
    }
    for (const e of this.pool) if (e.key && !e.seen) e.active = false;
  }
  update(state: RunState, dt: number, time: number): void {
    this.sync(state); this.batch.begin();
    for (const e of this.pool) if (e.active) {
      e.age += dt;
      if (e.age >= e.life) { e.active = false; continue; }
      this.draw(e, time);
    }
    this.batch.end(); this.shake *= Math.exp(-dt * 18); this.hurt = Math.max(0, this.hurt - dt);
    this.measure();
  }
  private draw(e: Effect, time: number): void {
    const b = this.batch; const t = e.age / e.life; const fade = 1 - t; const r = e.radius;
    if (e.kind === 'spin' || e.kind === 'echo') {
      b.draw(e.x, .3, e.z, r, r, time * 12, 0, e.color, fade * .7);
      for (let i = 0; i < 3; i++) b.draw(e.x, .45 + i * .12, e.z, r * (1 + t * .16), r * (1 + t * .16), time * 18 + i * 2.1, 1, e.color, fade, .65);
    } else if (e.kind === 'slash' || e.kind === 'cleave') {
      const heavy = e.kind === 'cleave'; const angle = -e.angle + Math.PI;
      b.draw(e.x, .7, e.z, r, r, angle + (heavy ? 0 : (t - .5) * 1.4), heavy ? 2 : 1, e.color, fade * .85, heavy ? SKILLS.cleave.halfAngle : SKILLS.slash.halfAngle);
    } else if (e.kind === 'fall') {
      b.draw(e.x, 4 * fade + .3, e.z, .2, .55, e.angle, 4, e.color, fade, 0, true);
    } else if (e.kind === 'blast' || e.kind === 'boss') {
      b.draw(e.x, .15, e.z, r * (.25 + .85 * t), r * (.25 + .85 * t), 0, 0, e.color, fade);
      b.draw(e.x, .18, e.z, r, r, 0, 3, e.color, fade * .8);
      this.sparks(e, e.kind === 'boss' ? 12 : 8, t, fade);
    } else if (e.kind === 'danger') {
      b.draw(e.x, .065, e.z, r, r, 0, 5, e.color, .36, Math.sqrt(e.progress));
      b.draw(e.x, .08, e.z, r, r, 0, 0, e.color, .9);
    } else if (e.kind === 'ward') {
      b.draw(e.x, .12, e.z, r, r, 0, 6, e.color, .65 * e.progress, time * 3);
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        b.draw(e.x + Math.sin(a) * r, .3, e.z + Math.cos(a) * r, .09, .28, -a, 4, e.color, e.progress, 0, true);
      }
    } else if (e.kind === 'shot') {
      b.draw(e.x, .85, e.z, .3, .3, 0, 3, e.color, 1, 0, true);
      b.draw(e.x - Math.sin(e.angle) * .4, .8, e.z - Math.cos(e.angle) * .4, .12, .7, -e.angle, 4, e.color, .7);
    } else if (e.kind === 'fire') {
      const flicker = .65 + .2 * Math.sin(time * 19 + e.key);
      b.draw(e.x, .08, e.z, r, r, 0, 3, e.color, flicker * e.progress);
      for (let i = 0; i < 3; i++) b.draw(e.x + Math.sin(i * 2.1) * .45, .4, e.z + Math.cos(i * 2.1) * .45, .2, .5 * flicker, i, 4, e.color, .65 * e.progress, 0, true);
    } else if (e.kind === 'dash') {
      for (let i = 1; i <= 3; i++) {
        const x = e.x - Math.sin(e.angle) * i * .55; const z = e.z - Math.cos(e.angle) * i * .55;
        b.draw(x, .8, z, .3, .8, e.angle, 4, e.color, .5 / i, 0, true);
        b.draw(x, .06, z, .12, .6, -e.angle, 4, e.color, .7 / i);
      }
    } else if (e.kind === 'pillar' || e.kind === 'drop') {
      const h = e.kind === 'pillar' ? 3 : 1.6;
      b.draw(e.x, h * .5 + t, e.z, r * .32, h, time, 4, e.color, fade, 0, true);
      b.draw(e.x, .1, e.z, r * (.4 + t), r * (.4 + t), 0, 0, e.color, fade * .6);
      this.sparks(e, 5, t, fade);
    } else this.sparks(e, e.kind === 'smoke' ? 3 : 5, t, fade);
  }
  private sparks(e: Effect, count: number, t: number, fade: number): void {
    for (let i = 0; i < count; i++) {
      const a = i * 2.399 + e.serial; const smoke = e.kind === 'smoke';
      const d = e.radius * (smoke ? t : .2 + t * .8); const size = smoke ? .25 + t * .5 : .12 + fade * .12;
      this.batch.draw(e.x + Math.sin(a) * d, .4 + t * (smoke ? 1.3 : 1.6) - (smoke ? 0 : t * t),
        e.z + Math.cos(a) * d, size, size * (smoke ? 1 : 2), a, 3, e.color, fade * (smoke ? .22 : 1), 0, true);
    }
  }
  private measure(): void { this.peak = Math.max(this.peak, this.active); }
  get active(): number { let n = 0; for (const e of this.pool) if (e.active) n++; return n; }
  get stats(): { active: number; peak: number; reused: number; primitives: number } {
    return { active: this.active, peak: this.peak, reused: this.reused, primitives: this.batch.mesh.count };
  }
  dispose(): void { this.batch.dispose(); this.root.removeFromParent(); }
}
