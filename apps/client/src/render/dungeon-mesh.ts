import * as THREE from 'three';
import { isFloor } from '@yeonmu/sim';
import type { Dungeon, Vec } from '@yeonmu/sim';
import { disposeGroup } from './scene';

function noise(seed: number, x: number, z: number): number {
  let h = Math.imul(x + seed, 374761393) ^ Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function stoneTexture(wall = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#a2aaa7'; c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2400; i++) {
    const n = noise(91, i, 1); c.fillStyle = n > 0.5 ? '#ffffff0c' : '#00000012';
    c.fillRect(noise(3, i, 2) * 128, noise(7, i, 3) * 128, 1 + n * 4, 1 + n * 2);
  }
  c.strokeStyle = '#353e3b'; c.lineWidth = 3; c.strokeRect(1, 1, 126, 126);
  c.strokeStyle = '#e8e5cd55'; c.lineWidth = 1; c.strokeRect(4, 4, 120, 120);
  c.strokeStyle = '#444b4750'; c.beginPath();
  c.moveTo(0, 32); c.lineTo(22, 40); c.lineTo(29, 59); c.lineTo(36, 62);
  c.moveTo(29, 59); c.lineTo(15, 74); c.moveTo(128, 104); c.lineTo(100, 93); c.lineTo(95, 81); c.stroke();
  if (wall) {
    c.strokeStyle = '#242e2ac0'; c.lineWidth = 3;
    for (let row = 0; row < 4; row++) {
      c.beginPath(); c.moveTo(0, row * 32); c.lineTo(128, row * 32); c.stroke();
      for (let x = row % 2 ? 32 : 0; x < 128; x += 64) {
        c.beginPath(); c.moveTo(x, row * 32); c.lineTo(x, row * 32 + 32); c.stroke();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4; return texture;
}

export class DungeonMesh {
  readonly root = new THREE.Group();
  private walls: THREE.InstancedMesh;
  private wallPositions: { x: number; z: number; height: number; cut: boolean }[] = [];
  private torchPositions: THREE.Vector3[] = [];
  private lights = Array.from({ length: 4 }, () => new THREE.PointLight(0xff953e, 30, 11, 1.8));
  private dummy = new THREE.Object3D();

  constructor(dungeon: Dungeon) {
    const floors: Vec[] = [];
    for (let z = 0; z < dungeon.height; z++) for (let x = 0; x < dungeon.width; x++) {
      if (isFloor(dungeon, x, z)) floors.push({ x, z });
      else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => isFloor(dungeon, x + dx!, z + dz!)))
        this.wallPositions.push({ x: x + 0.5, z: z + 0.5, height: 2.4 + noise(dungeon.seed, x, z) * 0.35, cut: false });
    }
    const texture = stoneTexture();
    const floor = new THREE.InstancedMesh(new THREE.BoxGeometry(0.985, 0.18, 0.985),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0.12 }), floors.length);
    const tint = new THREE.Color();
    floors.forEach((p, i) => {
      const n = noise(dungeon.seed, p.x, p.z);
      this.dummy.position.set(p.x + 0.5, -0.12 + n * 0.025, p.z + 0.5);
      this.dummy.rotation.y = Math.floor(n * 4) * Math.PI / 2; this.dummy.updateMatrix();
      floor.setMatrixAt(i, this.dummy.matrix);
      floor.setColorAt(i, tint.setHSL(0.46 + n * 0.04, 0.09, 0.28 + n * 0.12));
    });
    floor.receiveShadow = true; this.root.add(floor);
    this.dummy.rotation.set(0, 0, 0);
    this.walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ map: stoneTexture(true), roughness: 0.95, color: 0x657473 }), this.wallPositions.length);
    this.walls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wallPositions.forEach((p, i) => {
      this.wallMatrix(i, p.height);
      this.walls.setColorAt(i, tint.setScalar(0.6 + noise(dungeon.seed + 1, p.x, p.z) * 0.4));
    });
    this.walls.castShadow = true; this.walls.receiveShadow = true; this.root.add(this.walls);
    this.walls.computeBoundingSphere();
    this.addTorches(dungeon);
    this.root.add(...this.lights);
  }

  private wallMatrix(i: number, height: number): void {
    const p = this.wallPositions[i]!;
    this.dummy.position.set(p.x, height / 2 - 0.04, p.z);
    this.dummy.scale.set(0.99, height, 0.99); this.dummy.updateMatrix();
    this.walls.setMatrixAt(i, this.dummy.matrix);
  }

  private addTorches(dungeon: Dungeon): void {
    // Two fixtures per room, with only the four nearest lights active.
    for (const room of dungeon.rooms) for (const side of [-1, 1])
      this.torchPositions.push(new THREE.Vector3(room.cx + side * (room.w / 2 - 0.7), 1.8, room.z + 0.65));
    const stands = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.18, 1.8, 6),
      new THREE.MeshStandardMaterial({ color: 0x3d3530, metalness: 0.65, roughness: 0.6 }), this.torchPositions.length);
    const flames = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.18),
      new THREE.MeshStandardMaterial({ color: 0xffa02d, emissive: 0xff7b20, emissiveIntensity: 5 }), this.torchPositions.length);
    this.torchPositions.forEach((p, i) => {
      this.dummy.position.set(p.x, 0.9, p.z); this.dummy.scale.set(1, 1, 1); this.dummy.updateMatrix(); stands.setMatrixAt(i, this.dummy.matrix);
      this.dummy.position.copy(p); this.dummy.scale.set(0.8, 1.8, 0.8); this.dummy.updateMatrix(); flames.setMatrixAt(i, this.dummy.matrix);
    });
    stands.castShadow = true; this.root.add(stands, flames);
  }

  update(player: Vec, camera: THREE.Camera, time: number): void {
    let changed = false;
    const dx = camera.position.x - player.x; const dz = camera.position.z - player.z;
    const length = Math.hypot(dx, dz);
    this.wallPositions.forEach((p, i) => {
      const x = p.x - player.x; const z = p.z - player.z;
      const along = (x * dx + z * dz) / length;
      const across = Math.abs(x * dz - z * dx) / length;
      const cut = along > -0.7 && along < 6 && across < 4;
      if (cut !== p.cut) { p.cut = cut; this.wallMatrix(i, cut ? 0.32 : p.height); changed = true; }
    });
    if (changed) this.walls.instanceMatrix.needsUpdate = true;
    const nearest = this.torchPositions.map((p, index) => ({ index, distance: Math.hypot(p.x - player.x, p.z - player.z) }))
      .sort((a, b) => a.distance - b.distance);
    this.lights.forEach((light, i) => {
      const target = nearest[i];
      light.intensity = target && target.distance < 22 ? 30 + Math.sin(time * 8 + i) * 3 : 0;
      if (target) light.position.copy(this.torchPositions[target.index]!);
    });
  }

  dispose(): void { disposeGroup(this.root); }
}
