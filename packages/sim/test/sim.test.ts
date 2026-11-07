import { describe, expect, it } from 'vitest';
import { createState, EMPTY_INPUT, elapsed, FixedStepper, makeEnemy, nodeById, step } from '../src/index';
import type { Command, InputFrame, State } from '../src/index';

function input(pressed: Command[]=[], extra: Partial<InputFrame>={}): InputFrame {
  return {...EMPTY_INPUT,pressed,...extra};
}
function arena(): State { const state=createState(); state.enemies=[]; return state; }
function tickTo(state: State, time: number): State {
  let result=state;
  for (let i=0;i<120 && elapsed(result)<time;i++) result=step(result,EMPTY_INPUT);
  expect(elapsed(result)).toBe(time); return result;
}
function actionState(node: string, time: number): State {
  const state=arena(); state.player.action={kind:'attack',node,start:0,hitTargets:[]};
  state.player.actionTick=time; state.player.path=[node]; return state;
}
function incoming(time: number, attack='reed_slash'): State {
  const state=arena(); state.player.x=0; state.player.z=0;
  const enemy=makeEnemy('test','reed',0,1000);
  enemy.facing=4; enemy.attack=attack; enemy.attackStart=-12+time; enemy.nextAttack=9999;
  state.enemies=[enemy]; return state;
}

describe('공유 sim 결정성과 시계',()=>{
  it('같은 입력 900틱 → 매 틱 같은 상태, 원본 상태 불변',()=>{
    let a=createState(); let b=createState();
    for(let tick=0;tick<900;tick++) {
      const frame=input(tick%11===0?['light']:tick%41===0?['dodge']:[],{moveX:tick%80<40?1:-1,moveZ:-1});
      const before=structuredClone(a);
      const next=step(a,frame); b=step(b,frame);
      expect(a).toEqual(before); expect(next).toEqual(b); a=next;
    }
  });
  it('고정 스텝은 렌더 프레임 분할에 무관하게 30Hz를 유지한다',()=>{
    const a=new FixedStepper(); const b=new FixedStepper(); let left=0; let right=0;
    for(let i=0;i<60;i++) a.advance(1000/60,()=>left++);
    for(let i=0;i<30;i++) b.advance(1000/30,()=>right++);
    expect(left).toBe(30); expect(right).toBe(30);
  });
  it('히트스톱 중 박자·캔슬 창과 입력 버퍼의 로컬 나이는 불변이다',()=>{
    let state=actionState('hw_l1',12); state.player.hitstop=6;
    state=step(state,input(['light']));
    for(let i=0;i<5;i++) {
      expect(elapsed(state)).toBe(12); expect(state.player.buffer[0]?.at).toBe(12);
      expect(state.player.action.node).toBe('hw_l1'); state=step(state,EMPTY_INPUT);
    }
    expect(state.player.actionTick).toBe(12);
    state=step(state,EMPTY_INPUT); expect(state.player.action.node).toBe('hw_dl');
  });
  it('히트스톱 길이 0·2·6틱에서도 같은 로컬 박자 입력은 같은 지연 노드를 선택한다 C13',()=>{
    for(const stop of [0,2,6]) {
      let state=actionState('hw_l1',12); state.player.hitstop=stop;
      state=step(state,input(['light']));
      for(let i=0;i<stop;i++) state=step(state,EMPTY_INPUT);
      expect(state.player.action.node).toBe('hw_dl');
    }
  });
  it('히트스톱 동안 튕겨내기 창의 actionTick 경계는 불변이다',()=>{
    let state=arena(); state.player.action={kind:'parry',node:'',start:0,hitTargets:[]};
    state.player.actionTick=3; state.player.hitstop=4;
    for(let i=0;i<4;i++) { state=step(state,input([],{guardHeld:true})); expect(elapsed(state)).toBe(3); }
    expect(state.player.action.kind).toBe('parry');
  });
  it('방어 입력은 히트스톱을 즉시 해제하고 튕겨내기 창을 서버 틱 최소 5틱 보장한다',()=>{
    for(let offset=0;offset<=5;offset++) {
      let state=incoming(offset); state.player.hitstop=6;
      state=step(state,input(['guard'],{guardHeld:false}));
      const outcomes=state.events.map(e=>e.result);
      for(let i=0;i<offset;i++) {state=step(state,EMPTY_INPUT); outcomes.push(...state.events.map(e=>e.result));}
      expect(outcomes.includes('parried')).toBe(offset<5);
      if(offset===0) expect(state.player.action.kind).toBe('counter');
      if(offset===5) expect(state.player.hp).toBe(92);
    }
  });
  it('회피 입력도 히트스톱을 해제한다',()=>{
    const state=actionState('hw_h1',8); state.player.hitstop=3;
    const next=step(state,input(['dodge']));
    expect(next.player.hitstop).toBe(0); expect(next.player.action.kind).toBe('dodge'); expect(elapsed(next)).toBe(1);
  });
  it('적 타임라인과 텔레그래프는 플레이어 히트스톱으로 밀리지 않는다',()=>{
    let a=incoming(5); let b=structuredClone(a); b.player.hitstop=20;
    const hitA:number[]=[]; const hitB:number[]=[];
    for(let i=0;i<10;i++) {
      a=step(a,EMPTY_INPUT); b=step(b,EMPTY_INPUT);
      if(a.events.some(e=>e.result==='hit')) hitA.push(a.tick);
      if(b.events.some(e=>e.result==='hit')) hitB.push(b.tick);
    }
    expect(hitA).toEqual([6]); expect(hitB).toEqual(hitA);
  });
});

describe('환도 그래프와 실제 판정',()=>{
  it('기본 4연타, 올려베기, 삼연 찌르기, 지연 내려찍기와 H-H 간선을 재생한다',()=>{
    const routes: [string,number,Command,string][]=[
      ['hw_l1',5,'light','hw_l2'],['hw_l2',5,'light','hw_l3'],['hw_l3',5,'light','hw_l4'],
      ['hw_l2',5,'heavy','hw_llh'],['hw_l3',5,'heavy','hw_lllh'],['hw_l1',12,'light','hw_dl'],
      ['hw_dl',6,'heavy','hw_dlh'],['hw_h1',15,'heavy','hw_hh'],
    ];
    for(const [from,time,key,to] of routes) expect(step(actionState(from,time),input([key])).player.action.node).toBe(to);
  });
  it('박자 경계 11=일반, 12~20=지연, 21=리셋을 지킨다',()=>{
    for(const [time,target] of [[11,'hw_l2'],[12,'hw_dl'],[20,'hw_dl'],[21,'hw_l1']] as const) {
      expect(step(actionState('hw_l1',time),input(['light'])).player.action.node).toBe(target);
    }
  });
  it('차지 18틱, 회피 직후 L, 성공 튕겨내기 L/H로 나머지 노드에 진입한다',()=>{
    let charge=step(arena(),input(['heavy'],{heavyHeld:true}));
    for(let i=0;i<18;i++) charge=step(charge,input([],{heavyHeld:true}));
    expect(charge.player.action.node).toBe('hw_charge');
    let dodge=step(arena(),input(['dodge'])); dodge=tickTo(dodge,13);
    expect(step(dodge,input(['light'])).player.action.node).toBe('hw_dodge_l');
    for(const key of ['light','heavy'] as const) {
      let parry=step(incoming(0),input(['guard']));
      for(let i=0;i<3;i++) parry=step(parry,EMPTY_INPUT);
      expect(step(parry,input([key])).player.action.node).toBe(key==='light'?'hw_parry_l':'hw_parry_h');
    }
  });
  it('공격 캔슬 전 입력은 5틱 버퍼에서 기다리고 L4는 공격 캔슬 불가다',()=>{
    let state=step(actionState('hw_l1',2),input(['light']));
    state=tickTo(state,5); expect(step(state,EMPTY_INPUT).player.action.node).toBe('hw_l2');
    expect(step(actionState('hw_l4',8),input(['light'])).player.action.node).toBe('hw_l4');
  });
  it('동일 히트는 대상당 한 번, 다중 대상 히트스톱은 합산하지 않는다',()=>{
    let state=actionState('hw_l1',3); state.player.x=0; state.player.z=0; state.player.facing=0;
    state.enemies=[makeEnemy('a','reed',0,1000),makeEnemy('b','reed',300,1000)];
    state=step(state,EMPTY_INPUT);
    expect(state.enemies.map(e=>e.hp)).toEqual([53,53]); expect(state.player.hitstop).toBe(1);
    for(let i=0;i<3;i++) state=step(state,EMPTY_INPUT);
    expect(state.enemies.map(e=>e.hp)).toEqual([53,53]);
  });
  it('삼연 찌르기는 서로 다른 3개 판정 마커로 적중한다',()=>{
    let state=actionState('hw_lllh',0); state.player.x=0;state.player.z=0;state.player.facing=0;
    state.enemies=[makeEnemy('a','shield',0,1200)]; state.enemies[0]!.guardBrokenUntil=9999;
    state.enemies[0]!.nextAttack=9999; let hits=0;
    for(let i=0;i<25;i++) { state=step(state,EMPTY_INPUT);hits+=state.events.filter(e=>e.type==='hit').length; }
    expect(hits).toBe(3);
  });
  it('방패 정면 약공은 막히고 지연 베기는 가드를 넘긴다',()=>{
    for(const [node,damage] of [['hw_l1',0],['hw_dl',24]] as const) {
      const state=actionState(node,nodeById(node).active[0]!); state.player.x=0;state.player.z=0;state.player.facing=0;
      const shield=makeEnemy('shield','shield',0,1000);shield.facing=4;state.enemies=[shield];
      expect(step(state,EMPTY_INPUT).enemies[0]!.hp).toBe(160-damage);
    }
  });
  it('홀드는 5틱 뒤 막기로, 탭 실패는 10틱 후딜로 전환한다',()=>{
    for(const hold of [true,false]) {
      let state=step(arena(),input(['guard'],{guardHeld:hold}));
      for(let i=0;i<5;i++) state=step(state,input([],{guardHeld:hold}));
      expect(state.player.action.kind).toBe(hold?'guard':'recovery');
    }
  });
  it('단순/분기 모드는 같은 적 구성으로 시작하고 지연 분기만 달라진다',()=>{
    expect(createState('simple').enemies).toEqual(createState('branch').enemies);
    const state=actionState('hw_l1',12); state.mode='simple';
    expect(step(state,input(['light'])).player.action.node).toBe('hw_l2');
  });
});
