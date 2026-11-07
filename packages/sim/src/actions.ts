import { inWindow, nodeById, TIMING } from './content';
import { distanceSquared, heading, inHitbox, move } from './geometry';
import type { ActionKind, Command, InputFrame, State } from './types';

export function elapsed(state: State): number { return state.player.actionTick - state.player.action.start; }
export function setAction(state: State, kind: ActionKind, node = ''): void {
  state.player.action = { kind, node, start: state.player.actionTick, hitTargets: [] };
}
export function finishPath(state: State): void {
  const p = state.player;
  if (!p.path.length) return;
  const path = p.path.join('>');
  p.history.push({path,tick:state.tick}); p.path = [];
  state.events.push({type:'combo_path',tick:state.tick,path});
  // 원시 경로도 함께 남겨 분석에서 다른 기간의 다양도를 다시 계산할 수 있다.
}
export function startAttack(state: State, id: string, aim: number | null): void {
  const p = state.player;
  if (p.action.kind !== 'attack') finishPath(state);
  if (aim !== null) p.facing = ((Math.round(aim)%8)+8)%8;
  else {
    const target = state.enemies.filter(e=>e.hp>0 && inHitbox(p,p.facing,e,6000,'arc'))
      .sort((a,b)=>distanceSquared(p,a)-distanceSquared(p,b))[0];
    if (target) p.facing = heading(p,target);
  }
  setAction(state,'attack',id); p.path.push(id);
  state.events.push({type:'combo_node_use',tick:state.tick,node:id});
  if (!p.seen.includes(id)) {
    p.seen.push(id); state.events.push({type:'combo_node_first_use',tick:state.tick,node:id});
  }
}
function canDefend(state: State): boolean {
  const p = state.player;
  if (p.hitstop > 0) return true;
  if (p.action.kind === 'attack') return elapsed(state) >= nodeById(p.action.node).dodgeCancel;
  return ['idle','guard','counter','charge'].includes(p.action.kind);
}
function defense(state: State, command: Command, input: InputFrame): boolean {
  if (!canDefend(state)) return false;
  const p = state.player;
  p.hitstop = 0; finishPath(state);
  if (command === 'guard') { p.guardReleased = false; setAction(state,'parry'); }
  else {
    if (state.tick > p.dodgeUntil) p.dodgeChain = 0;
    p.dodgeChain++; p.dodgeUntil = state.tick + 40;
    if (input.moveX || input.moveZ) p.facing = heading({x:0,z:0},{x:input.moveX,z:input.moveZ});
    setAction(state,'dodge');
  }
  state.events.push({type:'defense_start',tick:state.tick,result:command});
  return true;
}
function transitionAttack(state: State, command: Command, input: InputFrame): boolean {
  const p = state.player; const time = elapsed(state); const node = nodeById(p.action.node);
  const after = time - (node.active[1] ?? 0);
  const beat = state.mode==='branch' && inWindow(after,TIMING.delayed) ? 'delayed' : 'normal';
  const edge = node.edges.find(e=>e.input===command && e.beat===beat);
  if (node.attackCancel === null || time < node.attackCancel || !edge) return false;
  startAttack(state,edge.to,input.aim); return true;
}
function attackInput(state: State, command: Command, input: InputFrame): boolean {
  const p = state.player; const time = elapsed(state);
  if (state.mode === 'simple' && command === 'heavy') return false;
  if (p.action.kind === 'attack') return transitionAttack(state,command,input);
  if (p.action.kind === 'dodge' && time >= TIMING.dodgeDuration && time < TIMING.dodgeDuration+TIMING.dodgeCounter) {
    if (command !== 'light') return false;
    startAttack(state,state.mode==='branch'?'hw_dodge_l':'hw_l1',input.aim); return true;
  }
  if (p.action.kind === 'counter') {
    startAttack(state,state.mode==='simple'?'hw_l1':command==='light'?'hw_parry_l':'hw_parry_h',input.aim); return true;
  }
  if (p.action.kind !== 'idle') return false;
  if (command === 'light') startAttack(state,'hw_l1',input.aim);
  else { setAction(state,'charge'); if (input.aim !== null) p.facing = input.aim; }
  return true;
}
function skillInput(state: State, command: string, input: InputFrame): boolean {
  const p = state.player;
  if (state.tick < (p.skills[command] ?? Infinity)) return false;
  if (p.action.kind !== 'idle' && !(p.action.kind==='attack' && elapsed(state)>=(nodeById(p.action.node).attackCancel ?? Infinity))) return false;
  const cooldown: Record<string,number> = {q:180,e:300,r:240,f:420};
  p.skills[command] = state.tick+(cooldown[command] ?? 180);
  finishPath(state); setAction(state,'skill',command);
  if (input.aim !== null) p.facing = input.aim;
  state.events.push({type:'skill_use',tick:state.tick,node:command}); return true;
}
export function applyInputs(state: State, input: InputFrame): void {
  const p = state.player;
  for (const command of input.pressed) {
    p.buffer = p.buffer.filter(item=>item.command!==command);
    p.buffer.push({command,at:p.actionTick});
  }
  p.buffer = p.buffer.filter(item=>p.actionTick-item.at<TIMING.inputBuffer);
  // 방어는 공격보다 먼저 소비하여 같은 틱의 히트스톱도 즉시 끊는다.
  p.buffer.sort((a,b)=>Number(['dodge','guard'].includes(b.command))-Number(['dodge','guard'].includes(a.command)));
  for (const item of p.buffer) {
    const defensive = item.command==='guard' || item.command==='dodge';
    if (!defensive && p.hitstop>0) continue;
    const used = defensive ? defense(state,item.command,input) : ['light','heavy'].includes(item.command)
      ? attackInput(state,item.command,input) : skillInput(state,item.command,input);
    if (used) {
      state.events.push({type:'input_applied',tick:state.tick,result:item.command});
      p.buffer = p.buffer.filter(entry=>entry!==item); break;
    }
  }
}
export function advanceAction(state: State, input: InputFrame): void {
  const p = state.player; const time = elapsed(state); const kind = p.action.kind;
  if (kind==='parry' && !input.guardHeld) p.guardReleased = true;
  if (kind==='parry' && time>=TIMING.parry[1]!) setAction(state,p.guardReleased?'recovery':'guard');
  if (kind==='guard' && !input.guardHeld) { setAction(state,'recovery','guard_release'); }
  if (kind==='charge' && (time>=TIMING.charge || !input.heavyHeld)) startAttack(state,time>=TIMING.charge?'hw_charge':'hw_h1',input.aim);
  if (kind==='counter' && time>=TIMING.parryCounter) setAction(state,'idle');
  if (kind==='skill' && time>=18) setAction(state,'idle');
  if (kind==='recovery' && time>=(p.action.node==='guard_release'?3:p.action.node==='guard_break'?30:TIMING.parryFailure)) setAction(state,'idle');
  const dodgeEnd = TIMING.dodgeDuration + (p.dodgeChain>=3?TIMING.dodgeTired:TIMING.dodgeCounter);
  if (kind==='dodge' && time>=dodgeEnd) setAction(state,'idle');
  if (kind==='attack') finishAttack(state,time);
}
function finishAttack(state: State, time: number): void {
  const node = nodeById(state.player.action.node);
  const reset = node.edges.length ? Math.max(node.duration,(node.active[1] ?? 0)+16) : node.duration;
  if (time>=reset) { finishPath(state); setAction(state,'idle'); }
  else if (node.id==='hw_l1' && time===(node.active[1] ?? 0)+7 && state.player.hitstop===0) {
    state.events.push({type:'beat_window',tick:state.tick,node:node.id});
  }
}
export function movePlayer(state: State, input: InputFrame): void {
  const p = state.player; const kind = p.action.kind; const time = elapsed(state);
  if (p.hitstop>0) return;
  if (kind==='dodge' && time<TIMING.dodgeDuration) { move(p,p.facing,290); return; }
  if (kind==='attack' && p.action.node==='hw_charge' && time>=2 && time<6) move(p,p.facing,650);
  if (kind==='skill' && p.action.node==='r' && time<8) move(p,p.facing,625);
  if (kind==='idle' || kind==='guard') {
    if (input.moveX || input.moveZ) { p.facing = heading({x:0,z:0},{x:input.moveX,z:input.moveZ}); move(p,p.facing,kind==='guard'?55:145); }
  }
}
