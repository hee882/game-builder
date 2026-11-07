import * as THREE from 'three';
import { attackById, elapsed, heading } from '@yeonmu/sim';
import type { Enemy, SimEvent, State } from '@yeonmu/sim';
import { animatePlayer } from './animation';
import { createArena, makeActor, mesh } from './models';
import type { Actor } from './models';

const NAMES={reed:'억새 잔향',shield:'방패 역졸',porter:'그림자 등짐장수',hat:'되돌이 삿갓'};
interface EnemyView {actor:Actor; telegraph:THREE.Group; label:HTMLDivElement}
interface Spark {mesh:THREE.Mesh; end:number}
export class ArenaRenderer {
  readonly renderer=new THREE.WebGLRenderer({antialias:true});
  readonly camera=new THREE.PerspectiveCamera(42,1,0.1,150);
  private scene=new THREE.Scene();
  private player=makeActor('player');
  private enemies=new Map<string,EnemyView>();
  private sparks:Spark[]=[];
  private raycaster=new THREE.Raycaster();
  private plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  private shakeUntil=0;
  shake=0.35;
  zoom=1;
  clip='';
  constructor(private host:HTMLElement) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x182327);host.prepend(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label','연무 전투 아레나');
    this.scene.fog=new THREE.Fog(0x182327,30,75);
    this.scene.add(new THREE.HemisphereLight(0xd3ebe8,0x33453a,2.1));
    const light=new THREE.DirectionalLight(0xffe2b3,3);light.position.set(-8,18,10);light.castShadow=true;
    light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-18;light.shadow.camera.right=18;
    light.shadow.camera.top=18;light.shadow.camera.bottom=-18;light.shadow.normalBias=0.04;
    this.scene.add(light);createArena(this.scene);this.scene.add(this.player.root);
    new ResizeObserver(()=>this.resize()).observe(host);this.resize();
  }
  private resize():void {
    const width=this.host.clientWidth;const height=this.host.clientHeight;
    this.renderer.setSize(width,height);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
  }
  aim(clientX:number,clientY:number,state:State):number|null {
    const rect=this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1),this.camera);
    const point=this.raycaster.ray.intersectPlane(this.plane,new THREE.Vector3());
    return point?heading(state.player,{x:point.x*1000,z:point.z*1000}):null;
  }
  render(state:State,now:number):void {
    const offset=this.zoom===1?1:0.83;
    const shake=now<this.shakeUntil?Math.sin(now*0.12)*0.08*this.shake:0;
    this.camera.position.set(20*offset+shake,29*offset,20*offset);
    this.camera.lookAt(state.player.x/1000*0.13,0,state.player.z/1000*0.13-0.8);
    this.clip=animatePlayer(this.player,state);
    for(const enemy of state.enemies) this.renderEnemy(enemy,state);
    for(const [id,view] of this.enemies) if(!state.enemies.some(enemy=>enemy.id===id)) {view.actor.root.visible=false;view.telegraph.visible=false;view.label.hidden=true;}
    this.updateSparks(now);this.renderer.render(this.scene,this.camera);
  }
  private enemyView(enemy:Enemy):EnemyView {
    let view=this.enemies.get(enemy.id);
    if(view) return view;
    const actor=makeActor(enemy.kind);const telegraph=new THREE.Group();
    const area=new THREE.Mesh(new THREE.RingGeometry(0.82,1,48),new THREE.MeshBasicMaterial({color:0xffcb66,transparent:true,opacity:0.65,depthTest:false,side:THREE.DoubleSide}));
    area.rotation.x=-Math.PI/2;area.renderOrder=100;telegraph.add(area);
    for(let i=0;i<4;i++) {
      const mark=mesh(new THREE.BoxGeometry(0.11,0.02,0.6),0xffcb66);
      mark.position.set(Math.cos(i*Math.PI/2)*0.7,0.03,Math.sin(i*Math.PI/2)*0.7);mark.rotation.y=i*Math.PI/2+Math.PI/4;telegraph.add(mark);
    }
    const label=document.createElement('div');label.className='enemy-label';this.host.append(label);
    view={actor,telegraph,label};this.enemies.set(enemy.id,view);this.scene.add(actor.root,telegraph);return view;
  }
  private renderEnemy(enemy:Enemy,state:State):void {
    const view=this.enemyView(enemy);const actor=view.actor;const live=enemy.hp>0;
    actor.root.visible=live;view.label.hidden=!live;view.telegraph.visible=live && enemy.attack!==null;
    if(!live) return;
    actor.root.position.set(enemy.x/1000,0,enemy.z/1000);actor.root.rotation.y=enemy.facing*Math.PI/4;
    actor.body.rotation.x=0;actor.arm.rotation.x=0;
    let warning='';
    if(enemy.attack) {
      const attack=attackById(enemy.attack);const time=state.tick-enemy.attackStart;
      const active=time>=attack.lead && time<attack.lead+attack.active;
      view.telegraph.visible=time<attack.lead+attack.active;
      view.telegraph.position.set(enemy.x/1000,0.04,enemy.z/1000);
      view.telegraph.scale.setScalar(attack.range/1000);
      const area=view.telegraph.children[0];
      if(area instanceof THREE.Mesh && area.material instanceof THREE.MeshBasicMaterial) {
        area.material.color.setHex(attack.color==='red'?0xff7765:0xffcb66);
        area.material.opacity=active?0.95:0.3+time/attack.lead*0.45;
      }
      warning=`${attack.color==='red'?'✕ 회피':'◇ 튕겨내기'} · ${attack.name}`;
      actor.arm.rotation.x=time<attack.lead?-1.8:1.1;
      actor.body.rotation.x=active?0.3:-0.1;
    }
    const projected=new THREE.Vector3(enemy.x/1000,enemy.kind==='hat'?3.6:2.3,enemy.z/1000).project(this.camera);
    view.label.style.left=`${(projected.x+1)*this.host.clientWidth/2}px`;view.label.style.top=`${(-projected.y+1)*this.host.clientHeight/2}px`;
    view.label.innerHTML=`<span>${NAMES[enemy.kind]}${enemy.mimicReady?' · 흉내 준비':''}</span><i style="--hp:${enemy.hp/enemy.maxHp*100}%"></i>${warning?`<b>${warning}</b>`:''}`;
  }
  events(events:SimEvent[],state:State):void {
    for(const event of events) if(event.type==='hit' || event.result==='parried') {
      const enemy=state.enemies.find(item=>item.id===event.enemy);if(!enemy) continue;
      const spark=mesh(new THREE.IcosahedronGeometry(0.3,0),event.result==='parried'?0xffdf7d:0xf8f4d8);
      spark.position.set(enemy.x/1000,1.1,enemy.z/1000);this.scene.add(spark);
      this.sparks.push({mesh:spark,end:performance.now()+180});this.shakeUntil=performance.now()+100;
    }
  }
  private updateSparks(now:number):void {
    this.sparks=this.sparks.filter(spark=>{
      if(now<spark.end) {spark.mesh.scale.setScalar((spark.end-now)/180);return true;}
      this.scene.remove(spark.mesh);spark.mesh.geometry.dispose();
      const material=spark.mesh.material;if(material instanceof THREE.Material) material.dispose();return false;
    });
  }
  inspect(state:State):object {return {clip:this.clip,action:state.player.action.node,actionTick:elapsed(state),enemyMeshes:[...this.enemies.values()].filter(v=>v.actor.root.visible).length,drawCalls:this.renderer.info.render.calls};}
}
