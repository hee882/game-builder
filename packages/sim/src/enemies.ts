import { attackById } from './content';
import { direction, distanceSquared, heading, move } from './geometry';
import { elapsed } from './actions';
import { enemyHits } from './hits';
import type { Enemy, State } from './types';

function updateMimic(state: State, enemy: Enemy): void {
  const history = state.player.history.filter(item=>state.tick-item.tick<=900);
  const recent = history.slice(-3);
  const first = recent[0]?.path;
  const repeated = recent.length===3 && first && recent.every(item=>item.path===first);
  if (!repeated) { enemy.mimicReady=false; enemy.mimicPath=''; return; }
  if (enemy.mimicPath!==first) {
    enemy.mimicPath=first; enemy.mimicReady=true;
    state.events.push({type:'boss_mimic_ready',tick:state.tick,enemy:enemy.id,path:first});
  }
}
function selectAttack(state: State, enemy: Enemy): string {
  if (enemy.kind==='reed') return 'reed_slash';
  if (enemy.kind==='shield') return 'shield_bash';
  if (enemy.kind==='porter') return 'porter_stab';
  if (enemy.mimicReady && enemy.mimicPath.startsWith(state.player.path.join('>')) && state.player.path.length>0) {
    enemy.mimicReady=false; return 'hat_mimic';
  }
  return enemy.sequence%3===2?'hat_sweep':'hat_cut';
}
function startEnemyAttack(state: State, enemy: Enemy): void {
  enemy.attack=selectAttack(state,enemy); enemy.attackStart=state.tick;
  enemy.facing=heading(enemy,state.player); enemy.target={x:state.player.x,z:state.player.z};
  enemy.hitPlayer=false; enemy.sequence++;
  state.events.push({type:'telegraph_start',tick:state.tick,enemy:enemy.id,attack:enemy.attack});
}
function enemyTimeline(state: State, enemy: Enemy): void {
  if (!enemy.attack) return;
  const attack=attackById(enemy.attack); const time=state.tick-enemy.attackStart;
  if (enemy.kind==='porter' && time<attack.lead) porterFeint(state,enemy,time,attack.lead);
  if (time>=attack.lead && time<attack.lead+attack.active) enemyHits(state,enemy,attack);
  if (time>=attack.lead+attack.active+attack.recovery) {
    enemy.attack=null; enemy.nextAttack=state.tick+10;
  }
}
export function updateEnemies(state: State): void {
  for (const enemy of state.enemies) {
    if (enemy.hp<=0) continue;
    if (enemy.kind==='hat') {
      updateMimic(state,enemy);
      if (enemy.hp<=enemy.maxHp/2 && enemy.phase===1) {
        enemy.phase=2; state.events.push({type:'boss_phase',tick:state.tick,enemy:enemy.id,amount:2});
      }
    }
    if (enemy.attack) { enemyTimeline(state,enemy); continue; }
    if (state.tick<enemy.staggerUntil) continue;
    const distance=distanceSquared(enemy,state.player);
    const engagement=enemy.kind==='hat'?5500:8500;
    if (distance>engagement**2) continue;
    const strikeDistance={reed:1350,shield:1500,porter:1850,hat:2200}[enemy.kind];
    if (distance>strikeDistance**2) approach(state,enemy);
    else if (state.tick>=enemy.nextAttack) startEnemyAttack(state,enemy);
  }
}
function approach(state: State, enemy: Enemy): void {
  const p=state.player;
  enemy.facing=heading(enemy,p);
  const orbit=enemy.kind==='reed' && distanceSquared(enemy,p)<3500**2 && enemy.sequence%2===0;
  move(enemy,orbit?(enemy.facing+1)%8:enemy.facing,enemy.kind==='hat'?65:enemy.kind==='porter'?105:75);
  for(const other of state.enemies) {
    if(other.id!==enemy.id && other.hp>0 && distanceSquared(enemy,other)<650**2) move(enemy,heading(other,enemy),55);
  }
}

function porterFeint(state:State,enemy:Enemy,time:number,lead:number):void {
  const p=state.player;
  // 마지막 6틱에는 추적을 잠가 예고를 보고 다시 대응할 여유를 남긴다.
  if(time<lead-6) {
    const remaining=p.action.kind==='dodge'?Math.max(0,13-elapsed(state)):0;
    const dir=direction(p.facing);
    enemy.target={x:p.x+Math.round(dir.x*remaining*290/1000),z:p.z+Math.round(dir.z*remaining*290/1000)};
    enemy.facing=heading(enemy,enemy.target);
  }
  if(time>=lead-6 && distanceSquared(enemy,enemy.target)>1200**2) move(enemy,enemy.facing,170);
}
