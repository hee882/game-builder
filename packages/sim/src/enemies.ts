import { attackById } from './content';
import { distanceSquared, heading, move } from './geometry';
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
    if (distance>1800**2) approach(state,enemy);
    else if (state.tick>=enemy.nextAttack) startEnemyAttack(state,enemy);
  }
}
function approach(state: State, enemy: Enemy): void {
  const p=state.player;
  // 자객은 회피의 끝 지점으로 돌아가므로 연속 회피가 안전한 해법이 되지 않는다.
  const target=enemy.kind==='porter' && p.action.kind==='dodge'
    ? {x:p.x,z:p.z} : p;
  enemy.facing=heading(enemy,target);
  const orbit=enemy.kind==='reed' && distanceSquared(enemy,p)<3500**2 && enemy.sequence%2===0;
  move(enemy,orbit?(enemy.facing+1)%8:enemy.facing,enemy.kind==='hat'?65:enemy.kind==='porter'?105:75);
}
