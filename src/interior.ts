export type Furniture='empty'|'seat'|'plant'|'lamp'|'counter'|'bar'|'sofa'|'table'|'windowSeat'|'art'|'neon';
export const defaultInterior: Furniture[]=['plant','counter','plant','seat','empty','seat','empty','empty','empty'];
type FurnitureData={name:string;symbol:string;description:string;color:string;walkable:boolean;seats:number;decor:number};
export const furniture:Record<Furniture,FurnitureData>={
 empty:{name:'통로',symbol:'·',description:'비워두면 손님이 이동해요',color:'#809e92',walkable:true,seats:0,decor:0},
 seat:{name:'좌석',symbol:'▰',description:'접근 가능한 좌석마다 매출 +4%',color:'#bf9365',walkable:false,seats:1,decor:0},
 plant:{name:'화분',symbol:'✿',description:'좌석 옆 화분마다 분위기 +1',color:'#88ba91',walkable:false,seats:0,decor:1},
 lamp:{name:'조명',symbol:'☼',description:'좌석 옆 조명마다 분위기 +1',color:'#ebc875',walkable:false,seats:0,decor:1},
 counter:{name:'카운터',symbol:'▣',description:'입구에서 연결되어야 해요',color:'#b89472',walkable:true,seats:0,decor:0},
 bar:{name:'바 연장',symbol:'═',description:'통로를 유지하며 연결된 바마다 매출 +3%',color:'#cc9d75',walkable:true,seats:0,decor:0},
 sofa:{name:'소파',symbol:'▱',description:'접근 시 좌석 1 · 자체 분위기 +1',color:'#c58dad',walkable:false,seats:1,decor:0},
 table:{name:'2인 테이블',symbol:'⊞',description:'접근 가능한 한 칸에 좌석 2 · 장식은 한 번 계산',color:'#d9b78b',walkable:false,seats:2,decor:0},
 windowSeat:{name:'창가석',symbol:'◫',description:'접근 시 좌석 1 · 좌우 벽 배치 시 분위기 +2',color:'#95cbd8',walkable:false,seats:1,decor:0},
 art:{name:'벽 아트',symbol:'▧',description:'인접한 좌석 가구마다 분위기 +2 · 장식 다양성',color:'#c4a3e2',walkable:false,seats:0,decor:2},
 neon:{name:'네온 사인',symbol:'✧',description:'인접한 좌석 가구마다 분위기 +1 · 새 장식 종류',color:'#f18ed0',walkable:false,seats:0,decor:1}
};
export const furnitureChoices=(Object.keys(furniture) as Furniture[]).filter(id=>id!=='counter');
export const validFurniture=(value:unknown):value is Furniture=>typeof value==='string'&&Object.hasOwn(furniture,value);
const neighbours=(i:number)=>[i%3>0?i-1:-1,i%3<2?i+1:-1,i>=3?i-3:-1,i<6?i+3:-1].filter(n=>n>=0);
export function interiorStats(layout:Furniture[]){
 const reached=new Set<number>([7]),queue=[7];
 while(queue.length){const i=queue.shift()!;for(const n of neighbours(i))if(!reached.has(n)&&furniture[layout[n]]?.walkable){reached.add(n);queue.push(n);}}
 const connected=reached.has(1);let seats=0,comfort=0,bars=0;
 layout.forEach((item,i)=>{
  if(item==='bar'&&reached.has(i))bars++;
  if(furniture[item].seats>0&&neighbours(i).some(n=>reached.has(n))){
   seats+=furniture[item].seats;
   comfort+=neighbours(i).reduce((sum,n)=>sum+furniture[layout[n]].decor,0);
   if(item==='sofa')comfort++;
   if(item==='windowSeat'&&i%3!==1)comfort+=2;
  }
 });
 const variety=Math.max(0,new Set(layout.filter(id=>furniture[id].decor>0)).size-1);
 const multiplier=connected?1+seats*.04+(comfort+variety)*.03+bars*.03:.5;
 return {connected,seats,comfort:comfort+variety,multiplier,reached,variety,bars};
}
