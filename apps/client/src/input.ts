import type { Command, InputFrame } from '@yeonmu/sim';

const KEYS: Readonly<Record<string,Command>> = {
  KeyJ:'light',KeyK:'heavy',KeyL:'dodge',Space:'dodge',ShiftLeft:'guard',ShiftRight:'guard',
  Semicolon:'guard',KeyQ:'q',KeyE:'e',KeyR:'r',KeyF:'f',
};
export interface PendingInput { command: string; time: number; source: string }
export class Controls {
  private held=new Set<string>();
  private edges:Command[]=[];
  pending:PendingInput[]=[];
  aim:number|null=null;
  active=false;
  constructor(canvas: HTMLCanvasElement, unlock: ()=>void) {
    window.addEventListener('keydown',event=>{
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement) return;
      if (!this.active || event.repeat) return;
      if (KEYS[event.code] || ['KeyW','KeyA','KeyS','KeyD'].includes(event.code)) {
        event.preventDefault(); unlock(); this.press(event.code,'keyboard');
      }
    });
    window.addEventListener('keyup',event=>this.held.delete(event.code));
    canvas.addEventListener('pointerdown',event=>{ if(this.active) {unlock();this.press(event.button===2?'KeyK':'KeyJ','pointer');} });
    window.addEventListener('pointerup',event=>this.held.delete(event.button===2?'KeyK':'KeyJ'));
    canvas.addEventListener('contextmenu',event=>event.preventDefault());
    window.addEventListener('blur',()=>this.clear());
  }
  private press(code: string, source: string): void {
    this.held.add(code); const command=KEYS[code];
    if (command) this.edges.push(command);
    this.pending=this.pending.filter(item=>item.command!==(command??'move'));
    this.pending.push({command:command??'move',time:performance.now(),source});
    this.pending=this.pending.slice(-40);
  }
  frame():InputFrame {
    const horizontal=Number(this.held.has('KeyD'))-Number(this.held.has('KeyA'));
    const vertical=Number(this.held.has('KeyS'))-Number(this.held.has('KeyW'));
    const result:InputFrame={moveX:horizontal+vertical,moveZ:vertical-horizontal,aim:this.aim,
      pressed:this.edges.splice(0),guardHeld:['ShiftLeft','ShiftRight','Semicolon'].some(key=>this.held.has(key)),heavyHeld:this.held.has('KeyK')};
    return result;
  }
  takeReaction(command: string):PendingInput|undefined {
    const index=this.pending.findIndex(item=>item.command===command && performance.now()-item.time<1500);
    return index<0?undefined:this.pending.splice(index,1)[0];
  }
  clear():void { this.held.clear();this.edges=[];this.pending=[]; }
}
