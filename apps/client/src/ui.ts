import { elapsed, NODES, nodeById } from '@yeonmu/sim';
import type { State } from '@yeonmu/sim';
import type { Telemetry } from './telemetry';

export function element<T extends HTMLElement>(selector:string):T {
  const result=document.querySelector<T>(selector);if(!result) throw new Error(`요소 없음: ${selector}`);return result;
}
export function mount():void {
  element('#app').innerHTML=`
    <header><div class="identity"><span class="seal">煙</span><div><h1>연무</h1><p>잔향의 문</p></div></div><div class="edition">전투 증명 <span>단계 0 · 오프라인</span></div>
      <nav><button id="pause">일시 정지</button><button id="restart">다시 시작</button><button id="export">기록 내려받기</button></nav></header>
    <main id="arena"><div class="vignette"></div>
      <section class="vitals"><span>길손</span><div class="health"><i id="hp"></i></div><small id="hp-text"></small><div class="guard"><i id="guard"></i></div></section>
      <section class="trial"><label for="mode">비교 조건</label><select id="mode"><option value="branch">B · 분기 콤보</option><option value="simple">A · 단순 입력</option></select><p>같은 아레나 · 같은 적 · 보상 없음</p><strong id="timer">00:00 / 10:00</strong></section>
      <section class="current"><span id="action-label">숨을 고르고, 칼을 든다</span><strong id="beat"></strong><small id="notice">노랑 ◇ 튕겨내기 · 빨강 ✕ 회피</small></section>
      <div id="overlay"><div class="intro"><p class="eyebrow">YEONMU / COMBAT PROOF</p><h2>칼끝에서<br>다음 수를 찾다.</h2><p>빠르게 잇고, 잠시 쉬고, 되받아친다.<br>네 종류의 적을 상대로 환도의 박자를 시험하세요.</p><button id="start">수련 시작 <span>↗</span></button><small>임시 도형 · 모든 콤보 해금 · 장비 보상 없음</small></div></div>
    </main>
    <footer><div><kbd>W A S D</kbd><span>이동</span></div><div><kbd>J / 좌클릭</kbd><span>약공</span></div><div><kbd>K / 우클릭</kbd><span>강공 · 홀드 일섬</span></div><div><kbd>Space / L</kbd><span>회피</span></div><div><kbd>Shift / ;</kbd><span>튕겨내기 · 홀드 막기</span></div><div><kbd>Q E R F</kbd><span>칼집치기 · 휘돌이 · 돌진 · 기합</span></div></footer>
    <details id="tools"><summary>수련 도구 · 동작 보기 · 측정 기록</summary><div class="tool-grid">
      <section><h3>무예록 <span id="discovered">0 / 14</span></h3><div id="nodes"></div><p>J → J → J → J / J → 쉼 → J → K / 회피 → J / 튕겨내기 성공 → J 또는 K</p></section>
      <section><h3>동작 보기</h3><select id="preview"><option value="">전투로 돌아가기</option>${NODES.map(node=>`<option value="${node.id}">${node.name}</option>`).join('')}</select><p>보기 모드는 전투와 측정에서 제외됩니다.</p><label><input id="sound" type="checkbox" checked> 합성 타격음</label><label><input id="zoom" type="checkbox"> 가까이 보기</label><label>흔들림 <input id="shake" type="range" min="0" max="1" step="0.05" value="0.35"></label></section>
      <section><h3>입력 지연 계측</h3><p id="latency">입력 표본 없음</p><p>키 이벤트 처리 → 반응 프레임 렌더 제출. 디스플레이 표시 지연은 고속 촬영이 필요합니다. C1 통과 판정은 미실시.</p><code id="debug"></code><small id="storage"></small></section>
    </div></details>`;
  element('#nodes').innerHTML=NODES.map(node=>`<span id="node-${node.id}" title="${node.id}">?</span>`).join('');
}
export function updateHud(state:State,telemetry:Telemetry,clip:string):void {
  const p=state.player;
  element('#hp').style.width=`${p.hp}%`;element('#guard').style.width=`${p.guard}%`;
  element('#hp-text').textContent=`체력 ${p.hp} / 100 · 막기 ${p.guard}`;
  const seconds=Math.floor(state.tick/30);
  element('#timer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')} / 10:00`;
  const labels:Record<string,string>={idle:'다음 수를 기다린다',charge:'일섬 · 기 모으기',dodge:'회피',parry:'튕겨내기',counter:'반격의 틈 · J / K',guard:'막기',recovery:'자세 회복',skill:'환도 기술'};
  element('#action-label').textContent=p.action.kind==='attack'?nodeById(p.action.node).name:labels[p.action.kind]??'';
  const delayed=p.action.node==='hw_l1' && elapsed(state)>=12 && elapsed(state)<21;
  element('#beat').textContent=delayed?'✦ 지금, 지연 베기':p.hitstop>0?'타격':'';
  element('#discovered').textContent=`${p.seen.length} / 14`;
  for(const node of NODES) {const item=element(`#node-${node.id}`);item.classList.toggle('seen',p.seen.includes(node.id));item.classList.toggle('selected',p.action.node===node.id);item.textContent=p.seen.includes(node.id)?node.name:'?';}
  element('#debug').textContent=`틱 ${state.tick} · 행동 ${elapsed(state)} · 정지 ${p.hitstop}\n${clip}`;
  if(telemetry.latency.length) {
    const sorted=[...telemetry.latency].sort((a,b)=>a-b);const p95=sorted[Math.floor((sorted.length-1)*0.95)]??0;
    element('#latency').textContent=`${sorted.length}표본 · 중앙 ${sorted[Math.floor(sorted.length/2)]?.toFixed(1)}ms · p95 ${p95.toFixed(1)}ms (내부 계측)`;
  }
  element('#storage').textContent=telemetry.storageStatus;
}
