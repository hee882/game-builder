export type Mode = 'branch' | 'simple';
export type Command = 'light' | 'heavy' | 'dodge' | 'guard' | 'q' | 'e' | 'r' | 'f';
export interface Vec { x: number; z: number }
export interface InputFrame {
  moveX: number; moveZ: number; aim: number | null;
  pressed: Command[]; guardHeld: boolean; heavyHeld: boolean;
}
export const EMPTY_INPUT: InputFrame = { moveX: 0, moveZ: 0, aim: null, pressed: [], guardHeld: false, heavyHeld: false };
export type ActionKind = 'idle' | 'attack' | 'charge' | 'dodge' | 'parry' | 'counter' | 'guard' | 'recovery' | 'skill';
export interface Action { kind: ActionKind; node: string; start: number; hitTargets: string[] }
export interface Buffered { command: Command; at: number }
export interface PathRecord { path: string; tick: number }
export interface Player extends Vec {
  hp: number; guard: number; facing: number; actionTick: number; hitstop: number;
  action: Action; buffer: Buffered[]; dodgeChain: number; dodgeUntil: number;
  perfectUntil: number; invulnerableUntil: number; guardReleased: boolean;
  skills: Record<string, number>; seen: string[]; path: string[]; history: PathRecord[];
}
export type EnemyKind = 'reed' | 'shield' | 'porter' | 'hat';
export interface Enemy extends Vec {
  id: string; kind: EnemyKind; hp: number; maxHp: number; facing: number;
  attack: string | null; attackStart: number; nextAttack: number;
  target: Vec; hitPlayer: boolean; staggerUntil: number; guardBrokenUntil: number;
  sequence: number; phase: number; mimicPath: string; mimicReady: boolean;
}
export interface SimEvent {
  type: string; tick: number; node?: string; enemy?: string; attack?: string;
  amount?: number; result?: string; path?: string;
}
export interface State {
  tick: number; mode: Mode; player: Player; enemies: Enemy[]; events: SimEvent[];
  status: 'playing' | 'won' | 'lost';
}
