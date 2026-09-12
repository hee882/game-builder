import {GameState,distance,clamp,type Mode,type Point,type Person} from './game-state.ts';
import {buildStats,type Build,type Profile,type RunResult} from './progression.ts';
import {interiorStats,type Furniture} from './interior.ts';
export type HuntSkillId='pulse'|'dash'|'gravity';
export const huntSkills:Record<HuntSkillId,{name:string;description:string;symbol:string;color:string}>={
 pulse:{name:'회피 · 충격파',description:'주변 210 거리 타격 · 좋은 판정이면 짧은 회피',symbol:'◎',color:'#a5f0df'},
 dash:{name:'대시 베기',description:'목표 방향 120 거리 돌진 · 경로 34 폭의 적을 베기 · 정밀이면 170 거리',symbol:'➤',color:'#ffd5a1'},
 gravity:{name:'중력 우물',description:'목표점 주변 200 거리의 적을 끌어당겨 타격 · 시전 사거리 200',symbol:'◉',color:'#c9a4f5'}
};

export class ArcadeRun extends GameState {
 stage:number;build:Build;stats:ReturnType<typeof buildStats>;goal:number;duration:number;requiredPerfects:number;
 elapsed=0;cooldown=0;perfects=0;attempts=0;streak=0;bestStreak=0;damage=0;manualServices=0;result:RunResult|null=null;
 huntSkill:HuntSkillId='pulse';private lastMovedAt=-Infinity;
 started=false;invulnerable=0;lastService=-10;lastJudgment='';judgmentLife=0;skillPulse=0;lastFocus:Point={x:440,y:330};private fortune:number;interior:Furniture[];theme:Profile['theme'];risk:boolean;
 constructor(mode:Mode,stage:number,profile:Profile,risk=false){super(mode);this.stage=stage;this.build=[...profile.build];this.stats=buildStats(this.build,stage);this.fortune=profile.levels.fortune;this.interior=[...profile.interior];this.theme=profile.theme;this.risk=risk;
  this.damageMultiplier=this.stats.power*(1+profile.levels.power*.08);this.attackRateMultiplier=this.stats.speed;this.mobilityMultiplier=this.stats.mobility;this.elementalCombo=this.stats.shatter;
  this.enemyHealthMultiplier=this.difficulty;this.enemySpeedMultiplier=1+(this.stage-1)*.07;
  this.chainDamage=this.stats.chainDamage;this.healOnKill=this.stats.healOnKill;
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
 override serve(c:Person,manual=false){if(c.phase!==1)return;if(manual){this.manualServices++;if(this.elapsed-this.lastService<4)this.combo++;else this.combo=0;this.lastService=this.elapsed;}super.serve(c,false);if(manual&&this.combo>0)this.gain(Math.min(18,this.combo*2),{x:c.x,y:c.y-10});}
 selectHuntSkill(id:HuntSkillId){if(this.mode!=='hunt'||this.result||this.cooldown>0||this.choices||!Object.hasOwn(huntSkills,id))return false;this.huntSkill=id;return true;}
 protected override takeDamage(amount:number){if(this.invulnerable>0)return;const hp=this.health;super.takeDamage(amount);this.damage+=hp-this.health;if(this.health<hp)this.streak=0;}
 private useHuntSkill(factor:number,perfect:boolean,good:boolean){
  const skill=huntSkills[this.huntSkill];
  if(this.huntSkill==='pulse'){
   this.invulnerable=perfect?1.4:.6;
   for(const e of this.enemies)if(distance(e,this.player)<210){this.damageEnemy(e,50*this.damageMultiplier*factor);this.burst(e,skill.color,6);}
   if(good){const d=distance(this.target,this.player)||1;this.player.x=clamp(this.player.x+(this.target.x-this.player.x)/d*75,45,915);this.player.y=clamp(this.player.y+(this.target.y-this.player.y)/d*75,100,570);}
  }else if(this.huntSkill==='dash'){
   const start={...this.player},d=distance(start,this.target),length=perfect?170:120;
   const end={x:clamp(start.x+(d?(this.target.x-start.x)/d:1)*length,45,915),y:clamp(start.y+(d?(this.target.y-start.y)/d:0)*length,100,570)};
   const dx=end.x-start.x,dy=end.y-start.y,squared=dx*dx+dy*dy;
   for(const e of this.enemies){const t=squared?clamp(((e.x-start.x)*dx+(e.y-start.y)*dy)/squared,0,1):0;
    if(distance(e,{x:start.x+dx*t,y:start.y+dy*t})<=34)this.damageEnemy(e,65*this.damageMultiplier*factor);
   }
   this.player=end;this.invulnerable=perfect?.8:.4;this.shots.push({from:start,to:end,life:.25,color:skill.color,kind:0});
  }else{
   const d=distance(this.player,this.target)||1,ratio=Math.min(1,200/d);
   const center={x:this.player.x+(this.target.x-this.player.x)*ratio,y:this.player.y+(this.target.y-this.player.y)*ratio};
   for(const e of this.enemies)if(e.hp>0&&distance(e,center)<=200){
    this.damageEnemy(e,35*this.damageMultiplier*factor);e.x+=(center.x-e.x)*.7;e.y+=(center.y-e.y)*.7;
   }
   this.lastFocus=center;this.burst(center,skill.color,20);
  }
 }
 activateSkill(){if(!this.started||this.result||this.choices||this.cooldown>0)return false;this.attempts++;
  const error=Math.abs(this.meter-.5);const perfect=error<=this.perfectWidth,good=error<=.23;
  this.cooldown=(perfect?3:good?3.8:4.5)*this.stats.skillCooldown;this.judgmentLife=1.2;this.skillPulse=.6;
  if(perfect){this.perfects++;this.streak++;this.bestStreak=Math.max(this.bestStreak,this.streak);}else if(!good)this.streak=0;
  const factor=(perfect?2:good?1:.3)*(this.mode==='hunt'&&this.elapsed-this.lastMovedAt<=.2?this.stats.movingSkillPower:1);this.lastJudgment=perfect?`PERFECT · ${this.streak}연속`:good?'GOOD':'MISS · 다시 조준';
  this.status=perfect?'정밀 성공! 스킬 위력 2배, 연속 보너스 획득.':good?'스킬 발동. 중앙의 좁은 구간을 노려보세요.':'빗나갔어요. 연속 보너스가 초기화됩니다.';
  if(this.mode==='defense'){const center=this.enemies.find(e=>e.progress===Math.max(...this.enemies.map(e=>e.progress)))??this.lastFocus;this.lastFocus={...center};for(const e of this.enemies)if(distance(e,center)<(perfect?200:145)){this.damageEnemy(e,55*this.damageMultiplier*factor);e.flash=.2;this.burst(e,'#f8db9e',6);} }
  if(this.mode==='hunt')this.useHuntSkill(factor,perfect,good);
  if(this.mode==='landlord'&&good){this.customers.filter(c=>c.phase===1).slice(0,perfect?6:2).forEach(c=>this.serve(c,true));}
  if(good)this.gain(Math.round((perfect?20:8)*(1+Math.min(5,this.streak)*.12)),this.mode==='hunt'?this.player:this.lastFocus);
  this.sound(perfect?'upgrade':'hit');return true;
 }
 override update(dt:number,keys:Point={x:0,y:0}){
  if(!this.started||this.result||!Number.isFinite(dt)||dt<0)return;
  this.judgmentLife=Math.max(0,this.judgmentLife-dt);this.skillPulse=Math.max(0,this.skillPulse-dt);
  if(this.choices)return;
  dt=Math.min(dt,Math.max(0,this.duration-this.elapsed));
  this.elapsed+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.invulnerable=Math.max(0,this.invulnerable-dt);
  const position={...this.player};super.update(dt,keys);
  if(this.mode==='hunt'&&distance(position,this.player)>.001)this.lastMovedAt=this.elapsed;
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
