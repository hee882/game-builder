import * as THREE from 'three';
import { SKILLS } from '@yeonmu/sim';
import type { RunState, SkillId, Vec } from '@yeonmu/sim';
import { disposeGroup } from './scene';

/** Replace this factory with a GLB implementation without changing sim or input. */
export interface PlayerModel {
  readonly root: THREE.Group;
  load(): Promise<void>;
  capture(state: RunState): void;
  update(state: RunState, alpha: number): void;
  playCast(skill: SkillId): void;
  dispose(): void;
}

export class PlaceholderPlayer implements PlayerModel {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private arm = new THREE.Group();
  private previous: Vec = { x: 0, z: 0 };
  private facing = 0;
  private skill: SkillId = 'slash';

  constructor() {
    const cloth = new THREE.MeshStandardMaterial({ color: 0xc4bea5, roughness: 0.92 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x151f24, roughness: 0.7 });
    const red = new THREE.MeshStandardMaterial({ color: 0x8b2925, roughness: 0.7 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xd8e4df, metalness: 0.85, roughness: 0.25 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xbfa182, roughness: 0.9 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent = this.body): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z);
      mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    add(new THREE.CylinderGeometry(0.26, 0.45, 0.92, 8), cloth, 0, 0.83, 0);
    add(new THREE.BoxGeometry(0.55, 0.17, 0.4), red, 0, 1.03, 0.02);
    add(new THREE.BoxGeometry(0.22, 0.48, 0.25), dark, -0.18, 0.25, 0);
    add(new THREE.BoxGeometry(0.22, 0.48, 0.25), dark, 0.18, 0.25, 0);
    add(new THREE.SphereGeometry(0.2, 10, 8), skin, 0, 1.43, 0);
    add(new THREE.CylinderGeometry(0.62, 0.65, 0.045, 24), dark, 0, 1.66, 0);
    add(new THREE.CylinderGeometry(0.2, 0.25, 0.35, 12), dark, 0, 1.84, 0);
    add(new THREE.CylinderGeometry(0.255, 0.255, 0.035, 12), red, 0, 1.69, 0);
    const sleeve = add(new THREE.CylinderGeometry(0.15, 0.19, 0.55, 8), cloth, -0.38, 1.07, 0);
    sleeve.rotation.z = -0.3;
    this.arm.position.set(0.3, 1.13, 0); this.body.add(this.arm);
    add(new THREE.CylinderGeometry(0.15, 0.18, 0.5, 8), cloth, 0.12, -0.15, 0, this.arm).rotation.z = 0.5;
    add(new THREE.BoxGeometry(0.12, 0.12, 0.32), dark, 0.3, -0.32, 0.2, this.arm);
    add(new THREE.BoxGeometry(0.28, 0.055, 0.07), steel, 0.3, -0.32, 0.4, this.arm);
    const blade = new THREE.Shape();
    blade.moveTo(0, 0); blade.lineTo(0.09, 0.05); blade.lineTo(0.13, 0.9); blade.lineTo(0.03, 1.14);
    blade.lineTo(0.02, 0.8); blade.lineTo(0, 0);
    const sword = add(new THREE.ExtrudeGeometry(blade, { depth: 0.035, bevelEnabled: false }), steel, 0.26, -0.32, 0.4, this.arm);
    sword.rotation.x = Math.PI / 2;
    const sash = add(new THREE.BoxGeometry(0.14, 0.65, 0.04), red, -0.12, 0.64, 0.36); sash.rotation.z = -0.16;
    this.root.add(this.body);
  }

  async load(): Promise<void> { /* The procedural stand-in has no external assets. */ }
  capture(state: RunState): void {
    this.previous.x = state.player.x; this.previous.z = state.player.z; this.facing = state.player.facing;
  }
  playCast(skill: SkillId): void { this.skill = skill; }
  update(state: RunState, alpha: number): void {
    const p = state.player;
    this.root.position.set(THREE.MathUtils.lerp(this.previous.x, p.x, alpha), 0, THREE.MathUtils.lerp(this.previous.z, p.z, alpha));
    const angle = Math.atan2(Math.sin(p.facing - this.facing), Math.cos(p.facing - this.facing));
    this.root.rotation.y = this.facing + angle * alpha;
    const moving = Math.hypot(p.x - this.previous.x, p.z - this.previous.z) > 0.001;
    this.body.position.y = moving ? Math.abs(Math.sin((state.tick + alpha) * 0.45)) * 0.06 : 0;
    this.body.rotation.x = state.status === 'dead' ? -1.3 : 0;
    this.arm.rotation.set(0, 0, 0);
    if (p.cast) {
      const skill = p.cast.skill ?? this.skill;
      const speed = skill === 'slash' || skill === 'spin' ? p.stats.attackSpeed : 1;
      const duration = Math.max(4, Math.round(SKILLS[skill].castTicks / speed));
      const t = THREE.MathUtils.clamp((state.tick - p.cast.start + alpha) / duration, 0, 1);
      this.arm.rotation.y = -1.6 + Math.sin(t * Math.PI / 2) * 3.5;
      this.arm.rotation.z = -Math.sin(t * Math.PI) * 0.6;
      if (skill === 'spin') this.root.rotation.y += t * Math.PI * 2;
    }
  }
  dispose(): void { disposeGroup(this.root); }
}
