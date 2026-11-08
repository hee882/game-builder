import * as THREE from 'three';

/** One draw call for all translucent FX; no textures, lights or per-frame objects. */
export class EffectBatch {
  readonly mesh: THREE.InstancedMesh;
  private data = new THREE.InstancedBufferAttribute(new Float32Array(1024 * 4), 4);
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private count = 0;

  constructor() {
    const geometry = new THREE.PlaneGeometry(2, 2);
    geometry.setAttribute('fx', this.data); this.data.setUsage(THREE.DynamicDrawUsage);
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec4 fx; varying vec2 vUv; varying vec4 vFx; varying vec3 vColor;
        void main(){ vUv=uv*2.-1.; vFx=fx; vColor=instanceColor;
          gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.); }`,
      fragmentShader: `varying vec2 vUv; varying vec4 vFx; varying vec3 vColor;
        void main(){ float r=length(vUv); float a=0.; float kind=vFx.x;
          if(kind<.5) a=smoothstep(1.,.90,r)*smoothstep(.72,.86,r);
          else if(kind<1.5) a=smoothstep(1.,.86,r)*smoothstep(.55,.76,r)*step(abs(atan(vUv.x,vUv.y)),vFx.z);
          else if(kind<2.5) a=smoothstep(1.,.75,r)*step(abs(atan(vUv.x,vUv.y)),vFx.z)*(.25+.75*r);
          else if(kind<3.5) a=pow(max(0.,1.-r),2.);
          else if(kind<4.5) a=pow(max(0.,1.-abs(vUv.x)),2.)*smoothstep(1.,.6,abs(vUv.y));
          else if(kind<5.5) a=smoothstep(1.,.96,r)*(.22+.65*step(r,vFx.z));
          else a=smoothstep(1.,.96,r)*smoothstep(.89,.94,r)*(.5+.5*sin(atan(vUv.x,vUv.y)*42.+vFx.z));
          if(a<.005) discard; gl_FragColor=vec4(vColor,a*vFx.y); }`,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, 1024);
    this.mesh.setColorAt(0, this.color); this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.renderOrder = 3;
  }

  begin(): void { this.count = 0; }
  /** shapes: ring, arc, cone, glow, streak, danger fill, braided rope. */
  draw(x: number, y: number, z: number, sx: number, sy: number, angle: number,
    shape: number, color: number, opacity: number, detail = 0, vertical = false): void {
    if (this.count >= 1024 || opacity <= 0) return;
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(vertical ? 0 : -Math.PI / 2, vertical ? angle : 0, vertical ? 0 : angle);
    this.dummy.scale.set(sx, sy, 1); this.dummy.updateMatrix();
    const i = this.count++;
    this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.color.setHex(color).multiplyScalar(1.8); this.mesh.setColorAt(i, this.color);
    this.data.setXYZW(i, shape, opacity, detail, 0);
  }
  end(): void {
    this.mesh.count = this.count; this.mesh.visible = this.count > 0;
    this.mesh.instanceMatrix.needsUpdate = this.data.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
  dispose(): void {
    this.mesh.removeFromParent(); this.mesh.dispose(); this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
