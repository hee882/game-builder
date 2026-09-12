import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ArcadeRun} from '../src/arcade-run.ts';
import {buildStats,freshProfile,loadProfile,settle,buyUpgrade,claimAchievement,makeChallengeCode,parseChallengeCode} from '../src/progression.ts';
import {interiorStats,defaultInterior} from '../src/interior.ts';

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
