import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OUTPOST_SAVE_VERSION, SAVE_KEY_RUN, SAVE_KEY_SETTINGS, TILE_COUNT } from '../src/outpost/contract.ts';
import { BUILDING_IDS, TERRAIN, WAVES, chapterSpec, parseLayout } from '../src/outpost/content.ts';
import { freshMeta, freshSave, parseSave, serializeSave } from '../src/outpost/save.ts';
import { createSim } from '../src/outpost/sim.ts';

const T = (x, y) => y * 9 + x;
const COLLECTOR_TILE = T(1, 7);
const HARPOON_TILE = T(3, 8);

const harvest = (sim) => {
  const wreck = sim.view().wrecks[0];
  sim.issue({ kind: 'moveSub', to: { x: (wreck.tile % 9) + 0.5, y: Math.floor(wreck.tile / 9) + 0.5 } });
  let guard = 0;
  while (!sim.view().salvage.exhausted && guard < 30 * 600) {
    sim.step();
    guard++;
  }
};

test('키 상수는 셸 관례대로 런·설정이 분리되어 있다', () => {
  assert.equal(SAVE_KEY_RUN, 'outpost-run-v1');
  assert.equal(SAVE_KEY_SETTINGS, 'outpost-settings-v1');
  assert.equal(OUTPOST_SAVE_VERSION, 1);
  assert.equal(freshMeta().insight, 0);
  assert.equal(freshSave().run, null);
});

test('왕복: 저장 → 복원 후 digest 가 같다', () => {
  const sim = createSim({ seed: 101 });
  sim.issue({ kind: 'build', tile: COLLECTOR_TILE, building: 'collector' });
  sim.issue({ kind: 'build', tile: HARPOON_TILE, building: 'harpoon' });
  harvest(sim);
  sim.issue({ kind: 'build', tile: T(5, 8), building: 'harpoon' });
  sim.issue({ kind: 'upgrade', tile: HARPOON_TILE });
  sim.issue({ kind: 'setPolicy', tile: HARPOON_TILE, policy: 'leader' });
  const raw = sim.serialize();
  const restored = createSim({ seed: 101, save: raw });
  const before = sim.view();
  const after = restored.view();
  assert.equal(after.resources.scrap, before.resources.scrap);
  assert.equal(after.buildingCount, before.buildingCount);
  assert.equal(after.salvage.reserveRemaining, before.salvage.reserveRemaining);
  assert.equal(after.wave.index, before.wave.index);
  assert.equal(restored.digest(), sim.digest());
  // 레벨·정책·HP 가 원본과 같은지(감당 가능한 강화였는지와 무관하게) 비교한다
  const pick = (view) => {
    for (let i = 0; i < view.buildingCount; i++) if (view.buildings[i].tile === HARPOON_TILE) return view.buildings[i];
    return null;
  };
  const original = pick(before);
  const copy = pick(after);
  assert.ok(original && copy);
  assert.equal(copy.level, original.level);
  assert.equal(copy.policy, original.policy, '정책이 보존된다');
  assert.ok(Math.abs(copy.hp - original.hp) < 1e-6);
  assert.equal(copy.policy, 'leader');
});

test('손상된 저장은 예외 없이 기본값으로 수렴한다', () => {
  for (const raw of ['{bad', '', 'null', '[]', '"x"', '0', JSON.stringify({ version: 2, meta: {}, run: {} })]) {
    const parsed = parseSave(raw);
    assert.equal(parsed.version, OUTPOST_SAVE_VERSION);
    assert.deepEqual(parsed.meta, freshMeta());
    assert.equal(parsed.run, null);
    const sim = createSim({ seed: 5, save: raw });
    assert.equal(sim.view().phase, 'build');
    assert.equal(sim.view().wave.index, 1);
    assert.ok(sim.view().resources.scrap > 0);
  }
  assert.equal(parseSave(null).run, null);
});

test('적대적 payload: 클램프·화이트리스트·프로토타입 오염 차단', () => {
  const hostile = JSON.stringify({
    version: 1,
    meta: {
      insight: Number.NaN,
      perks: { startScrap: -5, subSpeed: 99, wallHp: 'x', evil: 3 },
      discovered: ['ventResonance', 'bogus', 42, 'ventResonance'],
      best: { wave: 999, chapter: 7, elapsed: -3 },
    },
    run: {
      version: 1,
      seed: -1,
      chapter: 9,
      tick: 1e300,
      phase: 'bogus',
      wave: 99,
      resources: { scrap: -100, biomass: Number.NaN },
      coreHp: 1e9,
      salvageRemaining: -50,
      buildings: [
        { tile: 9999, id: 'harpoon', level: 9, hp: 1e9 },
        { tile: T(2, 4), id: 'harpoon', level: 0, hp: 10 },
        { tile: T(3, 9), id: 'harpoon', level: 0, hp: 10 },
        { tile: HARPOON_TILE, id: 'bogusBuilding', level: 0, hp: 10 },
        { tile: HARPOON_TILE, id: 'harpoon', level: 1, hp: 10, policy: 'evil' },
        { tile: HARPOON_TILE, id: 'bulkhead', level: 0, hp: 5 },
        'not an object',
        null,
      ],
      waveStartBuildings: new Array(500).fill({ tile: T(5, 8), id: 'bulkhead', level: 0 }),
      researched: ['piercingHarpoon', 'nope'],
      automation: { droneRole: 77, autoRebuildWalls: -3 },
      flooded: new Array(500).fill(99),
      retryAttempts: -7,
      stats: { kills: Number.NaN, leaks: -1 },
      ['__proto__']: { polluted: true },
    },
  });
  const parsed = parseSave(hostile);
  assert.equal(parsed.meta.insight, 0);
  assert.equal(parsed.meta.perks.startScrap, 0);
  assert.equal(parsed.meta.perks.subSpeed, 3, '최대 레벨로 클램프');
  assert.equal(parsed.meta.perks.wallHp, 0);
  assert.deepEqual(parsed.meta.discovered, ['ventResonance'], '중복·모르는 ID 제거');
  assert.ok(parsed.meta.best.wave <= WAVES.length);
  assert.ok(parsed.meta.best.chapter === 1 || parsed.meta.best.chapter === 2);
  assert.ok(parsed.meta.best.elapsed >= 0);

  const run = parsed.run;
  assert.ok(run, '런은 살아남되 정규화된다');
  assert.ok(run.chapter === 1 || run.chapter === 2);
  assert.equal(run.phase, 'build', '모르는 phase 는 build 로');
  assert.ok(run.wave >= 1 && run.wave <= WAVES.length);
  assert.ok(run.resources.scrap >= 0 && Number.isFinite(run.resources.biomass));
  assert.ok(run.salvageRemaining >= 0);
  // chapter 9 는 2로 클램프되므로 «그 장의 지형»으로 검증한다. 개수 대신 불변식을 본다.
  const terrain = parseLayout(chapterSpec(run.chapter).layout).terrain;
  const tiles = new Set();
  for (const building of run.buildings) {
    assert.ok(building.tile >= 0 && building.tile < TILE_COUNT, '타일은 범위 안');
    const kind = terrain[building.tile];
    assert.ok(kind === TERRAIN.water || kind === TERRAIN.thermal, '건설 가능 타일만 남는다');
    assert.ok(BUILDING_IDS.includes(building.id), '모르는 건물은 버린다');
    assert.ok(building.level >= 0 && building.level <= 2);
    assert.ok(building.hp > 0 && Number.isFinite(building.hp));
    assert.ok(['nearest', 'leader', 'air'].includes(building.policy), '모르는 정책은 기본값으로');
    assert.equal(tiles.has(building.tile), false, '같은 타일 중복 없음');
    tiles.add(building.tile);
  }
  assert.ok(run.buildings.length >= 1 && run.buildings.length < 8, '쓰레기 항목은 걸러진다');
  assert.equal(run.waveStartBuildings.length, 1, '같은 타일 중복은 하나만');
  assert.deepEqual(run.researched, ['piercingHarpoon']);
  assert.ok(run.automation.droneRole <= 2 && run.automation.autoRebuildWalls <= 1);
  assert.equal(run.flooded.length, TILE_COUNT);
  assert.ok(run.retryAttempts >= 0);
  assert.ok(Number.isFinite(run.stats.kills) && run.stats.leaks >= 0);
  assert.equal({}.polluted, undefined, 'Object.prototype 이 오염되지 않았다');

  const sim = createSim({ seed: 3, save: hostile });
  assert.equal(sim.view().phase, 'build');
  sim.step();
  assert.ok(sim.view().resources.scrap >= 0);
});

test('런만 깨지면 메타(통찰·발견·퍼크)는 살아남는다', () => {
  const sim = createSim({ seed: 7 });
  harvest(sim);
  sim.issue({ kind: 'build', tile: T(2, 2), building: 'harpoon' });
  sim.issue({ kind: 'build', tile: T(6, 2), building: 'harpoon' });
  const good = JSON.parse(sim.serialize());
  assert.ok(good.meta.discovered.includes('ventResonance'));
  const broken = JSON.stringify({ version: 1, meta: good.meta, run: 'garbage' });
  const parsed = parseSave(broken);
  assert.equal(parsed.run, null);
  assert.deepEqual(parsed.meta.discovered, good.meta.discovered);
  assert.equal(parsed.meta.insight, good.meta.insight);
  const resumed = createSim({ seed: 7, save: broken });
  const view = resumed.view();
  assert.equal(view.discovered.includes('ventResonance'), true, '발견은 유지된다');
  assert.equal(view.unlockedBuildings.includes('resonator'), true, '해금도 유지된다');
  assert.equal(view.wave.index, 1, '런은 새로 시작한다');
  assert.ok(view.insight >= 3);
});

test('소진된 리저브는 다시 불러도 채워지지 않는다', () => {
  const sim = createSim({ seed: 11 });
  sim.issue({ kind: 'build', tile: COLLECTOR_TILE, building: 'collector' });
  harvest(sim);
  assert.equal(sim.view().salvage.reserveRemaining, 0);
  const raw = sim.serialize();
  for (let reload = 0; reload < 3; reload++) {
    const resumed = createSim({ seed: 11, save: raw, offlineSeconds: 7200 });
    assert.equal(resumed.view().salvage.reserveRemaining, 0, '재로드가 리저브를 되살리지 않는다');
    assert.equal(resumed.view().salvage.offlineGranted, 0);
  }
  const sim2 = createSim({ seed: 11 });
  sim2.issue({ kind: 'moveSub', to: { x: 0.5, y: 7.5 } });
  for (let i = 0; i < 30 * 4; i++) sim2.step();
  const partial = sim2.view().salvage.reserveRemaining;
  assert.ok(partial > 0 && partial < WAVES[0].salvageReserve);
  const resumed = createSim({ seed: 11, save: sim2.serialize() });
  assert.ok(Math.abs(resumed.view().salvage.reserveRemaining - partial) < 1e-6);
});

test('웨이브 도중 저장은 그 웨이브 시작 상태로 복귀하고 보상을 중복 지급하지 않는다', () => {
  const sim = createSim({ seed: 13 });
  harvest(sim);
  sim.issue({ kind: 'build', tile: HARPOON_TILE, building: 'harpoon' });
  sim.issue({ kind: 'build', tile: T(5, 8), building: 'harpoon' });
  sim.issue({ kind: 'build', tile: T(4, 7), building: 'harpoon' });
  sim.issue({ kind: 'startWave' });
  for (let i = 0; i < 30 * 5; i++) sim.step();
  assert.equal(sim.view().phase, 'wave');
  const midWave = sim.serialize();
  const resumed = createSim({ seed: 13, save: midWave });
  const view = resumed.view();
  assert.equal(view.phase, 'build', '웨이브 도중 저장은 그 웨이브 시작 상태로 복귀한다');
  assert.equal(view.wave.index, 1);
  assert.equal(view.enemyCount, 0);
  assert.equal(view.buildingCount, 3, '웨이브 시작 시점 배치가 복원된다');

  const scrapBefore = view.resources.scrap;
  resumed.issue({ kind: 'startWave' });
  let guard = 0;
  while (resumed.view().phase === 'wave' && guard < 30 * 240) {
    resumed.step();
    guard++;
  }
  const cleared = resumed.view();
  assert.equal(cleared.wave.index, 2);
  const rewards = resumed.drainEvents().filter((event) => event.kind === 'waveClear');
  assert.equal(rewards.length, 1, 'waveClear 는 한 번만');
  assert.ok(cleared.resources.scrap > scrapBefore);
});

test('진행 상황(테크·자동화)이 저장을 건너뛰지 않는다', () => {
  const sim = createSim({ seed: 17 });
  harvest(sim);
  sim.issue({ kind: 'build', tile: HARPOON_TILE, building: 'harpoon' });
  sim.issue({ kind: 'build', tile: T(5, 8), building: 'harpoon' });
  // 테크(강화 격벽 25 생체물질)를 살 수 있을 만큼 두 웨이브를 치른다
  for (let wave = 0; wave < 2; wave++) {
    harvest(sim);
    sim.issue({ kind: 'build', tile: T(4, 7), building: 'harpoon' });
    sim.issue({ kind: 'startWave' });
    let guard = 0;
    while (sim.view().phase === 'wave' && guard < 30 * 240) {
      sim.step();
      guard++;
    }
    if (sim.view().phase === 'defeat') sim.issue({ kind: 'retryWave' });
  }
  assert.ok(sim.view().resources.biomass >= 25, `생체물질 ${sim.view().resources.biomass}`);
  assert.equal(sim.issue({ kind: 'research', tech: 'reinforcedWalls' }).ok, true);
  assert.deepEqual(sim.issue({ kind: 'setAutomation', key: 'autoRebuildWalls', value: 1 }), { ok: true });
  const raw = sim.serialize();
  const resumed = createSim({ seed: 17, save: raw });
  const view = resumed.view();
  assert.deepEqual([...view.researched], ['reinforcedWalls']);
  assert.equal(view.automation.autoRebuildWalls, 1);
  assert.equal(view.wave.index, sim.view().wave.index);
  assert.equal(view.stats.kills, sim.view().stats.kills);
});

test('serializeSave/parseSave 는 대칭이고 과대 입력을 거부한다', () => {
  const save = { version: 1, meta: { ...freshMeta(), insight: 12, discovered: ['flawlessPair'] }, run: null };
  const raw = serializeSave(save);
  assert.equal(typeof raw, 'string');
  const parsed = parseSave(raw);
  assert.equal(parsed.meta.insight, 12);
  assert.deepEqual(parsed.meta.discovered, ['flawlessPair']);
  assert.equal(parsed.run, null);
  assert.equal(parseSave('x'.repeat(2_000_001)).run, null);
});

test('웨이브 도중 판매 → 새로고침으로 환급을 복제할 수 없다', () => {
  const sim = createSim({ seed: 13 });
  harvest(sim);
  sim.issue({ kind: 'build', tile: HARPOON_TILE, building: 'harpoon' });
  sim.issue({ kind: 'build', tile: T(5, 8), building: 'harpoon' });
  const atStart = { ...sim.view().resources };
  sim.issue({ kind: 'startWave' });
  for (let i = 0; i < 30 * 3; i++) sim.step();
  assert.deepEqual(sim.issue({ kind: 'sell', tile: HARPOON_TILE }), { ok: true });
  assert.ok(sim.view().resources.scrap > atStart.scrap, '판매 환급을 받았다');

  const resumed = createSim({ seed: 13, save: sim.serialize() });
  const view = resumed.view();
  assert.equal(view.buildingCount, 2, '판 건물이 웨이브 시작 배치로 돌아온다');
  assert.equal(view.resources.scrap, atStart.scrap, '환급받은 고철은 사라진다');
  assert.equal(view.resources.biomass, atStart.biomass);
});

test('구버전 저장(waveStartEconomy 없음)도 예외 없이 복원된다', () => {
  const sim = createSim({ seed: 13 });
  harvest(sim);
  sim.issue({ kind: 'build', tile: HARPOON_TILE, building: 'harpoon' });
  sim.issue({ kind: 'startWave' });
  for (let i = 0; i < 30 * 3; i++) sim.step();
  const legacy = JSON.parse(sim.serialize());
  delete legacy.run.waveStartEconomy;
  delete legacy.run.consecutiveFlawless;
  const parsed = parseSave(JSON.stringify(legacy));
  assert.equal(parsed.run.waveStartEconomy, null);
  assert.equal(parsed.run.consecutiveFlawless, 0);
  const resumed = createSim({ seed: 13, save: JSON.stringify(legacy) });
  assert.equal(resumed.view().phase, 'build');
});

test('강화한 건물을 복원해도 판매 환급은 실제 투입액 기준이다', () => {
  const sim = createSim({ seed: 13 });
  harvest(sim);
  sim.issue({ kind: 'build', tile: HARPOON_TILE, building: 'harpoon' });
  assert.deepEqual(sim.issue({ kind: 'upgrade', tile: HARPOON_TILE }), { ok: true });
  const resumed = createSim({ seed: 13, save: sim.serialize() });

  const before = sim.view().resources.scrap;
  sim.issue({ kind: 'sell', tile: HARPOON_TILE });
  const refund = sim.view().resources.scrap - before;
  const resumedBefore = resumed.view().resources.scrap;
  resumed.issue({ kind: 'sell', tile: HARPOON_TILE });
  assert.equal(resumed.view().resources.scrap - resumedBefore, refund);
});

test('무피해 연속 기록은 저장을 건너뛰지 않는다', () => {
  const sim = createSim({ seed: 13 });
  const data = JSON.parse(sim.serialize());
  data.run.consecutiveFlawless = 1;
  const resumed = createSim({ seed: 13, save: JSON.stringify(data) });
  assert.equal(parseSave(resumed.serialize()).run.consecutiveFlawless, 1);
});
