import type { Mode } from './game-state';
import {defaultInterior,validFurniture,type Furniture} from './interior.ts';

export type RuneId='ember'|'tide'|'gale'|'stone'|'bloom'|'spark'|'leech'|'chrono'|'storm'|'gold';
export type Build=[RuneId,RuneId,RuneId];
export const runes:Record<RuneId,{name:string;symbol:string;value:number;power:number;speed:number;reward:number;color:string;description:string;unlock:number}>={
 ember:{name:'불씨',symbol:'✦',value:2,power:.22,speed:0,reward:0,color:'#e99474',description:'공격력 +22%',unlock:1},
 tide:{name:'서리',symbol:'❄',value:3,power:.1,speed:0,reward:.05,color:'#89c9d1',description:'공격력 +10% · 보상 +5%',unlock:1},
 gale:{name:'바람',symbol:'≋',value:1,power:0,speed:.18,reward:0,color:'#aed1a3',description:'공격 속도 +18%',unlock:1},
 stone:{name:'대지',symbol:'⬡',value:4,power:.4,speed:-.08,reward:0,color:'#c5accf',description:'공격력 +40% · 속도 −8%',unlock:1},
 bloom:{name:'결실',symbol:'❋',value:2,power:0,speed:0,reward:.18,color:'#e5c67e',description:'보상 +18% · 1단계 클리어 해금',unlock:2},
 spark:{name:'연쇄 번개',symbol:'ϟ',value:3,power:0,speed:0,reward:0,color:'#91bfff',description:'전투 타격마다 110 거리 안의 다른 적에게 피해 25% 전이',unlock:1},
 leech:{name:'흡혈',symbol:'♥',value:2,power:0,speed:0,reward:0,color:'#e783a0',description:'전투에서 적 처치마다 체력 1 회복 · 최대 체력 20',unlock:1},
 chrono:{name:'시간 균열',symbol:'⌛',value:4,power:0,speed:0,reward:0,color:'#b5a0ed',description:'장착할 때마다 액티브 스킬 재사용 시간 ×0.88',unlock:1},
 storm:{name:'폭풍',symbol:'↯',value:1,power:0,speed:0,reward:0,color:'#77ddd0',description:'사냥에서 이동 직후 0.2초 동안 스킬 피해 +25%',unlock:1},
 gold:{name:'황금',symbol:'◆',value:3,power:0,speed:0,reward:.22,color:'#ffd45f',description:'도전 정산 보상 +22% · 1단계 클리어 해금',unlock:2}
};
export const modeNames:Record<Mode,string>={defense:'작은 성채',hunt:'유물 사냥꾼',landlord:'골목상회'};
export function buildStats(build:Build,stage:number){
 const sum=build.reduce((n,id)=>n+runes[id].value,0),target=6+(stage-1)%4;
 const power=1+build.reduce((n,id)=>n+runes[id].power,0);
 const speed=1+build.reduce((n,id)=>n+runes[id].speed,0);
 const distinct=new Set(build).size===3,exact=sum===target;
 const reward=1+build.reduce((n,id)=>n+runes[id].reward,0)+(exact?.25:0)+(distinct?.1:0);
 const count=(id:RuneId)=>build.filter(r=>r===id).length;
 return {sum,target,power,speed,reward,distinct,exact,shatter:build.includes('ember')&&build.includes('tide'),mobility:build.includes('gale')?1.18:1,chainDamage:count('spark')*.25,healOnKill:count('leech'),skillCooldown:.88**count('chrono'),movingSkillPower:1+count('storm')*.25};
}
export type RunResult={id:string;mode:Mode;stage:number;success:boolean;grade:'S'|'A'|'B'|'C';reward:number;baseReward:number;gradeMultiplier:number;buildMultiplier:number;perfects:number;attempts:number;maxCombo:number;progress:number;goal:number;elapsed:number;damage:number;build:Build};
export type FriendRecord={name:string;mode:Mode;stage:number;grade:RunResult['grade'];elapsed:number;perfects:number;build:Build};
export type Profile={version:2;coins:number;build:Build;interior:Furniture[];theme:'forest'|'sunset'|'ocean';levels:{power:number;fortune:number};unlocked:Record<Mode,number>;history:RunResult[];friends:FriendRecord[];claimed:string[];settings:{sound:boolean;haptics:boolean;reducedMotion:boolean;fps:30|60;volume:number};};
export function freshProfile():Profile{return {version:2,coins:0,build:['ember','tide','gale'],interior:[...defaultInterior],theme:'forest',levels:{power:0,fortune:0},unlocked:{defense:1,hunt:1,landlord:1},history:[],friends:[],claimed:[],settings:{sound:false,haptics:true,reducedMotion:false,fps:60,volume:.35}};}
const finite=(v:unknown,fallback:number,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,Math.floor(v))):fallback;
const isRecord=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validBuild=(v:unknown):v is Build=>Array.isArray(v)&&v.length===3&&v.every((id:unknown)=>typeof id==='string'&&Object.hasOwn(runes,id));
const validMode=(v:unknown):v is Mode=>v==='defense'||v==='hunt'||v==='landlord';
const validGrade=(v:unknown):v is RunResult['grade']=>v==='S'||v==='A'||v==='B'||v==='C';
export function loadProfile(raw:string|null):Profile{
 const p=freshProfile();if(!raw)return p;
 try{const data:unknown=JSON.parse(raw);if(!isRecord(data)||data.version!==2)return p;
  const levels=isRecord(data.levels)?data.levels:{},unlocked=isRecord(data.unlocked)?data.unlocked:{},settings=isRecord(data.settings)?data.settings:{};
  p.coins=finite(data.coins,0,0,1e9);for(const key of ['power','fortune'] as const)p.levels[key]=finite(levels[key],0,0,5);
  for(const key of ['defense','hunt','landlord'] as const)p.unlocked[key]=finite(unlocked[key],1,1,6);
  if(validBuild(data.build))p.build=data.build;
  const unlockedStage=Math.max(...Object.values(p.unlocked));p.build=p.build.map(id=>runes[id].unlock>unlockedStage?'ember':id) as Build;
  if(Array.isArray(data.interior)&&data.interior.length===9&&data.interior.every(validFurniture)){p.interior=data.interior as Furniture[];p.interior[1]='counter';p.interior[7]='empty';for(let i=0;i<9;i++)if(i!==1&&p.interior[i]==='counter')p.interior[i]='empty';}
  if(data.theme==='forest'||data.theme==='sunset'||data.theme==='ocean')p.theme=data.theme;
  if(Array.isArray(data.friends))p.friends=data.friends.filter(validFriend).slice(0,20);
  if(Array.isArray(data.history))p.history=data.history.filter((r:unknown):r is RunResult=>validResult(r)).slice(0,60);
  if(Array.isArray(data.claimed))p.claimed=[...new Set(data.claimed.filter((id:unknown):id is string=>typeof id==='string'))];
  for(const key of ['sound','haptics','reducedMotion'] as const)if(typeof settings[key]==='boolean')p.settings[key]=settings[key];
  p.settings.fps=settings.fps===30?30:60;if(typeof settings.volume==='number'&&Number.isFinite(settings.volume))p.settings.volume=Math.max(0,Math.min(1,settings.volume));
 }catch{/* Invalid saves fall back to a playable profile. */}return p;
}
function validResult(value:unknown):value is RunResult{if(!isRecord(value))return false;const r=value;return typeof r.id==='string'&&validMode(r.mode)&&typeof r.success==='boolean'&&validGrade(r.grade)&&['stage','reward','baseReward','gradeMultiplier','buildMultiplier','perfects','attempts','maxCombo','progress','goal','elapsed','damage'].every(k=>typeof r[k]==='number'&&Number.isFinite(r[k])&&(r[k] as number)>=0)&&typeof r.stage==='number'&&Number.isInteger(r.stage)&&r.stage>=1&&r.stage<=6&&typeof r.perfects==='number'&&typeof r.attempts==='number'&&Number.isInteger(r.perfects)&&Number.isInteger(r.attempts)&&r.perfects<=r.attempts&&validBuild(r.build);}
export function settle(profile:Profile,result:RunResult){if(!validResult(result)||profile.claimed.includes(result.id))return false;profile.coins+=result.reward;profile.claimed.push(result.id);profile.history.unshift(result);profile.history=profile.history.slice(0,60);if(result.success)profile.unlocked[result.mode]=Math.min(6,Math.max(profile.unlocked[result.mode],result.stage+1));return true;}
export function upgradeCost(level:number){return 120*(level+1)**2;}
export function buyUpgrade(profile:Profile,key:'power'|'fortune'){const level=profile.levels[key],cost=upgradeCost(level);if(level>=5||profile.coins<cost)return false;profile.coins-=cost;profile.levels[key]++;return true;}
export const achievements=[{id:'first',name:'첫 번째 돌파',description:'어느 세계든 도전 1회 클리어',reward:80,done:(p:Profile)=>p.history.some(r=>r.success)},
 {id:'precise',name:'흔들리지 않는 손',description:'한 도전에서 정밀 판정 5회',reward:120,done:(p:Profile)=>p.history.some(r=>r.perfects>=5)},
 {id:'explorer',name:'세 세계의 도전자',description:'세 장르에서 각각 1회 클리어',reward:200,done:(p:Profile)=>new Set(p.history.filter(r=>r.success).map(r=>r.mode)).size===3},
 {id:'master',name:'S급 기록',description:'S등급으로 도전 클리어',reward:160,done:(p:Profile)=>p.history.some(r=>r.grade==='S')},
 {id:'climb',name:'더 높은 곳으로',description:'어느 세계든 3단계 클리어',reward:240,done:(p:Profile)=>p.history.some(r=>r.success&&r.stage>=3)}];
export function claimAchievement(profile:Profile,id:string){const item=achievements.find(a=>a.id===id);const key=`achievement:${id}`;if(!item||!item.done(profile)||profile.claimed.includes(key))return false;profile.coins+=item.reward;profile.claimed.push(key);return true;}
export function validFriend(value:unknown):value is FriendRecord{if(!isRecord(value))return false;const r=value;return typeof r.name==='string'&&r.name.length<=20&&validMode(r.mode)&&validGrade(r.grade)&&typeof r.stage==='number'&&Number.isInteger(r.stage)&&r.stage>=1&&r.stage<=6&&typeof r.elapsed==='number'&&r.elapsed>=0&&r.elapsed<=90&&typeof r.perfects==='number'&&Number.isInteger(r.perfects)&&r.perfects>=0&&r.perfects<=45&&validBuild(r.build);}
export function makeChallengeCode(record:FriendRecord){return `PLAY2.${encodeURIComponent(JSON.stringify(record))}`;}
export function parseChallengeCode(code:string):FriendRecord|null{try{if(code.length>2500||!code.startsWith('PLAY2.'))return null;const r:unknown=JSON.parse(decodeURIComponent(code.slice(6)));return validFriend(r)?r:null;}catch{return null;}}
