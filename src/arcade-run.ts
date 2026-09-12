import {GameState,distance,clamp,type Mode,type Point,type Person} from './game-state.ts';
import {buildStats,type Build,type Profile,type RunResult} from './progression.ts';
import {interiorStats,type Furniture} from './interior.ts';

export class ArcadeRun extends GameState {
 stage:number;build:Build;stats:ReturnType<typeof buildStats>;goal:number;duration:number;requiredPerfects:number;
 elapsed=0;cooldown=0;perfects=0;attempts=0;streak=0;bestStreak=0;damage=0;manualServices=0;result:RunResult|null=null;
 started=false;invulnerable=0;lastService=-10;lastJudgment='';judgmentLife=0;skillPulse=0;lastFocus:Point={x:440,y:330};private fortune:number;interior:Furniture[];theme:Profile['theme'];risk:boolean;
 constructor(mode:Mode,stage:number,profile:Profile,risk=false){super(mode);this.stage=stage;this.build=[...profile.build];this.stats=buildStats(this.build,stage);this.fortune=profile.levels.fortune;this.interior=[...profile.interior];this.theme=profile.theme;this.risk=risk;
  this.damageMultiplier=this.stats.power*(1+profile.levels.power*.08);this.attackRateMultiplier=this.stats.speed;this.mobilityMultiplier=this.stats.mobility;this.elementalCombo=this.stats.shatter;
  this.duration=risk?75:90;this.goal=Math.ceil((mode==='landlord'?220+stage*100:9+stage*4)*(risk?1.15:1));this.requiredPerfects=1+Math.floor(stage/2);this.money=mode==='hunt'?0:mode==='defense'?185:70;
  this.status='준비되면 도전을 시작하세요.';
 }
 get progress(){return this.mode==='landlord'?this.earned:this.kills;}
 get meter(){const n=(this.elapsed*(.48+this.stage*.035))%2;return n<=1?n:2-n;}
 get perfectWidth(){return Math.max(.045,.105-this.stage*.007);}
 get difficulty(){return (1+(this.stage-1)*.21)*(this.risk?1.2:1);}
 override gain(amount:number,p:Point){const reward=Math.max(1,Math.round(amount*(this.mode==='landlord'?(1+this.fortune*.06)*interiorStats(this.interior).multiplier:1)));super.gain(reward,p);}
 override click(p:Point){if(!this.started||this.result||this.choices)return;this.lastFocus={...p};super.click(p);}
 override action(index:number){if(!this.started||this.result)return;super.action(index);}
 override serve(c:Person,manual=false){if(manual){this.manualServices++;if(this.elapsed-this.lastService<4)this.combo++;else this.combo=0;this.lastService=this.elapsed;}super.serve(c,false);if(manual&&this.combo>0)this.gain(Math.min(18,this.combo*2),{x:c.x,y:c.y-10});}
 activateSkill(){if(!this.started||this.result||this.choices||this.cooldown>0)return false;this.attempts++;
  const error=Math.abs(this.meter-.5);const perfect=error<=this.perfectWidth,good=error<=.23;
  this.cooldown=perfect?3:good?3.8:4.5;this.judgmentLife=1.2;this.skillPulse=.6;
  if(perfect){this.perfects++;this.streak++;this.bestStreak=Math.max(this.bestStreak,this.streak);}else if(!good)this.streak=0;
  const factor=perfect?2:good?1:.3;this.lastJudgment=perfect?`PERFECT · ${this.streak}연속`:good?'GOOD':'MISS · 다시 조준';
  this.status=perfect?'정밀 성공! 스킬 위력 2배, 연속 보너스 획득.':good?'스킬 발동. 중앙의 좁은 구간을 노려보세요.':'빗나갔어요. 연속 보너스가 초기화됩니다.';
  if(this.mode==='defense'){const center=this.enemies.find(e=>e.progress===Math.max(...this.enemies.map(e=>e.progress)))??this.lastFocus;this.lastFocus={...center};for(const e of this.enemies)if(distance(e,center)<(perfect?200:145)){e.hp-=55*this.damageMultiplier*factor;e.flash=.2;this.burst(e,'#f8db9e',6);} }
  if(this.mode==='hunt'){this.invulnerable=perfect?1.4:.6;for(const e of this.enemies)if(distance(e,this.player)<210){e.hp-=50*this.damageMultiplier*factor;e.flash=.2;this.burst(e,'#a5f0df',6);}if(good){const d=distance(this.target,this.player)||1;this.player.x=clamp(this.player.x+(this.target.x-this.player.x)/d*75,45,915);this.player.y=clamp(this.player.y+(this.target.y-this.player.y)/d*75,100,570);}}
  if(this.mode==='landlord'&&good){this.customers.filter(c=>c.phase===1).slice(0,perfect?6:2).forEach(c=>this.serve(c,true));}
  if(good)this.gain(Math.round((perfect?20:8)*(1+Math.min(5,this.streak)*.12)),this.mode==='hunt'?this.player:this.lastFocus);
  this.sound(perfect?'upgrade':'hit');return true;
 }
 override update(dt:number,keys:Point={x:0,y:0}){
  if(!this.started||this.result)return;
  this.judgmentLife=Math.max(0,this.judgmentLife-dt);this.skillPulse=Math.max(0,this.skillPulse-dt);
  if(this.choices)return;
  this.elapsed+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.invulnerable=Math.max(0,this.invulnerable-dt);
  const id=this.nextId,hp=this.health;super.update(dt,keys);
  for(const e of this.enemies)if(e.id>=id){e.hp*=this.difficulty;e.maxHp*=this.difficulty;e.speed*=1+(this.stage-1)*.07;}
  if(this.invulnerable>0)this.health=hp;else if(this.health<hp){this.damage+=hp-this.health;this.streak=0;}
  if(this.mode==='landlord'){
   const patience=14-this.stage;for(const c of this.customers)if(c.phase===1&&c.timer>patience){c.phase=2;this.damage++;this.streak=0;this.float(c,'대기 초과','#eea083');}
   if(this.shopLevel<4&&this.elapsed>45&&this.stage>=3)this.spawnTimer=Math.min(this.spawnTimer,.9);
  }
  if(this.progress>=this.goal&&this.perfects>=this.requiredPerfects)this.finish(true);
  else if(this.health<=0||this.elapsed>=this.duration)this.finish(false);
 }
 finish(success:boolean){if(this.result)return;const accuracy=this.attempts?this.perfects/this.attempts:0;
  const grade:RunResult['grade']=!success?'C':accuracy>=.65&&this.damage<=2&&this.elapsed<=75?'S':accuracy>=.35&&this.damage<=6?'A':'B';
  const gradeMultiplier={S:1.8,A:1.4,B:1,C:.2}[grade];const baseReward=100+this.stage*45;
  const effort=success?1:Math.min(1,this.progress/this.goal);const buildMultiplier=this.stats.reward*(1+this.fortune*.06)*(this.risk?1.35:1);
  this.result={id:`run:${Date.now()}:${Math.random().toString(36).slice(2)}`,mode:this.mode,stage:this.stage,success,grade,baseReward,gradeMultiplier,buildMultiplier,reward:Math.floor(baseReward*gradeMultiplier*buildMultiplier*effort),perfects:this.perfects,attempts:this.attempts,maxCombo:this.bestStreak,progress:this.progress,goal:this.goal,elapsed:Math.round(this.elapsed),damage:this.damage,build:[...this.build]};
 }
}
