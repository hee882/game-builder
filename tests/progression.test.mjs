import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ArcadeRun,huntSkills} from '../src/arcade-run.ts';
import {buildStats,runes,freshProfile,loadProfile,settle,buyUpgrade,claimAchievement,makeChallengeCode,parseChallengeCode} from '../src/progression.ts';
import {interiorStats,defaultInterior,furniture,furnitureChoices} from '../src/interior.ts';

test('rune totals, resonance, duplicates and multiplicative output are explicit',()=>{
 const a=buildStats(['ember','tide','gale'],1);assert.equal(a.sum,6);assert.equal(a.exact,true);assert.equal(a.shatter,true);assert.ok(Math.abs(a.reward-1.4)<1e-9);
 const b=buildStats(['ember','ember','ember'],1);assert.equal(b.exact,true);assert.equal(b.distinct,false);assert.equal(b.reward,1.25);assert.equal(buildStats(['ember','tide','gale'],2).exact,false);
});
test('skill precision changes effect, combo and cooldown; spam gives no extra reward',()=>{
 const perfect=new ArcadeRun('hunt',1,freshProfile());perfect.started=true;perfect.elapsed=.5/(.48+.035);assert.equal(perfect.activateSkill(),true);assert.equal(perfect.perfects,1);assert.equal(perfect.bestStreak,1);const earned=perfect.earned;assert.equal(perfect.activateSkill(),false);assert.equal(perfect.earned,earned);
 const miss=new ArcadeRun('hunt',1,freshProfile());miss.started=true;miss.activateSkill();assert.equal(miss.perfects,0);assert.equal(miss.earned,0);assert.ok(miss.cooldown>perfect.cooldown);
});
test('clearing requires both main objective and precise actions',()=>{
 const run=new ArcadeRun('hunt',1,freshProfile());run.started=true;run.kills=run.goal;run.update(.01);assert.equal(run.result,null);run.perfects=run.requiredPerfects;run.attempts=run.perfects;run.update(.01);assert.equal(run.result.success,true);
});
test('increasing stages and risk contracts increase actual difficulty',()=>{
 const a=new ArcadeRun('defense',1,freshProfile()),b=new ArcadeRun('defense',4,freshProfile()),risk=new ArcadeRun('defense',1,freshProfile(),true);assert.ok(b.goal>a.goal);assert.ok(b.difficulty>a.difficulty);assert.ok(b.perfectWidth<a.perfectWidth);assert.ok(b.requiredPerfects>a.requiredPerfects);assert.ok(risk.duration<a.duration);assert.ok(risk.difficulty>a.difficulty);
});
test('S grade earns more than B, no-effort abandonment earns nothing',()=>{
 const p=freshProfile(),s=new ArcadeRun('hunt',1,p),b=new ArcadeRun('hunt',1,p),empty=new ArcadeRun('hunt',1,p);s.perfects=5;s.attempts=5;s.elapsed=60;s.finish(true);b.perfects=1;b.attempts=10;b.elapsed=80;b.finish(true);empty.finish(false);assert.equal(s.result.grade,'S');assert.equal(b.result.grade,'B');assert.ok(s.result.reward>b.result.reward);assert.equal(empty.result.reward,0);
});
test('settlement, achievement and purchases cannot double-pay or spend into debt',()=>{
 const profile=freshProfile(),run=new ArcadeRun('defense',1,profile);run.finish(true);assert.equal(settle(profile,run.result),true);const coins=profile.coins;assert.equal(settle(profile,run.result),false);assert.equal(profile.coins,coins);assert.equal(profile.unlocked.defense,2);assert.equal(claimAchievement(profile,'first'),true);assert.equal(claimAchievement(profile,'first'),false);while(buyUpgrade(profile,'power')){}assert.ok(profile.coins>=0);assert.ok(profile.levels.power<=5);
});
test('interior rewards usable seats and penalizes blocked counter access',()=>{
 const valid=interiorStats(defaultInterior);assert.equal(valid.connected,true);assert.equal(valid.seats,2);assert.ok(valid.multiplier>1);const blocked=[...defaultInterior];blocked[4]='plant';assert.equal(interiorStats(blocked).connected,false);assert.equal(interiorStats(blocked).multiplier,.5);
});
test('save validation and roundtrip preserve progression and reject malformed data',()=>{
 const p=freshProfile();p.coins=230;p.interior[0]='lamp';p.theme='ocean';p.settings.fps=30;const loaded=loadProfile(JSON.stringify(p));assert.equal(loaded.coins,230);assert.equal(loaded.theme,'ocean');assert.equal(loaded.interior[0],'lamp');assert.equal(loaded.settings.fps,30);assert.deepEqual(loadProfile('{bad'),freshProfile());const invalid=loadProfile(JSON.stringify({version:2,coins:-100,build:['garbage','ember','tide'],unlocked:{hunt:99}}));assert.equal(invalid.coins,0);assert.deepEqual(invalid.build,['ember','tide','gale']);assert.equal(invalid.unlocked.hunt,6);
});
test('friend challenge exchange validates records and handles arbitrary text safely',()=>{
 const friend={name:'친구',mode:'hunt',stage:2,grade:'A',elapsed:60,perfects:4,build:['ember','tide','gale']};assert.deepEqual(parseChallengeCode(makeChallengeCode(friend)),friend);assert.equal(parseChallengeCode('PLAY2.%7Bbad'),null);assert.equal(parseChallengeCode(makeChallengeCode({...friend,stage:100})),null);
});

test('all rune combinations have finite positive stats and stage resonance wraps at five',()=>{
 for(let stage=1;stage<=6;stage++)for(const a of Object.keys(runes))for(const b of Object.keys(runes))for(const c of Object.keys(runes)){
  const build=[a,b,c],stats=buildStats(build,stage);
  assert.equal(stats.target,[6,7,8,9,6,7][stage-1]);
  assert.equal(stats.exact,build.reduce((sum,id)=>sum+runes[id].value,0)===stats.target);
  assert.equal(stats.distinct,new Set(build).size===3);
  for(const key of ['power','speed','reward','mobility'])assert.ok(Number.isFinite(stats[key])&&stats[key]>0);
 }
});

test('each stage from one through six increases challenge without easing any threshold',()=>{
 for(const mode of ['defense','hunt','landlord'])for(const risk of [false,true]){
  let previous=new ArcadeRun(mode,1,freshProfile(),risk);
  for(let stage=2;stage<=6;stage++){
   const next=new ArcadeRun(mode,stage,freshProfile(),risk);
   assert.ok(next.goal>previous.goal);assert.ok(next.difficulty>previous.difficulty);
   assert.ok(next.perfectWidth<previous.perfectWidth);assert.ok(next.requiredPerfects>=previous.requiredPerfects);
   assert.ok(next.duration<=previous.duration);previous=next;
  }
 }
});

test('save and challenge validation reject inherited rune names and coerced enum values',()=>{
 const friend={name:'친구',mode:'hunt',stage:2,grade:'A',elapsed:60,perfects:4,build:['ember','tide','gale']};
 for(const id of ['__proto__','constructor','toString']){
  const build=[id,'tide','gale'];
  assert.deepEqual(loadProfile(JSON.stringify({version:2,build})).build,freshProfile().build);
  assert.equal(parseChallengeCode(makeChallengeCode({...friend,build})),null);
 }
 for(const patch of [{mode:['hunt']},{grade:['A']}])assert.equal(parseChallengeCode(makeChallengeCode({...friend,...patch})),null);
 const interior=[...defaultInterior];interior[0]=['plant'];
 assert.deepEqual(loadProfile(JSON.stringify({version:2,interior})).interior,defaultInterior);
});

test('save history rejects impossible stages and malformed records individually',()=>{
 const run=new ArcadeRun('hunt',1,freshProfile());run.finish(false);
 const bad=[{stage:0},{stage:7},{stage:1.5},{mode:['hunt']},{grade:['C']},{perfects:2,attempts:1},{build:['constructor','tide','gale']}];
 const history=bad.map((patch,i)=>({...run.result,...patch,id:`bad:${i}`}));
 const loaded=loadProfile(JSON.stringify({...freshProfile(),history:[...history,run.result]}));
 assert.deepEqual(loaded.history,[run.result]);
});

test('settlement rejects invalid rewards without changing wallet or claim state',()=>{
 const run=new ArcadeRun('hunt',1,freshProfile());run.finish(false);
 for(const reward of [-1,NaN,Infinity,-Infinity]){
  const p=freshProfile();assert.equal(settle(p,{...run.result,reward}),false);assert.deepEqual(p,freshProfile());
 }
});

test('more than a thousand settlements survive reload without reopening payouts',()=>{
 const p=freshProfile(),run=new ArcadeRun('defense',1,p);run.finish(true);
 for(let i=0;i<1001;i++)assert.equal(settle(p,{...run.result,id:`run:${i}`}),true);
 assert.equal(claimAchievement(p,'first'),true);
 const loaded=loadProfile(JSON.stringify(p)),coins=loaded.coins;
 assert.equal(settle(loaded,{...run.result,id:'run:1000'}),false);
 assert.equal(claimAchievement(loaded,'first'),false);assert.equal(loaded.coins,coins);
});

test('invalid frame deltas do not rewind or poison arcade timers',()=>{
 for(const dt of [-1,NaN,Infinity]){
  const run=new ArcadeRun('hunt',1,freshProfile());run.started=true;run.cooldown=2;
  run.update(dt);assert.equal(run.elapsed,0);assert.equal(run.cooldown,2);assert.equal(run.time,0);assert.equal(run.result,null);
 }
});

test('deadline clips simulation before rewards beyond the time limit can clear a run',()=>{
 const run=new ArcadeRun('landlord',1,freshProfile());run.started=true;
 run.elapsed=run.duration-.01;run.rentTimer=4.98;run.earned=run.goal-1;run.perfects=run.requiredPerfects;
 run.update(.05);assert.equal(run.elapsed,run.duration);assert.equal(run.result.success,false);
 assert.equal(run.result.progress,run.goal-1);
});

test('cooldown unlocks at zero and paused choices freeze active run timers',()=>{
 const run=new ArcadeRun('hunt',1,freshProfile());run.started=true;run.spawnTimer=99;run.cooldown=.125;
 run.choices=true;run.update(.125);assert.equal(run.elapsed,0);assert.equal(run.cooldown,.125);
 run.choices=false;run.update(.125);assert.equal(run.cooldown,0);assert.equal(run.activateSkill(),true);
 const attempts=run.attempts;assert.equal(run.activateSkill(),false);assert.equal(run.attempts,attempts);
});

test('arcade manual service cannot reward the same customer twice and four seconds breaks the combo',()=>{
 const run=new ArcadeRun('landlord',1,freshProfile());run.started=true;
 const customer=()=>({x:350,y:514,target:0,phase:1,timer:0,color:'#fff',variant:0});
 const first=customer();run.customers=[first];run.serve(first,true);const earned=run.earned;
 run.serve(first,true);assert.equal(run.earned,earned);assert.equal(run.manualServices,1);
 run.elapsed=3.99;const second=customer();run.customers.push(second);run.serve(second,true);assert.equal(run.combo,1);
 run.elapsed=7.99;const third=customer();run.customers.push(third);run.serve(third,true);assert.equal(run.combo,0);
});

test('stage health scaling protects newly spawned enemies before their first combat frame',t=>{
 t.mock.method(Math,'random',()=>0);
 const p=freshProfile();p.build=['stone','stone','stone'];
 const run=new ArcadeRun('hunt',6,p);run.started=true;run.player={x:915,y:100};run.target={...run.player};
 run.update(.01);
 assert.equal(run.enemies.length,1);assert.ok(Math.abs(run.enemies[0].maxHp-32*run.difficulty)<1e-9);
 assert.ok(Math.abs(run.enemies[0].hp-(32*run.difficulty-23*run.damageMultiplier))<1e-9);
});

test('interior uses orthogonal entrance paths and excludes inaccessible seats and their decorations',()=>{
 const diagonal=['plant','counter','plant','plant','empty','plant','plant','empty','seat'];
 const a=interiorStats(diagonal);assert.equal(a.connected,true);assert.equal(a.seats,1);assert.equal(a.comfort,1);
 const unreachable=['seat','counter','empty','plant','plant','empty','lamp','empty','empty'];
 const b=interiorStats(unreachable);assert.equal(b.connected,true);assert.equal(b.seats,1);
 const isolated=['seat','counter','plant','plant','empty','plant','empty','empty','seat'];
 const c=interiorStats(isolated);assert.equal(c.connected,true);assert.equal(c.seats,2);
 const blocked=['empty','counter','empty','plant','plant','plant','empty','empty','seat'];
 const d=interiorStats(blocked);assert.equal(d.connected,false);assert.equal(d.seats,1);assert.equal(d.multiplier,.5);
 const detour=['empty','counter','plant','empty','plant','seat','empty','empty','empty'];
 const e=interiorStats(detour);assert.equal(e.connected,true);assert.equal(e.seats,1);
 assert.equal(e.comfort,2);assert.ok(Math.abs(e.multiplier-1.1)<1e-9);
 const inaccessible=['lamp','counter','empty','seat','plant','empty','plant','empty','empty'];
 const f=interiorStats(inaccessible);assert.equal(f.connected,true);assert.equal(f.seats,0);assert.equal(f.comfort,1);
});

test('corrupt save roots and encoded challenge text never escape validation',()=>{
 for(const raw of ['null','[]','1','true','"profile"','{"version":1}','{bad'])assert.deepEqual(loadProfile(raw),freshProfile());
 for(const code of ['', 'PLAY1.%7B%7D','PLAY2.%','PLAY2.%E0%A4%A','PLAY2.null','PLAY2.[]','PLAY2.'+'a'.repeat(2500)])assert.equal(parseChallengeCode(code),null);
 const loaded=loadProfile(JSON.stringify({version:2,levels:{power:-5,fortune:99},settings:{volume:99,fps:40},coins:1e100}));
 assert.deepEqual(loaded.levels,{power:0,fortune:5});assert.equal(loaded.settings.volume,1);assert.equal(loaded.settings.fps,60);assert.equal(loaded.coins,1e9);
});

test('legacy rune identities, version two saves and PLAY2 codes remain compatible',()=>{
 const legacy={ember:[2,'#e99474','✦'],tide:[3,'#89c9d1','❄'],gale:[1,'#aed1a3','≋'],stone:[4,'#c5accf','⬡'],bloom:[2,'#e5c67e','❋']};
 for(const [id,values] of Object.entries(legacy))assert.deepEqual([runes[id].value,runes[id].color,runes[id].symbol],values);
 const p=freshProfile();p.unlocked.hunt=2;p.build=['stone','bloom','tide'];
 assert.deepEqual(loadProfile(JSON.stringify(p)),p);
 const code='PLAY2.%7B%22name%22%3A%22old%22%2C%22mode%22%3A%22hunt%22%2C%22stage%22%3A2%2C%22grade%22%3A%22A%22%2C%22elapsed%22%3A60%2C%22perfects%22%3A4%2C%22build%22%3A%5B%22ember%22%2C%22tide%22%2C%22gale%22%5D%7D';
 assert.deepEqual(parseChallengeCode(code),{name:'old',mode:'hunt',stage:2,grade:'A',elapsed:60,perfects:4,build:['ember','tide','gale']});
});

test('new catalogs expose metadata and extended saves retain every new item',()=>{
 assert.equal(Object.keys(runes).length,10);assert.equal(Object.keys(furniture).length,11);
 for(const item of [...Object.values(runes),...Object.values(furniture),...Object.values(huntSkills)])for(const key of ['name','description','symbol','color'])assert.equal(typeof item[key],'string');
 for(const id of ['bar','sofa','table','windowSeat','art','neon'])assert.ok(furnitureChoices.includes(id));
 const p=freshProfile();p.unlocked.hunt=2;p.build=['spark','chrono','gold'];p.interior=['art','counter','neon','sofa','bar','table','windowSeat','empty','plant'];
 assert.deepEqual(loadProfile(JSON.stringify(p)),p);
 const friend={name:'new',mode:'hunt',stage:6,grade:'S',elapsed:90,perfects:44,build:['chrono','chrono','chrono']};
 assert.deepEqual(parseChallengeCode(makeChallengeCode(friend)),friend);
});

test('new rune stacking keeps cooldown and damage bounded and gold increases settlement',()=>{
 assert.equal(buildStats(['spark','spark','spark'],1).chainDamage,.75);
 assert.equal(buildStats(['leech','leech','leech'],1).healOnKill,3);
 assert.equal(buildStats(['chrono','chrono','chrono'],1).skillCooldown,.88**3);
 assert.equal(buildStats(['storm','storm','storm'],1).movingSkillPower,1.75);
 const p=freshProfile();p.build=['gold','tide','gale'];
 // Match the resonance target so the comparison isolates the gold reward.
 const c=new ArcadeRun('hunt',2,p);p.build=['spark','tide','gale'];const d=new ArcadeRun('hunt',2,p);
 for(const run of [c,d])run.finish(true);assert.ok(c.result.reward>d.result.reward);
 const fast=freshProfile();fast.build=['chrono','chrono','chrono'];const run=new ArcadeRun('hunt',1,fast);run.started=true;run.elapsed=.5/.515;run.activateSkill();
 assert.ok(Math.abs(run.cooldown-3*.88**3)<1e-9);assert.equal(run.activateSkill(),false);
});

const testEnemy=(id,x,y,hp=100)=>({id,x,y,hp,maxHp:hp,progress:0,speed:0,kind:0,flash:0});
test('chain rune damages only one nearby living neighbour without recursion',()=>{
 const p=freshProfile();p.build=['spark','spark','spark'];const run=new ArcadeRun('hunt',1,p);
 run.enemies=[testEnemy(0,100,100),testEnemy(1,210,100),testEnemy(2,300,100)];
 run.damageEnemy(run.enemies[0],20);assert.deepEqual(run.enemies.map(e=>e.hp),[80,85,100]);
});

test('leech heals a kill once, preserves invulnerable healing, and cannot conceal damage',()=>{
 const p=freshProfile();p.build=['leech','leech','leech'];const run=new ArcadeRun('hunt',1,p);run.started=true;run.spawnTimer=99;run.health=18;run.invulnerable=1;
 run.enemies=[testEnemy(0,460,335,0)];run.update(.01);assert.equal(run.health,20);assert.equal(run.damage,0);
 run.health=17;run.update(.01);assert.equal(run.health,17);
 run.invulnerable=0;run.streak=2;run.enemies=[testEnemy(1,460,335,1000),testEnemy(2,600,400,0)];run.update(.01);
 assert.equal(run.damage,1);assert.equal(run.streak,0);assert.equal(run.health,19);
});

test('storm increases skill damage after actual movement and expires while standing',()=>{
 const p=freshProfile();p.build=['storm','storm','storm'];
 const damageAfter=(move,wait)=>{const run=new ArcadeRun('hunt',1,p);run.started=true;run.spawnTimer=99;run.elapsed=.5/.515-.05-wait;
  run.update(.05,move?{x:1,y:0}:{x:0,y:0});if(wait)run.update(wait);
  run.enemies=[testEnemy(0,run.player.x+50,run.player.y,1000)];run.activateSkill();return 1000-run.enemies[0].hp;
 };
 assert.ok(Math.abs(damageAfter(true,0)/damageAfter(false,0)-1.75)<1e-9);
 assert.equal(damageAfter(true,.3),damageAfter(false,0));
});

test('dash hits its corridor and gravity pulls only enemies inside its radius',()=>{
 const run=new ArcadeRun('hunt',1,freshProfile());run.started=true;run.elapsed=.5/.515;run.target={x:700,y:335};
 assert.equal(run.selectHuntSkill('dash'),true);run.enemies=[testEnemy(0,550,335,1000),testEnemy(1,550,400,1000)];run.activateSkill();
 assert.equal(run.player.x,630);assert.ok(run.enemies[0].hp<1000);assert.equal(run.enemies[1].hp,1000);assert.equal(run.selectHuntSkill('gravity'),false);
 const well=new ArcadeRun('hunt',1,freshProfile());well.started=true;well.elapsed=.5/.515;well.target={x:600,y:335};well.selectHuntSkill('gravity');
 well.enemies=[testEnemy(0,700,335,1000),testEnemy(1,850,335,1000)];well.activateSkill();
 assert.equal(well.enemies[0].x,630);assert.ok(well.enemies[0].hp<1000);assert.equal(well.enemies[1].x,850);assert.equal(well.enemies[1].hp,1000);
});

test('new furniture affects capacity, decoration diversity and counter access',()=>{
 const base=interiorStats(defaultInterior),layout=[...defaultInterior];layout[3]='table';layout[5]='sofa';layout[4]='bar';
 const upgraded=interiorStats(layout);assert.equal(upgraded.seats,3);assert.equal(upgraded.bars,1);assert.equal(upgraded.comfort,base.comfort+1);assert.ok(upgraded.multiplier>base.multiplier);
 layout[3]='windowSeat';assert.equal(interiorStats(layout).comfort,base.comfort+3);
 layout[0]='art';layout[2]='neon';const decorated=interiorStats(layout);assert.equal(decorated.variety,1);assert.equal(decorated.comfort,7);
 layout[4]='table';assert.equal(interiorStats(layout).connected,false);assert.equal(interiorStats(layout).multiplier,.5);
});
