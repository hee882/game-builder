import { inWindow, nodeById, TIMING } from './content';
import type { EnemyAttack } from './content';
import { elapsed, finishPath, setAction } from './actions';
import { inHitbox, move } from './geometry';
import type { Enemy, State } from './types';

export function playerHits(state: State): void {
  const p = state.player;
  if (p.action.kind==='skill') { skillHits(state); return; }
  if (p.action.kind!=='attack') return;
  const node = nodeById(p.action.node);
  const hitIndex = (node.hits ?? [node.active]).findIndex(window=>inWindow(elapsed(state),window));
  if (hitIndex<0) return;
  for (const enemy of state.enemies) {
    const key = `${enemy.id}:${hitIndex}`;
    if (enemy.hp<=0 || p.action.hitTargets.includes(key) || !inHitbox(p,p.facing,enemy,node.range,node.shape)) continue;
    p.action.hitTargets.push(key);
    hitEnemy(state,enemy,node.damage,node.hitstop,node.id);
  }
}
function hitEnemy(state: State, enemy: Enemy, damage: number, hitstop: number, source: string): void {
  const p = state.player;
  const bypass = ['hw_dl','hw_dlh','hw_parry_h','q','f'].includes(source);
  const frontal = inHitbox(enemy,enemy.facing,p,6000,'arc');
  if (enemy.kind==='shield' && state.tick>=enemy.guardBrokenUntil && frontal && !bypass) {
    state.events.push({type:'shield_block',tick:state.tick,enemy:enemy.id,node:source});
    finishPath(state);setAction(state,'recovery');
    p.hitstop=Math.max(p.hitstop,2); return;
  }
  if (['hw_dlh','q','f'].includes(source)) enemy.guardBrokenUntil=state.tick+90;
  const boosted = state.tick<p.perfectUntil;
  const actualDamage=boosted?Math.round(damage*1.25):damage;
  enemy.hp=Math.max(0,enemy.hp-actualDamage);
  if (boosted) p.perfectUntil=0;
  p.hitstop=Math.max(p.hitstop,enemy.kind==='hat' && enemy.hp===0?TIMING.hitstopBossFinish:hitstop);
  if (enemy.kind!=='hat') {
    enemy.staggerUntil=state.tick+(hitstop===2?6:12);
    enemy.attack=null;enemy.nextAttack=Math.max(enemy.nextAttack,enemy.staggerUntil);
  }
  if (source==='hw_parry_h') {
    enemy.staggerUntil=state.tick+30;enemy.attack=null;enemy.nextAttack=enemy.staggerUntil;
  }
  if (source==='hw_l4' || source==='hw_llh') move(enemy,p.facing,600);
  state.events.push({type:'hit',tick:state.tick,enemy:enemy.id,node:source,amount:actualDamage});
  if (enemy.hp===0) state.events.push({type:'enemy_defeated',tick:state.tick,enemy:enemy.id});
}
function skillHits(state: State): void {
  const p = state.player; const id = p.action.node;
  if (elapsed(state)!==3) return;
  const range = id==='e'?3200:id==='f'?3500:2200;
  for (const enemy of state.enemies) {
    if (enemy.hp<=0 || p.action.hitTargets.includes(enemy.id) || !inHitbox(p,p.facing,enemy,range,id==='e'||id==='f'?'circle':'arc')) continue;
    p.action.hitTargets.push(enemy.id);
    hitEnemy(state,enemy,id==='f'?8:id==='q'?14:30,3,id);
    if (id==='f') { enemy.attack=null; enemy.staggerUntil=state.tick+30; }
  }
}
export function enemyHits(state: State, enemy: Enemy, attack: EnemyAttack): void {
  const p = state.player;
  if (enemy.hitPlayer || state.tick<p.invulnerableUntil) return;
  if (!inHitbox(enemy,enemy.facing,p,attack.range,attack.color==='red'?'circle':'arc')) return;
  enemy.hitPlayer=true;
  const time = elapsed(state);
  if (p.action.kind==='dodge' && inWindow(time,TIMING.dodge)) {
    const perfect = inWindow(time,TIMING.perfectDodge);
    if (perfect) p.perfectUntil=state.tick+36;
    defenseEvent(state,enemy,attack,perfect?'perfect_dodge':'dodged'); return;
  }
  if (attack.color==='yellow' && p.action.kind==='parry' && inWindow(time,TIMING.parry)) {
    setAction(state,'counter'); p.hitstop=TIMING.hitstopParry; p.hp=Math.min(100,p.hp+2);
    enemy.staggerUntil=state.tick+18;
    defenseEvent(state,enemy,attack,'parried'); return;
  }
  if (attack.color==='yellow' && p.action.kind==='guard' && inHitbox(p,p.facing,enemy,6000,'arc')) {
    p.guard=Math.max(0,p.guard-30);
    p.hp=Math.max(0,p.hp-Math.ceil(attack.damage*0.3));
    if (p.guard===0) setAction(state,'recovery','guard_break');
    defenseEvent(state,enemy,attack,'blocked'); return;
  }
  p.hp=Math.max(0,p.hp-attack.damage); p.invulnerableUntil=state.tick+10;
  if (p.action.kind!=='charge') { p.hitstop=0; setAction(state,'recovery'); }
  defenseEvent(state,enemy,attack,'hit');
  if (p.hp===0) state.events.push({type:'death_cause',tick:state.tick,attack:attack.id,enemy:enemy.id});
}
function defenseEvent(state: State, enemy: Enemy, attack: EnemyAttack, result: string): void {
  state.events.push({type:'parry_result',tick:state.tick,enemy:enemy.id,attack:attack.id,result});
}
