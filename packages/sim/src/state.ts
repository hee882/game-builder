import type { Enemy, EnemyKind, Mode, State } from './types';

export function makeEnemy(id: string, kind: EnemyKind, x: number, z: number): Enemy {
  const hp = { reed: 65, shield: 160, porter: 120, hat: 850 }[kind];
  return { id, kind, x, z, hp, maxHp: hp, facing: 4, attack: null, attackStart: 0,
    nextAttack: 30, target: {x:0,z:0}, hitPlayer: false, staggerUntil: 0,
    guardBrokenUntil: 0, sequence: 0, phase: 1, mimicPath: '', mimicReady: false };
}
export function createState(mode: Mode = 'branch'): State {
  return { tick: 0, mode, status: 'playing', events: [],
    player: { x:0,z:4500,hp:100,guard:100,facing:4,actionTick:0,hitstop:0,
      action:{kind:'idle',node:'',start:0,hitTargets:[]},buffer:[],dodgeChain:0,
      dodgeUntil:0,perfectUntil:0,invulnerableUntil:0,guardReleased:false,
      skills:{q:0,e:0,r:0,f:0},seen:[],path:[],history:[] },
    enemies: [
      makeEnemy('reed-1','reed',-2200,700),makeEnemy('reed-2','reed',-3400,-200),
      makeEnemy('reed-3','reed',2400,600),makeEnemy('reed-4','reed',3600,-600),
      makeEnemy('shield-1','shield',-4800,-3000),makeEnemy('porter-1','porter',4300,-2900),
      makeEnemy('hat-1','hat',0,-6500),
    ],
  };
}
export function cloneState(state: State): State {
  return { ...state, events: [],
    player: { ...state.player, action: {...state.player.action,hitTargets:[...state.player.action.hitTargets]},
      buffer:state.player.buffer.map(item=>({...item})),skills:{...state.player.skills},
      seen:[...state.player.seen],path:[...state.player.path],history:state.player.history.map(item=>({...item})) },
    enemies: state.enemies.map(enemy=>({...enemy,target:{...enemy.target}})),
  };
}
