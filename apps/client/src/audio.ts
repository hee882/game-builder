import type { SimEvent } from '@yeonmu/sim';

export class CombatAudio {
  private context:AudioContext|null=null;
  enabled=true;
  unlock():void {
    this.context??=new AudioContext();
    if(this.context.state==='suspended') void this.context.resume();
  }
  private tone(frequency:number,duration:number,volume:number,type:OscillatorType='sine',delay=0):void {
    const ctx=this.context;if(!ctx || !this.enabled || ctx.state!=='running') return;
    const start=ctx.currentTime+delay;
    const oscillator=ctx.createOscillator();const gain=ctx.createGain();
    oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(25,frequency*0.45),start+duration);
    gain.gain.setValueAtTime(volume,start);gain.gain.exponentialRampToValueAtTime(0.001,start+duration);
    oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(start);oscillator.stop(start+duration);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  events(events:SimEvent[]):void {
    for(const event of events) {
      if(event.type==='combo_node_use' || event.type==='skill_use') this.tone(340,0.09,0.025,'sawtooth');
      if(event.type==='hit') {
        this.tone(700,0.055,0.035,'triangle'); // 접촉음은 타격 시작과 맞춘다.
        this.tone(75,0.15,0.07);this.tone(190,0.18,0.025,'sawtooth',0.025);
      }
      if(event.type==='parry_result') this.tone(event.result==='parried'?1700:110,0.2,0.07,'triangle');
      if(event.type==='beat_window') this.tone(1200,0.045,0.025,'triangle');
      if(event.type==='telegraph_start') this.tone(event.attack==='hat_sweep'?100:950,0.2,0.035,'triangle');
      if(event.type==='shield_block') this.tone(450,0.13,0.04,'square');
    }
  }
}
