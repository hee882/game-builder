import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Vec } from '@yeonmu/sim';

/** Owns GPU output only; simulation coordinates are metres on the XZ plane. */
export class GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 130);
  readonly renderer: THREE.WebGLRenderer;
  readonly bloom: boolean;
  private composer: EffectComposer | null = null;
  private focus = new THREE.Vector3();
  private offset = new THREE.Vector3(0.45, 0.788, 0.42).normalize(); // 52° down
  private torch = new THREE.PointLight(0xffbe75, 55, 15, 1.7);
  private moon = new THREE.DirectionalLight(0x9abdc7, 1.7);
  private zoomIndex = 1;
  private distance = 24;
  private observer: ResizeObserver;

  constructor(readonly canvas: HTMLCanvasElement, bloom: boolean) {
    this.bloom = bloom;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false; // count shadow + ALL composer passes
    this.scene.background = new THREE.Color(0x10191c);
    this.scene.fog = new THREE.Fog(0x10191c, 30, 65);
    this.scene.add(new THREE.HemisphereLight(0x6e949f, 0x201b25, 0.65));
    this.moon.position.set(-8, 15, -7);
    this.scene.add(this.moon, this.moon.target);
    this.torch.castShadow = true;
    this.torch.shadow.mapSize.set(512, 512);
    this.torch.shadow.camera.near = 0.2;
    this.torch.shadow.camera.far = 15;
    this.torch.shadow.normalBias = 0.06;
    this.torch.shadow.bias = -0.0005;
    this.scene.add(this.torch);
    if (bloom) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.5, 1.05));
      this.composer.addPass(new OutputPass());
    }
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  private resize(): void {
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  zoom(delta: number): void { this.zoomIndex = THREE.MathUtils.clamp(this.zoomIndex + Math.sign(delta), 0, 2); }
  snap(at: Vec): void { this.focus.set(at.x, 0, at.z); this.follow(at, 1, 0); }
  follow(at: Vec, dt: number, time: number): void {
    const smoothing = 1 - Math.exp(-dt * 8);
    this.focus.lerp(new THREE.Vector3(at.x, 0, at.z), smoothing);
    this.distance += ([18, 24, 31][this.zoomIndex]! - this.distance) * smoothing;
    this.camera.position.copy(this.focus).addScaledVector(this.offset, this.distance);
    this.camera.lookAt(this.focus.x, 0.4, this.focus.z);
    this.camera.updateMatrixWorld();
    this.torch.position.set(at.x - 0.8, 3.4, at.z + 0.8);
    this.torch.intensity = 55 + Math.sin(time * 7) * 2 + Math.sin(time * 13) * 1.5;
    this.moon.position.set(at.x - 8, 15, at.z - 7);
    this.moon.target.position.set(at.x, 0, at.z);
  }

  render(): void {
    this.renderer.info.reset();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  project(at: Vec, y = 0): { x: number; y: number } {
    const p = new THREE.Vector3(at.x, y, at.z).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
  }

  dispose(): void {
    this.observer.disconnect();
    for (const pass of this.composer?.passes ?? []) pass.dispose();
    this.composer?.dispose(); this.torch.shadow.map?.dispose(); this.renderer.dispose();
  }
}

/** Dispose shared geometries/materials once when a run is replaced. */
export function disposeGroup(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  group.traverse(object => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(mat);
        if (mat instanceof THREE.MeshStandardMaterial && mat.map) textures.add(mat.map);
      }
      if (object instanceof THREE.InstancedMesh) object.dispose();
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
  group.removeFromParent();
}
