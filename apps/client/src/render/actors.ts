import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EnemyKind, RunState, SimEvent, Vec } from '@yeonmu/sim';
import { PlaceholderPlayer } from './player-model';
import type { PlayerModel } from './player-model';
import { disposeGroup } from './scene';

const COLORS = { reed: 0x879577, shield: 0x6f8e9d, porter: 0x997fa6, hat: 0xa74434 };
type Pose = Vec & { facing: number };
interface Batch { mesh: THREE.InstancedMesh; ids: number[] }
interface Corpse { mesh: THREE.Mesh; age: number; facing: number; size: number }

function enemyGeometry(kind: EnemyKind): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (geometry: THREE.BufferGeometry, x: number, y: number, z: number): void => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.translate(x, y, z); parts.push(flat);
  };
  add(new THREE.CylinderGeometry(0.22, 0.36, 1, 7), 0, 0.75, 0);
  add(new THREE.IcosahedronGeometry(0.22, 0), 0, 1.43, 0);
  for (const x of [-0.19, 0.19]) add(new THREE.BoxGeometry(0.16, 0.4, 0.2), x, 0.2, 0);
  if (kind === 'reed') {
    for (let i = 0; i < 5; i++) {
      const stem = new THREE.ConeGeometry(0.045, 0.9 + i * 0.07, 4); stem.rotateZ((i - 2) * 0.19);
      add(stem, (i - 2) * 0.12, 1.65, -0.18);
    }
    add(new THREE.BoxGeometry(0.07, 1.4, 0.07), 0.43, 0.95, 0.18);
  } else if (kind === 'shield') {
    add(new THREE.BoxGeometry(0.72, 0.93, 0.16), -0.26, 0.9, 0.4);
    add(new THREE.BoxGeometry(0.1, 1.25, 0.09), 0.42, 0.9, 0.2);
    add(new THREE.ConeGeometry(0.32, 0.3, 6), 0, 1.64, 0);
  } else if (kind === 'porter') {
    add(new THREE.BoxGeometry(0.75, 0.9, 0.48), 0, 1.15, -0.35);
    add(new THREE.ConeGeometry(0.4, 0.27, 8), 0, 1.62, 0);
    add(new THREE.BoxGeometry(0.18, 0.22, 0.55), 0.43, 1, 0.22);
  } else {
    add(new THREE.ConeGeometry(0.82, 0.38, 14), 0, 1.73, 0);
    add(new THREE.BoxGeometry(0.15, 0.12, 1.5), 0.5, 0.85, 0.7);
  }
  const result = mergeGeometries(parts)!; parts.forEach(g => g.dispose()); return result;
}

export class Actors {
  readonly root = new THREE.Group();
  readonly player: PlayerModel = new PlaceholderPlayer();
  readonly pickables: THREE.Object3D[] = [];
  private previous = new Map<number, Pose>();
  private batches = new Map<EnemyKind, Batch>();
  private boss: THREE.Mesh;
  private corpses: Corpse[] = [];
  private nextCorpse = 0;
  private dummy = new THREE.Object3D();
  private tint = new THREE.Color();
  private hover: THREE.Mesh;

  constructor(state: RunState) {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.15 });
    for (const kind of ['reed', 'shield', 'porter'] as const) {
      const mesh = new THREE.InstancedMesh(enemyGeometry(kind), material, 512);
      mesh.count = 0; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      this.batches.set(kind, { mesh, ids: [] }); this.pickables.push(mesh); this.root.add(mesh);
    }
    this.boss = new THREE.Mesh(enemyGeometry('hat'), material.clone());
    this.boss.castShadow = true; this.boss.receiveShadow = true; this.root.add(this.boss); this.pickables.push(this.boss);
    // Bounded reusable pool. Geometry is borrowed from the live batches.
    for (let i = 0; i < 32; i++) {
      const mesh = new THREE.Mesh(this.boss.geometry, material.clone()); mesh.visible = false;
      this.root.add(mesh); this.corpses.push({ mesh, age: 1, facing: 0, size: 1 });
    }
    this.hover = new THREE.Mesh(new THREE.RingGeometry(0.65, 0.71, 32), new THREE.MeshBasicMaterial({ color: 0xffba75, transparent: true, opacity: 0.9, depthWrite: false }));
    this.hover.rotation.x = -Math.PI / 2; this.hover.visible = false; this.root.add(this.hover);
    this.root.add(this.player.root); void this.player.load(); this.capture(state);
  }

  capture(state: RunState): void {
    this.player.capture(state); this.previous.clear();
    for (const enemy of state.enemies) this.previous.set(enemy.id, { x: enemy.x, z: enemy.z, facing: enemy.facing });
  }

  events(events: readonly SimEvent[]): void {
    for (const event of events) {
      if (event.type === 'cast') this.player.playCast(event.skill);
      if (event.type !== 'kill') continue;
      const corpse = this.corpses[this.nextCorpse++ % this.corpses.length]!;
      corpse.mesh.geometry = this.batches.get(event.kind)?.mesh.geometry ?? this.boss.geometry;
      (corpse.mesh.material as THREE.MeshStandardMaterial).color.setHex(event.elite ? 0xce8dec : COLORS[event.kind]);
      corpse.mesh.position.set(event.x, 0, event.z); corpse.mesh.visible = true;
      corpse.facing = this.previous.get(event.enemy)?.facing ?? 0;
      corpse.size = event.boss ? 1.6 : event.elite ? 1.3 : 1; corpse.age = 0;
    }
  }

  update(state: RunState, alpha: number, dt: number, hovered: number | null): void {
    this.player.update(state, alpha);
    for (const batch of this.batches.values()) batch.ids.length = 0;
    this.boss.visible = false; this.hover.visible = false;
    for (const enemy of state.enemies) {
      const old = this.previous.get(enemy.id) ?? enemy;
      const x = THREE.MathUtils.lerp(old.x, enemy.x, alpha); const z = THREE.MathUtils.lerp(old.z, enemy.z, alpha);
      const angle = Math.atan2(Math.sin(enemy.facing - old.facing), Math.cos(enemy.facing - old.facing));
      this.dummy.position.set(x, 0, z);
      this.dummy.rotation.set(enemy.mode === 'windup' ? -0.12 : 0, old.facing + angle * alpha, 0);
      this.dummy.scale.setScalar(enemy.boss ? 1.6 : enemy.elite ? 1.3 : 1); this.dummy.updateMatrix();
      this.tint.setHex(enemy.flashUntil > state.tick ? 0xffffff : enemy.elite ? 0xce8dec : COLORS[enemy.kind]);
      if (enemy.kind === 'hat') {
        this.boss.visible = true; this.boss.position.copy(this.dummy.position); this.boss.rotation.copy(this.dummy.rotation); this.boss.scale.copy(this.dummy.scale);
        (this.boss.material as THREE.MeshStandardMaterial).color.copy(this.tint); this.boss.userData.enemy = enemy.id;
      } else {
        const batch = this.batches.get(enemy.kind)!; const index = batch.ids.length;
        if (index >= batch.mesh.instanceMatrix.count) continue;
        batch.ids.push(enemy.id); batch.mesh.setMatrixAt(index, this.dummy.matrix); batch.mesh.setColorAt(index, this.tint);
      }
      if (enemy.id === hovered) { this.hover.visible = true; this.hover.position.set(x, 0.045, z); this.hover.scale.setScalar(enemy.boss ? 1.8 : enemy.elite ? 1.4 : 1); }
    }
    for (const batch of this.batches.values()) {
      batch.mesh.count = batch.ids.length; batch.mesh.instanceMatrix.needsUpdate = true;
      batch.mesh.computeBoundingSphere(); // Raycast bounds must follow moving instances.
      if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
    }
    for (const corpse of this.corpses) if (corpse.mesh.visible) {
      corpse.age += dt; const t = Math.min(1, corpse.age / 0.65);
      corpse.mesh.rotation.set(t * Math.PI / 2, corpse.facing, t * 0.2);
      corpse.mesh.scale.setScalar(corpse.size * (1 - Math.max(0, t - 0.65) / 0.35));
      if (t >= 1) corpse.mesh.visible = false;
    }
    this.root.updateMatrixWorld(true);
  }

  enemyAt(hit: THREE.Intersection): number | null {
    if (hit.object === this.boss) return this.boss.visible ? this.boss.userData.enemy as number : null;
    for (const batch of this.batches.values()) if (hit.object === batch.mesh && hit.instanceId !== undefined) return batch.ids[hit.instanceId] ?? null;
    return null;
  }

  dispose(): void { this.player.root.removeFromParent(); this.player.dispose(); disposeGroup(this.root); }
}
