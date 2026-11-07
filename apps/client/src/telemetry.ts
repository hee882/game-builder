import { CONTENT } from '@yeonmu/sim';
import type { Mode, SimEvent, State } from '@yeonmu/sim';
import type { PendingInput } from './input';

interface RecordEntry { type:string; at:string; sessionId:string; mode:Mode; build:string; data:unknown }
export class Telemetry {
  readonly sessionId=crypto.randomUUID();
  readonly records:RecordEntry[]=[];
  readonly latency:number[]=[];
  private guards=0;
  private ticks=0;
  private pendingFrames:PendingInput[]=[];
  storageStatus='로컬 저장 준비';
  constructor(readonly mode: Mode) { this.record('session_start',{contentVersion:CONTENT.version}); }
  record(type:string,data:unknown):void {
    this.records.push({type,at:new Date().toISOString(),sessionId:this.sessionId,mode:this.mode,build:CONTENT.version,data});
    if(this.records.length>12000) this.records.shift();
  }
  events(events:SimEvent[]):void {
    for(const event of events) {
      this.record(event.type,event);
      if(event.type==='combo_path') this.pathEntropy();
    }
  }
  private pathEntropy():void {
    const counts=new Map<string,number>();
    for(const record of this.records) {
      if(record.type!=='combo_path' || typeof record.data!=='object' || record.data===null || !('path' in record.data) || typeof record.data.path!=='string') continue;
      counts.set(record.data.path,(counts.get(record.data.path)??0)+1);
    }
    const total=[...counts.values()].reduce((sum,count)=>sum+count,0);
    const entropy=[...counts.values()].reduce((sum,count)=>{const p=count/total;return sum-p*Math.log2(p);},0);
    this.record('combo_path_entropy',{entropy,paths:total,scope:'session'});
  }
  sample(state:State):void {
    this.ticks++; if(state.player.action.kind==='guard') this.guards++;
    if(this.ticks%150===0) { this.record('guard_hold_ratio',{ratio:this.guards/this.ticks});this.save(); }
  }
  reaction(input:PendingInput|undefined):void { if(input) this.pendingFrames.push(input); }
  rendered():void {
    const now=performance.now();
    for(const input of this.pendingFrames.splice(0)) {
      const milliseconds=now-input.time;this.latency.push(milliseconds);
      this.record('input_first_frame',{command:input.command,source:input.source,milliseconds,method:'event-handler-to-render-submit',physicalDisplayVerified:false});
    }
  }
  save():void {
    try {
      const data=JSON.stringify(this.records);
      localStorage.setItem(`yeonmu-p0-${this.sessionId}`,data);
      localStorage.setItem('yeonmu-p0-latest',data);this.storageStatus='이 기기에 저장됨';
    }
    catch {this.storageStatus='저장 공간 제한 · JSON 내려받기 사용';}
  }
  download():void {
    this.save();
    const url=URL.createObjectURL(new Blob([JSON.stringify(this.records,null,2)],{type:'application/json'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=`yeonmu-${this.mode}-${this.sessionId}.json`;anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
}
