import { createState, FixedStepper, nodeById, step } from '@yeonmu/sim';
import type { Mode, State } from '@yeonmu/sim';
import { CombatAudio } from './audio';
import { Controls } from './input';
import { ArenaRenderer } from './renderer';
import { Telemetry } from './telemetry';
import { element, mount, updateHud } from './ui';
import './style.css';

mount();
const mode:Mode=new URLSearchParams(location.search).get('mode')==='simple'?'simple':'branch';
let state=createState(mode);let telemetry=new Telemetry(mode);
let paused=true;let started=false;let preview='';let previewTick=0;let ended=false;
const audio=new CombatAudio();const fixed=new FixedStepper();
const arena=new ArenaRenderer(element('#arena'));
const controls=new Controls(arena.renderer.domElement,()=>audio.unlock());
element<HTMLSelectElement>('#mode').value=mode;
arena.renderer.domElement.addEventListener('pointermove',event=>{controls.aim=arena.aim(event.clientX,event.clientY,state);});

function pause(value:boolean):void {
  paused=value;controls.active=!paused && !preview;controls.clear();fixed.reset();
  previousTime=performance.now();
  element('#pause').textContent=paused?'계속하기':'일시 정지';
}
element('#start').addEventListener('click',()=>{
  if(ended) restart();
  started=true;audio.unlock();element('#overlay').hidden=true;pause(false);
  element<HTMLButtonElement>('#start').blur();
});
element('#pause').addEventListener('click',()=>{if(started) pause(!paused);element<HTMLButtonElement>('#pause').blur();});
element('#restart').addEventListener('click',()=>{restart();element<HTMLButtonElement>('#restart').blur();});
element('#export').addEventListener('click',()=>telemetry.download());
element('#mode').addEventListener('change',()=>{
  telemetry.record('comparison_switch',{tick:state.tick});telemetry.save();
  location.search=`?mode=${element<HTMLSelectElement>('#mode').value}`;
});
element('#sound').addEventListener('change',()=>{audio.enabled=element<HTMLInputElement>('#sound').checked;audio.unlock();});
element('#zoom').addEventListener('change',()=>{arena.zoom=element<HTMLInputElement>('#zoom').checked?2:1;});
element('#shake').addEventListener('input',()=>{arena.shake=Number(element<HTMLInputElement>('#shake').value);});
element('#preview').addEventListener('change',()=>{
  preview=element<HTMLSelectElement>('#preview').value;previewTick=0;controls.clear();pause(true);
  element('#overlay').hidden=preview!=='' || started;
});
document.addEventListener('visibilitychange',()=>{if(document.hidden) pause(true);});
window.addEventListener('blur',()=>{if(started) pause(true);});
window.addEventListener('pagehide',()=>telemetry.save());

function restart():void {
  telemetry.record('attempt_end',{tick:state.tick,status:state.status});telemetry.save();
  state=createState(mode);telemetry=new Telemetry(mode);ended=false;preview='';
  element<HTMLSelectElement>('#preview').value='';started=true;element('#overlay').hidden=true;pause(false);
}
function simulate():void {
  const previous=state;state=step(state,controls.frame());
  for(const event of state.events) if(event.type==='input_applied' && event.result) telemetry.reaction(controls.takeReaction(event.result));
  if(state.player.x!==previous.player.x || state.player.z!==previous.player.z) telemetry.reaction(controls.takeReaction('move'));
  telemetry.events(state.events);telemetry.sample(state);audio.events(state.events);arena.events(state.events,state);
  if(state.status!=='playing' || state.tick>=18000) endAttempt();
}
function endAttempt():void {
  if(ended) return;ended=true;pause(true);
  const reason=state.status==='won'?'수련을 마쳤습니다':state.status==='lost'?'한 수를 돌아볼 시간':'10분 전투 기록을 마쳤습니다';
  telemetry.record('attempt_end',{status:state.status,tick:state.tick,nodes:state.player.seen});telemetry.save();
  element('#overlay').hidden=false;element('#overlay h2').textContent=reason;
  const last=state.events.find(event=>event.type==='death_cause');
  element('#overlay .intro p:not(.eyebrow)').textContent=`발견한 동작 ${state.player.seen.length}/14${last?.attack?` · 마지막 피격: ${last.attack}`:''}. 기록을 내려받거나 같은 조건으로 다시 도전하세요.`;
  element('#start').textContent='다시 도전';
}
function previewState():State {
  const demo=createState(mode);const node=nodeById(preview);
  demo.player.x=0;demo.player.z=2500;demo.player.facing=4;
  demo.player.action={kind:'attack',node:preview,start:0,hitTargets:[]};
  demo.player.actionTick=Math.floor(previewTick/ (1000/30))%(node.duration+15);
  return demo;
}
let previousTime=performance.now();let lastHud=0;
function frame(now:number):void {
  const delta=now-previousTime;previousTime=now;
  if(!paused && !preview) {
    const dropped=fixed.advance(delta,()=>{if(!paused) simulate();});
    if(dropped>0) telemetry.record('frame_time_discarded',{milliseconds:dropped});
  }
  if(preview) previewTick+=Math.min(delta,100);
  const visible=preview?previewState():state;
  arena.render(visible,now);telemetry.rendered();
  if(now-lastHud>80) {updateHud(visible,telemetry,arena.clip);lastHud=now;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

declare global { interface Window { yeonmu: {inspect:()=>unknown} } }
window.yeonmu={inspect:()=>({state:structuredClone(state),render:arena.inspect(preview?previewState():state),paused,preview,telemetry:telemetry.records.slice(-30),latency:telemetry.latency})};
