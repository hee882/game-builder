// Orca eval에서 실행한다. 실제 DOM 입력 경로만 사용하며 sim 상태는 읽기만 한다.
(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async predicate => {
    const start=performance.now();
    while(!predicate()) { if(performance.now()-start>3000) throw new Error('렌더 대기 초과'); await wait(30); }
  };
  const key = (code, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, {code, bubbles:true}));
  const tap = code => { key(code); key(code, 'keyup'); };
  const click = id => document.querySelector(id).click();
  click('#restart');
  tap('KeyJ');
  await wait(180); tap('KeyJ');
  await wait(180); tap('KeyJ');
  await wait(180); tap('KeyJ');
  await wait(250); click('#pause');
  const chain = window.yeonmu.inspect().state.player.seen;
  if (!['hw_l1','hw_l2','hw_l3','hw_l4'].every(id=>chain.includes(id))) throw new Error(`기본 콤보 실패: ${chain}`);
  click('#restart'); tap('KeyJ'); await wait(435); tap('KeyJ'); await wait(240);tap('KeyK'); await wait(180);click('#pause');
  const delay = window.yeonmu.inspect().state.player.seen;
  if(!delay.includes('hw_dl') || !delay.includes('hw_dlh')) throw new Error(`지연 콤보 실패: ${delay}`);
  click('#restart');key('KeyK');await wait(730);key('KeyK','keyup');click('#pause');
  const charge=window.yeonmu.inspect().state.player.seen;
  if(!charge.includes('hw_charge')) throw new Error(`일섬 실패: ${charge}`);
  const select=document.querySelector('#preview');const previews=[];
  const clips=['atk_hwando_l1','atk_hwando_l2','atk_hwando_l3','atk_hwando_l4','atk_hwando_llh','atk_hwando_lllh','atk_hwando_l_delay','atk_hwando_l_delay_h','atk_hwando_h1','atk_hwando_h2','atk_hwando_charge_release','cnt_hwando_dodge_l','cnt_hwando_parry_l','cnt_hwando_parry_h'];
  for(const option of select.options) {
    if(!option.value) continue;
    select.value=option.value;select.dispatchEvent(new Event('change'));
    await until(()=>window.yeonmu.inspect().render.clip===clips[previews.length]);
    const render=window.yeonmu.inspect().render;
    if(render.action!==option.value || !render.clip || render.enemyMeshes!==7) throw new Error(`동작 보기 실패: ${option.value}`);
    previews.push({node:option.value,clip:render.clip});
  }
  select.value='';select.dispatchEvent(new Event('change'));click('#restart');
  await until(()=>window.yeonmu.inspect().state.enemies.some(enemy=>enemy.attack));click('#pause');
  const threats=window.yeonmu.inspect().state.enemies.filter(enemy=>enemy.attack).map(enemy=>enemy.attack);
  const result={chain,delay,charge,previews,threats,latencyMethod:'자동 입력 스모크 / 물리 디스플레이 지연 아님'};
  return JSON.stringify(result);
})();
