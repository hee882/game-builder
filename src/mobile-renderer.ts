import {WorldRenderer} from './renderer';
import {ArcadeRun} from './arcade-run';
import {slots,roadLength,type Point} from './game-state';
import {interiorStats} from './interior';

const portraitSlots=[{x:83,y:178},{x:218,y:92},{x:91,y:333},{x:211,y:247},{x:322,y:177},{x:326,y:358}];
const portraitRoad=[{x:-20,y:106},{x:126,y:106},{x:162,y:183},{x:274,y:183},{x:271,y:301},{x:165,y:301},{x:176,y:400},{x:440,y:400}];
export class MobileRenderer extends WorldRenderer {
 height=460;
 displayScale=1;
 // Canvas is scaled to the available phone space; keep labels at least 12 CSS px.
 override text(label:string,x:number,y:number,size=14,_color='#fff',align:CanvasTextAlign='left',bold=false){
  const c=this.c,transform=c.getTransform();
  const scale=Math.max(.1,this.displayScale*Math.hypot(transform.c,transform.d));
  const readableSize=Math.max(size,(size>=14?14:12)/scale);
  c.save();
  c.font=`${bold?'700':'500'} ${readableSize}px "IBM Plex Sans KR", sans-serif`;
  const width=c.measureText(label).width;
  const left=align==='center'?x-width/2:align==='right'?x-width:x;
  c.fillStyle='#17373f';
  c.fillRect(left-3,y-readableSize,width+6,readableSize*1.3);
  c.fillStyle='#f4db9d';c.textAlign=align;c.fillText(label,x,y);
  c.restore();
 }
 y(n:number){return 25+n/460*(this.height-40);}
 point(p:Point){return {x:p.x,y:this.y(p.y)};}
 pathPoint(progress:number){const lengths=portraitRoad.slice(1).map((p,i)=>Math.hypot(p.x-portraitRoad[i].x,p.y-portraitRoad[i].y));let n=progress/roadLength*lengths.reduce((a,b)=>a+b,0);for(let i=1;i<portraitRoad.length;i++){if(n<=lengths[i-1])return this.point({x:portraitRoad[i-1].x+(portraitRoad[i].x-portraitRoad[i-1].x)*n/lengths[i-1],y:portraitRoad[i-1].y+(portraitRoad[i].y-portraitRoad[i-1].y)*n/lengths[i-1]});n-=lengths[i-1];}return this.point(portraitRoad.at(-1)!);}
 mapHunt(p:Point){return {x:22+p.x/960*376,y:35+(p.y-90)/490*(this.height-65)};}
 mapPoint(p:Point,s:ArcadeRun){if(s.mode==='hunt')return this.mapHunt(p);if(s.mode==='landlord')return {x:45+p.x/960*350,y:this.height-38-(535-p.y)/88*Math.min(76,(this.height-68)/4)};const index=slots.findIndex(t=>Math.hypot(t.x-p.x,t.y-p.y)<75);if(index>=0)return this.point(portraitSlots[index]);const enemy=s.enemies.reduce<null|typeof s.enemies[number]>((best,e)=>!best||Math.hypot(e.x-p.x,e.y-p.y)<Math.hypot(best.x-p.x,best.y-p.y)?e:best,null);return enemy?this.pathPoint(enemy.progress):{x:210,y:this.height/2};}
 input(p:Point,s:ArcadeRun):Point|null{if(s.mode==='defense'){const radius=Math.max(34,22/this.displayScale);const targets=portraitSlots.map((t,i)=>({i,dx:t.x-p.x,dy:this.y(t.y)-p.y})).filter(t=>Math.abs(t.dx)<=radius&&Math.abs(t.dy)<=radius).sort((a,b)=>Math.hypot(a.dx,a.dy)-Math.hypot(b.dx,b.dy));return targets.length?slots[targets[0].i]:null;}if(s.mode==='hunt')return {x:(p.x-22)/376*960,y:90+(p.y-35)/(this.height-65)*490};if(p.x<70||p.x>358)return null;const floor=Math.floor((this.height-38-p.y)/Math.min(76,(this.height-68)/4));return floor>=0&&floor<s.floors?{x:400,y:514-floor*88}:null;}
 override render(s:ArcadeRun){const c=this.c;c.clearRect(0,0,420,this.height);if(s.mode==='defense')this.defenseWorld(s);if(s.mode==='hunt')this.huntWorld(s);if(s.mode==='landlord')this.cafeWorld(s);
  for(const shot of s.shots){const a=this.mapPoint(shot.from,s),b=this.mapPoint(shot.to,s);c.globalAlpha=Math.min(1,shot.life*6);this.line([a,b],shot.color,2);this.ellipse(b.x,b.y,4,4,shot.color);}c.globalAlpha=1;
  if(!this.reduced)for(const p of s.particles){const point=this.mapPoint(p,s);c.globalAlpha=Math.min(.8,p.life);this.ellipse(point.x+Math.sin(p.vx)*8,point.y+Math.cos(p.vy)*8,2,2,p.color);}c.globalAlpha=1;
  for(const t of s.texts.slice(-8)){const p=this.mapPoint(t,s);c.globalAlpha=Math.min(1,t.life*2);this.text(t.text,p.x,p.y-12,12,t.color,'center',true);}c.globalAlpha=1;
  if(s.skillPulse>0){const p=s.mode==='hunt'?this.mapHunt(s.player):s.mode==='defense'?this.mapPoint(s.lastFocus,s):{x:210,y:this.height/2};c.strokeStyle='#ffe8a6';c.globalAlpha=s.skillPulse;c.lineWidth=3;c.beginPath();c.arc(p.x,p.y,(.65-s.skillPulse)*150,0,Math.PI*2);c.stroke();c.globalAlpha=1;}
  if(s.judgmentLife>0){this.rect(86,15,248,33,'#142e39e8',16);this.text(s.lastJudgment,210,37,15,s.lastJudgment.startsWith('PERFECT')?'#ffe8a6':'#c0e5da','center',true);}
 }
 defenseWorld(s:ArcadeRun){this.rect(0,0,420,this.height,'#8ea884');this.polygon([{x:0,y:0},{x:420,y:0},{x:420,y:95},{x:335,y:67},{x:211,y:102},{x:82,y:61},{x:0,y:81}],'#76977b');
  for(let i=0;i<64;i++){const x=i*67%415,y=40+i*47%(this.height-45);this.line([{x,y},{x:x+2,y:y-4},{x:x+4,y}],i%2?'#b2c392':'#729471',1);}
  this.line(portraitRoad.map(p=>this.point(p)),'#718970',39);this.line(portraitRoad.map(p=>this.point(p)),'#d6c398',31);this.line(portraitRoad.map(p=>this.point(p)),'#e2d1a9',22);
  for(const [x,y] of [[27,227],[359,82],[28,388],[387,300]]){this.c.save();this.c.translate(x,this.y(y));this.c.scale(.52,.52);this.tree(0,0,1);this.c.restore();}
  this.c.save();this.c.translate(364,this.y(394));this.c.scale(.39,.39);this.castle(0,0,s.time);this.c.restore();
  for(let i=0;i<portraitSlots.length;i++){const p=this.point(portraitSlots[i]);const t=s.towers.find(t=>Math.hypot(t.x-slots[i].x,t.y-slots[i].y)<5);if(!t){this.ellipse(p.x,p.y,27,14,'#576b5b44');this.ellipse(p.x,p.y-4,25,13,'#e7e2b8');this.text('+',p.x,p.y+2,26,'#617c53','center',true);this.text(`${i+1}`,p.x+26,p.y+11,9,'#3e6553');}else{this.c.save();this.c.translate(p.x,p.y);this.c.scale(.61,.61);this.tower({...t,x:0,y:0},s);this.c.restore();}}
  s.enemies.forEach(e=>{const p=this.pathPoint(e.progress);this.c.save();this.c.translate(p.x,p.y);this.c.scale(.74,.74);this.monster(0,0,e.kind,s.time,e.hp/e.maxHp,e.flash>0,false);this.c.restore();});
  this.rect(12,this.height-28,125,20,'#244b3bc9',5);this.text(`웨이브 ${s.wave} · 대기 ${s.remaining}`,20,this.height-14,10,'#e7edd5');
 }
 huntWorld(s:ArcadeRun){const c=this.c;this.rect(0,0,420,this.height,'#243e4b');const gradient=c.createRadialGradient(210,this.height/2,0,210,this.height/2,270);gradient.addColorStop(0,'#4a6a74');gradient.addColorStop(1,'#233a49');c.fillStyle=gradient;c.fillRect(0,0,420,this.height);
  for(let i=0;i<48;i++){const x=i*97%410,y=25+i*53%(this.height-30);this.rect(x,y,14,4,'#aec8b912',2);if(i%6===0)this.diamond(x,y-3,6,'#799dab');}
  for(const [x,y] of [[38,95],[375,90],[43,335],[374,370]]){const py=this.y(y);this.ellipse(x,py,20,6,'#182f3c66');this.rect(x-10,py-38,20,38,'#5a737d',3);this.rect(x-14,py-44,28,9,'#8da49d',2);this.rect(x-3,py-32,6,16,'#b2e4cd',2);}
  c.strokeStyle='#b1d6c328';c.lineWidth=2;c.beginPath();c.ellipse(210,this.height/2,99,63,0,0,Math.PI*2);c.stroke();
  s.gems.forEach(g=>{const p=this.mapHunt(g);this.diamond(p.x,p.y,6,'#a3edcb');});
  const entities=[...s.enemies.map(e=>({y:e.y,draw:()=>{const p=this.mapHunt(e);c.save();c.translate(p.x,p.y);c.scale(.7,.7);this.monster(0,0,e.kind,s.time,e.hp/e.maxHp,e.flash>0,true);c.restore();}})),{y:s.player.y,draw:()=>{const p=this.mapHunt(s.player);this.person(p.x,p.y,'#efcf83',Math.hypot(s.target.x-s.player.x,s.target.y-s.player.y)>4?s.time:0,1,.85);this.line([{x:p.x+11,y:p.y-3},{x:p.x+15,y:p.y-29}],'#c6a981',3);this.diamond(p.x+15,p.y-32,5,'#b7f5dc');if(s.level>=4)for(let i=0;i<2;i++){const a=s.time*1.7+i*Math.PI;this.diamond(p.x+Math.cos(a)*25,p.y-10+Math.sin(a)*13,5,'#b8f1d6');}if(s.invulnerable>0){c.strokeStyle='#d6f4d9';c.lineWidth=2;c.beginPath();c.arc(p.x,p.y-14,24,0,Math.PI*2);c.stroke();}}}];entities.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());
  const target=this.mapHunt(s.target);this.ellipse(target.x,target.y,6,3,'#bce3cb44');this.rect(78,this.height-21,264,4,'#132d39',3);this.rect(78,this.height-21,264*s.xp/(4+s.level*2),4,'#a7d7ba',3);this.text(`Lv.${s.level} · 보석 ${s.xp}/${4+s.level*2}`,210,this.height-27,10,'#b1d5c7','center');
 }
 cafeWorld(s:ArcadeRun){const c=this.c;const colors={forest:['#bad1bd','#8baa8a','#e1cfac'],sunset:['#dec7ba','#b88072','#f0d8b5'],ocean:['#b6d2d8','#6f9caa','#e0d8bf']}[s.theme];this.rect(0,0,420,this.height,colors[0]);this.ellipse(344,53,25,25,'#f7e7b5');for(let i=0;i<6;i++)this.rect(i*83-13,this.height*.32+i%3*21,63,this.height,'#849e9628',2);
  const fh=Math.min(76,(this.height-68)/4),bottom=this.height-38,top=bottom-s.floors*fh;
  this.rect(0,bottom+3,420,35,'#c2bca4');this.rect(0,bottom+20,420,24,'#839a93');this.ellipse(219,bottom+5,151,9,'#3d5b4833');
  this.rect(78,top-10,265,s.floors*fh+10,'#746a59',3);this.polygon([{x:343,y:top-10},{x:358,y:top-20},{x:358,y:bottom-8},{x:343,y:bottom}],'#92826c');
  for(let f=0;f<s.floors;f++){const y=bottom-f*fh;this.rect(85,y-fh+3,250,fh-7,colors[2],1);this.rect(85,y-18,250,16,'#b29a78',1);for(let j=0;j<3;j++){this.rect(101+j*72,y-fh+12,52,fh-33,'#829b90',2);this.rect(104+j*72,y-fh+15,46,fh-39,'#d7dec3',1);}this.rect(285,y-30,41,18,'#89624b',2);this.rect(283,y-34,45,5,'#f4e2b6',2);
   for(let i=0;i<s.interior.length;i++){const item=s.interior[i];if(item==='empty'||item==='counter')continue;const x=110+(i%3)*65,py=y-12-Math.floor(i/3)*5;if(item==='plant'){this.rect(x-4,py-9,8,10,'#b68664',1);this.ellipse(x,py-13,7,8,'#709368');}if(item==='lamp'){this.line([{x,y:py},{x,y:py-24}],'#766f58',2);this.ellipse(x,py-25,9,4,'#fff0ab');}if(item==='seat'){this.rect(x-10,py-8,20,5,colors[1],2);this.line([{x:x-7,y:py-4},{x:x-7,y:py+3}],'#7e705a',2);this.line([{x:x+7,y:py-4},{x:x+7,y:py+3}],'#7e705a',2);}}
   this.rect(85,y-fh+3,81,14,'#335650',2);this.text(['모퉁이 커피','초록 책방','노을 식당','루프탑'][f],126,y-fh+13,8,'#f2e4b7','center',true);if(s.staff>0)this.person(274,y-5,'#e9e1ba',s.time,2,.5);
  }
  this.rect(75,top-16,274,8,'#f1dfb6',2);this.rect(96,top-37,99,22,colors[1],3);this.text('나의 골목상회',145,top-22,11,'#fff0c7','center',true);
  for(const p of s.customers){const q={x:Math.max(25,100+(p.x-300)/600*300),y:bottom-8-p.target*fh+(p.phase===0?Math.max(0,(1-p.timer/3))*p.target*fh:0)};this.person(q.x,q.y,p.color,p.phase===1?0:s.time,p.variant,.55);if(p.phase===1)this.text('…',q.x,q.y-25,11,'#ffffff','center');}
  const stats=interiorStats(s.interior);this.rect(12,12,154,23,'#224d46d9',5);this.text(`배치 효과 ×${stats.multiplier.toFixed(2)}${stats.connected?'':' · 동선 막힘'}`,22,28,10,'#ebdfbb');
 }
}
