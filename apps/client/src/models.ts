import * as THREE from 'three';
import type { EnemyKind } from '@yeonmu/sim';

export interface Actor { root:THREE.Group; body:THREE.Group; arm:THREE.Group; blade:THREE.Mesh; ring:THREE.Mesh }
export function mesh(geometry:THREE.BufferGeometry,color:number):THREE.Mesh {
  const item=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:0.85}));
  item.castShadow=true;item.receiveShadow=true;return item;
}
export function makeActor(kind:EnemyKind|'player'):Actor {
  const colors={player:0xe6e0c9,reed:0x818864,shield:0x647c86,porter:0x8c7391,hat:0xa66b54};
  const root=new THREE.Group();const body=new THREE.Group();root.add(body);
  const torso=mesh(new THREE.CylinderGeometry(0.32,0.48,1.1,kind==='reed'?5:8),colors[kind]);torso.position.y=0.85;body.add(torso);
  const head=mesh(new THREE.SphereGeometry(0.24,12,8),kind==='player'?0xc3aa8d:0x303638);head.position.y=1.65;body.add(head);
  for(const x of [-0.18,0.18]) {const leg=mesh(new THREE.BoxGeometry(0.2,0.5,0.24),0x26343b);leg.position.set(x,0.25,0);body.add(leg);}
  const arm=new THREE.Group();arm.position.set(-0.35,1.2,0);body.add(arm);
  const blade=mesh(new THREE.BoxGeometry(0.085,0.12,1.25),0xd4e9e2);blade.position.set(0,0,0.65);arm.add(blade);
  const ring=mesh(new THREE.RingGeometry(0.55,0.61,32),kind==='player'?0x8ddac6:colors[kind]);
  ring.rotation.x=-Math.PI/2;ring.position.y=0.02;root.add(ring);
  if(kind==='hat' || kind==='porter') addHat(body,kind);
  if(kind==='shield') {const shield=mesh(new THREE.BoxGeometry(0.95,1.25,0.17),0x94a8ac);shield.position.set(0.1,0.95,0.48);body.add(shield);}
  if(kind==='reed') {head.scale.y=1.4;blade.visible=false;}
  if(kind==='hat') root.scale.setScalar(1.5);
  return {root,body,arm,blade,ring};
}
function addHat(body:THREE.Group,kind:'hat'|'porter'):void {
  const hat=mesh(new THREE.ConeGeometry(kind==='hat'?0.8:0.5,0.4,12),0x8d7957);hat.position.y=1.95;body.add(hat);
  const pack=mesh(new THREE.BoxGeometry(0.65,0.8,0.4),0x554b42);pack.position.set(0,1.1,-0.5);body.add(pack);
}
export function createArena(scene:THREE.Scene):void {
  const floor=mesh(new THREE.BoxGeometry(25,0.3,21),0x303d40);floor.position.y=-0.18;scene.add(floor);
  const grid=new THREE.GridHelper(24,12,0x6d796e,0x435351);grid.position.y=0.005;scene.add(grid);
  for(const x of [-12,12]) for(const z of [-10,-5,0,5,10]) {
    const stone=mesh(new THREE.BoxGeometry(0.8,0.7,0.8),0x62706b);stone.position.set(x,0.35,z);scene.add(stone);
  }
  const circle=mesh(new THREE.RingGeometry(4.8,4.86,64),0xa28b5b);circle.rotation.x=-Math.PI/2;circle.position.set(0,0.02,-5);scene.add(circle);
}
