import { advanceAction, applyInputs, movePlayer } from './actions';
import { updateEnemies } from './enemies';
import { playerHits } from './hits';
import { cloneState } from './state';
import type { InputFrame, State } from './types';
export * from './types';
export * from './content';
export * from './geometry';
export { createState, makeEnemy } from './state';
export { elapsed } from './actions';

export function step(previous: State, input: InputFrame): State {
  const state=cloneState(previous);
  if (state.status!=='playing') return state;
  const p=state.player;
  advanceAction(state,input);
  applyInputs(state,input);
  movePlayer(state,input);
  // 새 타격이 적용한 정지량도 다음 actionTick 진행부터 정확히 소비한다.
  playerHits(state);
  updateEnemies(state);
  if (p.hitstop>0) p.hitstop--; else p.actionTick++;
  if (p.action.kind!=='guard') p.guard=Math.min(100,p.guard+1);
  p.history=p.history.filter(item=>state.tick-item.tick<=900);
  if (p.hp<=0) state.status='lost';
  else if (state.enemies.length>0 && state.enemies.every(enemy=>enemy.hp<=0)) state.status='won';
  state.tick++;
  return state;
}

export class FixedStepper {
  private accumulator=0;
  advance(milliseconds: number, onTick: ()=>void): number {
    // 비활성 탭 복귀 시 긴 추격 루프를 막고 폐기 시간을 호출자에게 돌려준다.
    const accepted=Math.max(0,Math.min(milliseconds,250));
    this.accumulator+=accepted;
    while (this.accumulator>=1000/30) { onTick(); this.accumulator-=1000/30; }
    return Math.max(0,milliseconds-accepted);
  }
  reset(): void { this.accumulator=0; }
}
