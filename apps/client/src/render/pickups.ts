import * as THREE from 'three';
import type { Rarity, RunState } from '@yeonmu/sim';
import { disposeGroup } from './scene';

const COLORS: Record<Rarity, number> = { common: 0xcad8dc, magic: 0x558dff, rare: 0xffd254, legendary: 0xff741c };
interface LootBatch { gems: THREE.InstancedMesh; beams: THREE.InstancedMesh; ids: number[] }

export class Pickups {
  readonly root = new THREE.Group();
  readonly pickables: THREE.Object3D[] = [];
  private batches = new Map<Rarity, LootBatch>();
  private globes: THREE.InstancedMesh;
  private portal = new THREE.Group();
  private dummy = new THREE.Object3D();

  constructor() {
    const gemGeometry = new THREE.OctahedronGeometry(0.18);
    const beamGeometry = new THREE.CylinderGeometry(0.035, 0.16, 1, 8, 1, true);
    for (const rarity of Object.keys(COLORS) as Rarity[]) {
      const gems = new THREE.InstancedMesh(gemGeometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[rarity]).multiplyScalar(2) }), 512);
      const beams = new THREE.InstancedMesh(beamGeometry, new THREE.MeshBasicMaterial({ color: COLORS[rarity], transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), 512);
      for (const mesh of [gems, beams]) { mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
      this.batches.set(rarity, { gems, beams, ids: [] }); this.root.add(gems, beams); this.pickables.push(gems);
    }
    this.globes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc42032, emissive: 0xff152e, emissiveIntensity: 2.5, roughness: 0.3 }), 1024);
    this.globes.frustumCulled = false; this.globes.count = 0; this.root.add(this.globes);
    const gate = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4fdacb).multiplyScalar(3) }));
    gate.position.y = 1.4; gate.scale.y = 1.35; this.portal.add(gate); this.pickables.push(gate); gate.userData.portal = true;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.18, 16), new THREE.MeshStandardMaterial({ color: 0x54635c, roughness: 0.9 }));
    this.portal.add(base); this.root.add(this.portal); this.portal.visible = false;
  }

  update(state: RunState, time: number): void {
    for (const batch of this.batches.values()) batch.ids.length = 0;
    for (const item of state.items) {
      const batch = this.batches.get(item.item.rarity)!; const i = batch.ids.length;
      if (i >= 512) continue;
      batch.ids.push(item.id);
      this.dummy.position.set(item.x, 0.27 + Math.sin(time * 2 + item.id) * 0.04, item.z);
      this.dummy.rotation.set(0, time * 0.6, 0); this.dummy.scale.set(1, 1, 1); this.dummy.updateMatrix(); batch.gems.setMatrixAt(i, this.dummy.matrix);
      const height = item.item.rarity === 'legendary' ? 4 : item.item.rarity === 'rare' ? 2.5 : 1.5;
      this.dummy.rotation.set(0, 0, 0); this.dummy.position.y = height / 2; this.dummy.scale.set(1, height, 1); this.dummy.updateMatrix(); batch.beams.setMatrixAt(i, this.dummy.matrix);
    }
    for (const batch of this.batches.values()) {
      for (const mesh of [batch.gems, batch.beams]) { mesh.count = batch.ids.length; mesh.instanceMatrix.needsUpdate = true; }
      batch.gems.computeBoundingSphere();
    }
    this.globes.count = Math.min(1024, state.globes.length);
    state.globes.slice(0, 1024).forEach((globe, i) => {
      this.dummy.position.set(globe.x, 0.23, globe.z); this.dummy.scale.setScalar(1 + Math.sin(time * 3 + globe.id) * 0.1);
      this.dummy.updateMatrix(); this.globes.setMatrixAt(i, this.dummy.matrix);
    });
    this.globes.instanceMatrix.needsUpdate = true;
    this.portal.visible = state.portal !== null;
    if (state.portal) this.portal.position.set(state.portal.x, 0, state.portal.z);
    this.root.updateMatrixWorld(true);
  }

  itemAt(hit: THREE.Intersection): number | 'portal' | null {
    if (hit.object.userData.portal) return this.portal.visible ? 'portal' : null;
    for (const batch of this.batches.values()) if (hit.object === batch.gems && hit.instanceId !== undefined) return batch.ids[hit.instanceId] ?? null;
    return null;
  }
  dispose(): void { disposeGroup(this.root); }
}
