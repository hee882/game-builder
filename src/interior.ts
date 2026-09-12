export type Furniture='empty'|'seat'|'plant'|'lamp'|'counter';
export const defaultInterior: Furniture[]=['plant','counter','plant','seat','empty','seat','empty','empty','empty'];
export const furniture:Record<Furniture,{name:string;symbol:string;description:string}>={empty:{name:'통로',symbol:'·',description:'비워두면 손님이 이동해요'},seat:{name:'좌석',symbol:'▰',description:'접근 가능한 좌석마다 매출 +4%'},plant:{name:'화분',symbol:'✿',description:'좌석 옆 화분마다 분위기 +1'},lamp:{name:'조명',symbol:'☼',description:'좌석 옆 조명마다 분위기 +1'},counter:{name:'카운터',symbol:'▣',description:'입구에서 연결되어야 해요'}};
const neighbours=(i:number)=>[i%3>0?i-1:-1,i%3<2?i+1:-1,i>=3?i-3:-1,i<6?i+3:-1].filter(n=>n>=0);
export function interiorStats(layout:Furniture[]){const reached=new Set<number>([7]),queue=[7];while(queue.length){const i=queue.shift()!;for(const n of neighbours(i))if(!reached.has(n)&&(layout[n]==='empty'||layout[n]==='counter')){reached.add(n);queue.push(n);}}
 const connected=reached.has(1);let seats=0,comfort=0;layout.forEach((item,i)=>{if(item==='seat'&&neighbours(i).some(n=>reached.has(n))){seats++;comfort+=neighbours(i).filter(n=>layout[n]==='plant'||layout[n]==='lamp').length;}});
 const variety=layout.includes('plant')&&layout.includes('lamp')?1:0;const multiplier=connected?1+seats*.04+(comfort+variety)*.03:.5;
 return {connected,seats,comfort:comfort+variety,multiplier,reached};
}
