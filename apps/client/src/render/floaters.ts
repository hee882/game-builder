import * as THREE from 'three';
import type { RunState, SimEvent } from '@yeonmu/sim';

export const FLOATER_LIMIT = 40;
interface Floater { node: HTMLDivElement; age: number; x: number; z: number; serial: number; active: boolean }
export class Floaters {
  private root = document.createElement('div');
  private edge = document.createElement('div');
  private point = new THREE.Vector3();
  private pool: Floater[] = [];
  private serial = 0;
  private peak = 0;
  constructor() {
    this.root.className = 'combat-floaters'; this.root.setAttribute('aria-hidden', 'true');
    this.edge.className = 'hurt-edge'; this.root.append(this.edge);
    for (let i = 0; i < FLOATER_LIMIT; i++) {
      const node = document.createElement('div'); node.className = 'combat-number'; node.hidden = true;
      this.root.append(node); this.pool.push({ node, age: 0, x: 0, z: 0, serial: 0, active: false });
    }
    document.body.append(this.root);
  }
  events(events: readonly SimEvent[], state: RunState): void {
    for (const e of events) {
      if (e.type === 'hit') this.show(String(e.amount), e.x, e.z, e.crit ? 'critical' : '');
      if (e.type === 'blocked') this.show('막힘', e.x, e.z, 'blocked');
      if (e.type === 'player_hit') this.show(`−${e.amount}`, state.player.x, state.player.z, 'hurt');
    }
    this.peak = Math.max(this.peak, this.active);
  }
  private show(text: string, x: number, z: number, style: string): void {
    let f = this.pool[0]!;
    for (const slot of this.pool) {
      if (!slot.active) { f = slot; break; }
      if (slot.serial < f.serial) f = slot;
    }
    f.x = x; f.z = z; f.age = 0; f.serial = ++this.serial; f.active = true;
    f.node.textContent = text; f.node.className = `combat-number ${style}`; f.node.hidden = false;
  }
  update(camera: THREE.Camera, dt: number, hurt: number, width: number, height: number): void {
    this.edge.style.opacity = String(Math.min(.7, hurt * 1.8));
    for (const f of this.pool) if (f.active) {
      f.age += dt;
      if (f.age >= .85) { f.active = false; f.node.hidden = true; continue; }
      this.point.set(f.x, 1.9 + f.age * 1.4, f.z).project(camera);
      f.node.hidden = this.point.z < -1 || this.point.z > 1;
      const x = (this.point.x + 1) * width / 2 + (f.serial % 3 - 1) * 13;
      const y = (1 - this.point.y) * height / 2 - (f.node.classList.contains('blocked') ? 20 : 0);
      f.node.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`;
      f.node.style.opacity = String(Math.min(1, (.85 - f.age) * 4));
    }
  }
  get active(): number { let n = 0; for (const f of this.pool) if (f.active) n++; return n; }
  get stats(): { active: number; peak: number } { return { active: this.active, peak: this.peak }; }
  dispose(): void { this.root.remove(); }
}
