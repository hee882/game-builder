import { elapsed, nodeById } from '@yeonmu/sim';
import type { State } from '@yeonmu/sim';
import type { Actor } from './models';

export function animatePlayer(actor:Actor,state:State):string {
  const p=state.player;const time=elapsed(state);const action=p.action;
  actor.root.position.set(p.x/1000,0,p.z/1000);actor.root.rotation.y=p.facing*Math.PI/4;
  actor.body.rotation.set(0,0,0);actor.body.position.y=0;actor.arm.rotation.set(0,0,0);
  actor.blade.scale.set(1,1,1);actor.ring.scale.setScalar(1);
  if(action.kind==='attack') return attackPose(actor,action.node,time);
  if(action.kind==='dodge') {actor.body.rotation.x=0.65;actor.body.position.y=-0.25;return 'def_common_dodge';}
  if(action.kind==='parry' || action.kind==='counter') {actor.arm.rotation.z=-1.1;actor.ring.scale.setScalar(1.25);return 'def_hwando_parry';}
  if(action.kind==='guard') {actor.arm.rotation.z=-0.8;actor.arm.rotation.y=0.8;return 'def_hwando_block_loop';}
  if(action.kind==='charge') {actor.arm.rotation.y=-1.8;actor.body.rotation.x=-0.2;return time<6?'atk_hwando_charge_start':'atk_hwando_charge_loop';}
  if(action.kind==='recovery') {actor.body.rotation.x=-0.3;return 'hit_common_light';}
  if(action.kind==='skill') {actor.arm.rotation.y=time*0.45;return `skl_hwando_${action.node}`;}
  return 'loco_common_combat_idle';
}
function attackPose(actor:Actor,id:string,time:number):string {
  const node=nodeById(id);const progress=Math.min(1,time/node.duration);
  const swing=Math.sin(progress*Math.PI);
  const motions:Record<string,()=>void>={
    slash:()=>{actor.arm.rotation.y=-1.8+progress*3.8;},
    reverse:()=>{actor.arm.rotation.y=1.8-progress*3.8;},
    thrust:()=>{actor.blade.scale.z=1+swing;actor.body.rotation.x=swing*0.25;},
    sweep:()=>{actor.body.rotation.y=progress*4;actor.blade.scale.z=1.5;},
    rise:()=>{actor.arm.rotation.x=1.4-progress*3;actor.body.position.y=swing*0.25;},
    triple:()=>{actor.blade.scale.z=1+Math.abs(Math.sin(time*0.9))*1.3;},
    delay:()=>{actor.arm.rotation.z=-swing;actor.arm.rotation.y=-2+progress*4;},
    slam:()=>{actor.arm.rotation.x=-2.6+progress*3.6;},
    spin:()=>{actor.body.rotation.y=progress*Math.PI*2;actor.blade.scale.z=1.4;},
    dash:()=>{actor.body.rotation.x=0.45;actor.blade.scale.z=1.8;},
    flow:()=>{actor.body.rotation.z=swing*0.4;actor.arm.rotation.y=-2+progress*4;},
  };
  motions[node.motion]?.();
  return node.clips[node.id==='hw_charge'?2:0]??'';
}
