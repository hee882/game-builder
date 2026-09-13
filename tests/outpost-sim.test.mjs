import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_ENEMIES, MAX_STEPS_PER_ADVANCE, TICK_SECONDS } from '../src/outpost/contract.ts';
import { ECONOMY, SUB, WAVES } from '../src/outpost/content.ts';
import { createSim } from '../src/outpost/sim.ts';

const T = (x, y) => y * 9 + x;
/** 1장 좌표: 코어 (3,9)(4,9)(3,10)(4,10) · 분출구 (1,0)(7,0) · 잔해 (0,3)(8,3)(0,7)(8,7) · 열수 (2,2)(6,2)(4,8) */
const WRECK_NEAR = T(0, 7);
const COLLECTOR_TILE = T(1, 7); // 잔해 (0,7)에 직교 인접
const HARPOON_TILE = T(3, 8);
const THERMAL_A = T(2, 2);
const THERMAL_B = T(6, 2);

const run = (sim, seconds) => {
  const steps = Math.round(seconds / TICK_SECONDS);
  for (let i = 0; i < steps; i++) sim.step();
};

function harvestUntilExhausted(sim, limitSeconds = 600) {
  const wreck = sim.view().wrecks[0];
  sim.issue({ kind: 'moveSub', to: { x: (wreck.tile % 9) + 0.5, y: Math.floor(wreck.tile / 9) + 0.5 } });
  let steps = 0;
  const max = Math.round(limitSeconds / TICK_SECONDS);
  while (!sim.view().salvage.exhausted && steps < max) {
    sim.step();
    steps++;
  }
  return steps * TICK_SECONDS;
}

/** 웨이브가 끝날 때까지 돌린다(전투 보조 없음). 반환: 경과 초 */
function playWave(sim, limitSeconds = 240) {
  const start = sim.view().wave.index;
  let steps = 0;
  const max = Math.round(limitSeconds / TICK_SECONDS);
  while (sim.view().phase === 'wave' && steps < max) {
    sim.step();
    steps++;
  }
  return { seconds: steps * TICK_SECONDS, startedWave: start, view: sim.view() };
}

test('같은 시드·같은 명령 로그는 같은 digest를 만든다(결정성)', () => {
  const script = (sim) => {
    sim.issue({ kind: 'build', tile: COLLECTOR_TILE, building: 'collector' });
    sim.issue({ kind: 'build', tile: HARPOON_TILE, building: 'harpoon' });
    sim.issue({ kind: 'moveSub', to: { x: 0.5, y: 7.5 } });
    run(sim, 12);
    sim.issue({ kind: 'ability', ability: 'sonarPulse', at: { x: 4, y: 5 } });
    sim.issue({ kind: 'startWave' });
    run(sim, 40);
  };
  const a = createSim({ seed: 42 });
  const b = createSim({ seed: 42 });
  script(a);
  script(b);
  assert.equal(a.digest(), b.digest());
  assert.equal(a.view().tick, b.view().tick);
  // 시드는 실제로 전개를 바꾼다(분출구 배분). 분출구가 2곳이라 일부 시드는 같은 배분이 될 수 있으므로
  // «여러 시드 중 적어도 하나는 다르다»로 검증한다.
  // 전개 중(스폰 분배가 드러나는 시점)에 비교한다. 웨이브가 끝난 뒤에는 합산 상태가 수렴해 같아질 수 있다.
  const digests = new Set();
  for (const seed of [42, 43, 44, 45, 46]) {
    const sim = createSim({ seed });
    sim.issue({ kind: 'build', tile: HARPOON_TILE, building: 'harpoon' });
    sim.issue({ kind: 'startWave' });
    run(sim, 6);
    digests.add(sim.digest());
  }
  assert.ok(digests.size > 1, '시드가 전개(분출구 배분)에 영향을 준다');
});

test('advance 는 호출당 최대 6스텝만 진행한다(탭 복귀 폭주 방지)', () => {
  const sim = createSim({ seed: 1 });
  assert.equal(sim.advance(10), MAX_STEPS_PER_ADVANCE);
  assert.equal(sim.view().tick, MAX_STEPS_PER_ADVANCE);
  assert.equal(sim.advance(0), 0);
  assert.equal(sim.advance(Number.NaN), 0);
  assert.equal(sim.advance(-5), 0);
  assert.equal(sim.advance(TICK_SECONDS * 2), 2);
  assert.ok(sim.alpha >= 0 && sim.alpha <= 1);
});

test('거부된 명령은 상태를 전혀 바꾸지 않는다(원자성)', () => {
  const sim = createSim({ seed: 7 });
  const before = sim.digest();
  const rejects = [
    [{ kind: 'build', tile: Number.NaN, building: 'harpoon' }, 'outOfBounds'],
    [{ kind: 'build', tile: -1, building: 'harpoon' }, 'outOfBounds'],
    [{ kind: 'build', tile: 9999, building: 'harpoon' }, 'outOfBounds'],
    [{ kind: 'build', tile: 4.5, building: 'harpoon' }, 'outOfBounds'],
    [{ kind: 'build', tile: T(2, 4), building: 'harpoon' }, 'tileNotBuildable'], // 암반
    [{ kind: 'build', tile: T(3, 9), building: 'harpoon' }, 'tileNotBuildable'], // 코어
    [{ kind: 'build', tile: WRECK_NEAR, building: 'harpoon' }, 'tileNotBuildable'], // 잔해
    [{ kind: 'build', tile: T(4, 5), building: 'mortar' }, 'buildingLocked'], // 2웨이브 클리어 전
    [{ kind: 'build', tile: T(4, 5), building: 'resonator' }, 'buildingLocked'], // 발견 전
    [{ kind: 'build', tile: T(4, 5), building: 'bogus' }, 'buildingLocked'],
    [{ kind: 'build', tile: T(4, 5), building: 'collector' }, 'notAdjacentToWreck'],
    [{ kind: 'upgrade', tile: T(4, 5) }, 'tileNotBuildable'],
    [{ kind: 'sell', tile: T(4, 5) }, 'tileNotBuildable'],
    [{ kind: 'setPolicy', tile: T(4, 5), policy: 'nearest' }, 'tileNotBuildable'],
    [{ kind: 'setPolicy', tile: T(4, 5), policy: 'bogus' }, 'outOfBounds'],
    [{ kind: 'moveSub', to: { x: Number.NaN, y: 1 } }, 'outOfBounds'],
    [{ kind: 'moveSub', to: { x: 1, y: Number.POSITIVE_INFINITY } }, 'outOfBounds'],
    [{ kind: 'ability', ability: 'bogus', at: { x: 1, y: 1 } }, 'outOfBounds'],
    [{ kind: 'ability', ability: 'sonarPulse', at: { x: Number.NaN, y: 1 } }, 'outOfBounds'],
    [{ kind: 'research', tech: 'bogus' }, 'outOfBounds'],
    [{ kind: 'research', tech: 'piercingHarpoon' }, 'notEnoughResources'], // 생체물질 0
    [{ kind: 'setAutomation', key: 'bogus', value: 1 }, 'outOfBounds'],
    [{ kind: 'setAutomation', key: 'droneRole', value: Number.NaN }, 'outOfBounds'],
    [{ kind: 'setAutomation', key: 'droneRole', value: 1 }, 'buildingLocked'], // 드론정비고 없음
    [{ kind: 'advanceChapter' }, 'wrongPhase'],
    [{ kind: 'retryWave' }, 'nothingToRetry'],
    [{ kind: 'spendInsight', perk: 'bogus' }, 'outOfBounds'],
    [{ kind: 'spendInsight', perk: 'startScrap' }, 'notEnoughInsight'],
  ];
  for (const [command, reason] of rejects) {
    const result = sim.issue(command);
    assert.equal(result.ok, false, `${command.kind} must be rejected`);
    assert.equal(result.reason, reason, `${command.kind}/${command.building ?? command.perk ?? ''}`);
  }
  assert.equal(sim.digest(), before, '거부는 상태를 바꾸지 않는다');
  assert.equal(sim.view().resources.scrap, ECONOMY.startScrap);
});

test('자원을 초과 지출할 수 없고 음수가 되지 않는다', () => {
  const sim = createSim({ seed: 3 });
  // 시작 80 고철: 수집기 30 + 작살 45 = 75 까지만 가능
  assert.deepEqual(sim.issue({ kind: 'build', tile: COLLECTOR_TILE, building: 'collector' }), { ok: true });
  assert.deepEqual(sim.issue({ kind: 'build', tile: HARPOON_TILE, building: 'harpoon' }), { ok: true });
  assert.equal(sim.issue({ kind: 'build', tile: T(5, 8), building: 'harpoon' }).reason, 'notEnoughResources');
  assert.ok(sim.view().resources.scrap >= 0);
  // 무작위 난사에도 음수가 없다
  let value = 12345;
  const rand = () => ((value = (value * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 2000; i++) {
    const tile = Math.floor(rand() * 120) - 5;
    const buildings = ['bulkhead', 'collector', 'harpoon', 'mortar', 'droneBay', 'resonator'];
    sim.issue({ kind: 'build', tile, building: buildings[Math.floor(rand() * buildings.length)] });
    sim.issue({ kind: 'upgrade', tile });
    sim.issue({ kind: 'sell', tile });
    if (i % 50 === 0) sim.step();
    const view = sim.view();
    assert.ok(view.resources.scrap >= 0, 'scrap must never go negative');
    assert.ok(view.resources.biomass >= 0, 'biomass must never go negative');
  }
});

test('건설·강화·판매 왕복은 언제나 순손실이다(무한 환급 악용 불가)', () => {
  const sim = createSim({ seed: 5 });
  const start = sim.view().resources.scrap;
  sim.issue({ kind: 'build', tile: HARPOON_TILE, building: 'harpoon' });
  sim.issue({ kind: 'sell', tile: HARPOON_TILE });
  const afterRoundtrip = sim.view().resources.scrap;
  assert.ok(afterRoundtrip < start, `왕복 후 ${afterRoundtrip} < ${start}`);
  assert.equal(afterRoundtrip, start - 45 * (1 - ECONOMY.sellRefund));

  // 강화 후 판매도 이득이 될 수 없다
  const sim2 = createSim({ seed: 5 });
  sim2.issue({ kind: 'build', tile: T(3, 8), building: 'bulkhead' });
  const beforeUpgrade = sim2.view().resources.scrap;
  assert.deepEqual(sim2.issue({ kind: 'upgrade', tile: T(3, 8) }), { ok: true });
  const spent = beforeUpgrade - sim2.view().resources.scrap;
  assert.ok(spent > 0);
  sim2.issue({ kind: 'sell', tile: T(3, 8) });
  assert.ok(sim2.view().resources.scrap < beforeUpgrade, '강화 후 판매도 손실');
  // 최대 레벨 이상 강화는 거부
  const sim3 = createSim({ seed: 5 });
  sim3.issue({ kind: 'build', tile: T(3, 8), building: 'bulkhead' });
  sim3.issue({ kind: 'upgrade', tile: T(3, 8) });
  sim3.issue({ kind: 'upgrade', tile: T(3, 8) });
  assert.equal(sim3.issue({ kind: 'upgrade', tile: T(3, 8) }).reason, 'maxLevel');
});

test('유한 인양 리저브: 10분을 방치해도 배정량을 넘지 못한다', () => {
  const sim = createSim({ seed: 9 });
  const reserve = sim.view().salvage.reserveTotal;
  assert.equal(reserve, WAVES[0].salvageReserve);
  sim.issue({ kind: 'build', tile: COLLECTOR_TILE, building: 'collector' });
  const spent = ECONOMY.startScrap - sim.view().resources.scrap;
  const elapsed = harvestUntilExhausted(sim, 600);
  assert.ok(elapsed < 600, '리저브는 유한해서 반드시 소진된다');
  run(sim, 600); // 추가로 10분 방치
  const view = sim.view();
  assert.equal(view.salvage.reserveRemaining, 0);
  assert.equal(view.salvage.exhausted, true);
  assert.equal(view.incomePerSecond.scrap, 0, '소진 후 수입 표시도 0');
  const gained = view.resources.scrap + spent - ECONOMY.startScrap;
  assert.ok(Math.abs(gained - reserve) < 0.5, `획득 ${gained.toFixed(1)} ≈ 리저브 ${reserve}`);
  assert.ok(Math.abs(view.salvage.harvestedThisCycle - reserve) < 0.5);
  // 소진 이벤트는 한 번만
  const events = sim.drainEvents();
  assert.equal(events.filter((event) => event.kind === 'salvageExhausted').length, 1);
});

test('오프라인 수입은 2시간·40%·남은 리저브 상한을 모두 지킨다', () => {
  const sim = createSim({ seed: 11 });
  sim.issue({ kind: 'build', tile: COLLECTOR_TILE, building: 'collector' });
  const save = sim.serialize();
  // 수집기 1기(3.2/s) × 7200초 × 0.4 = 9216 → 리저브(70)로 잘린다
  const resumed = createSim({ seed: 11, save, offlineSeconds: 100000 });
  const view = resumed.view();
  assert.ok(view.salvage.offlineGranted <= WAVES[0].salvageReserve);
  assert.equal(view.salvage.reserveRemaining, 0);
  assert.equal(view.wave.index, 1, '오프라인은 웨이브를 진행시키지 않는다');
  assert.equal(view.phase, 'build');
  // 소진된 상태를 다시 불러와도 리저브가 되살아나지 않는다
  const again = createSim({ seed: 11, save: resumed.serialize(), offlineSeconds: 100000 });
  assert.equal(again.view().salvage.reserveRemaining, 0);
  assert.equal(again.view().salvage.offlineGranted, 0);
  // 음수·비정상 입력은 0으로
  const zero = createSim({ seed: 11, save, offlineSeconds: -500 });
  assert.equal(zero.view().salvage.offlineGranted, 0);
  const nan = createSim({ seed: 11, save, offlineSeconds: Number.NaN });
  assert.equal(nan.view().salvage.offlineGranted, 0);
});

test('preview 는 상태를 바꾸지 않고 봉쇄·경로 변화를 알려 준다', () => {
  const sim = createSim({ seed: 13 });
  const before = sim.digest();
  const preview = sim.preview(T(4, 6), 'bulkhead');
  assert.equal(preview.result.ok, true);
  assert.equal(preview.cost.scrap, 12);
  assert.equal(sim.digest(), before, 'preview 는 부작용이 없다');
  assert.ok(preview.ghostDist.length === 108);
  // 중앙만 막으면 경로가 바뀌지만 봉쇄는 아니다(바깥 레인이 열려 있다)
  assert.ok(preview.changedTiles.length > 0);
  assert.equal(preview.sealsPath, false);
  assert.equal(preview.breachTile, -1);

  // 행 6(천연 초크, 개방 열 0·3·4·5·8)을 모두 막으면 봉쇄가 되고 부술 벽을 알려 준다.
  // 행 7은 잔해 타일(0,7)(8,7)이 «건설 불가 + 통행 가능»이라 애초에 봉쇄할 수 없다.
  const sealing = createSim({ seed: 13 });
  harvestUntilExhausted(sealing);
  for (const x of [3, 4, 5, 8]) sealing.issue({ kind: 'build', tile: T(x, 6), building: 'bulkhead' });
  const sealPreview = sealing.preview(T(0, 6), 'bulkhead');
  assert.equal(sealPreview.sealsPath, true);
  assert.ok(sealPreview.breachTile >= 0);
  assert.ok(sealPreview.pathDeltaSeconds >= 0);
  // 거부되는 미리보기도 부작용이 없다
  const digest = sealing.digest();
  const bad = sealing.preview(-7, 'harpoon');
  assert.equal(bad.result.ok, false);
  assert.equal(sealing.digest(), digest);
});

test('웨이브 1은 시작 자원만으로 60초 안에 첫 보상을 준다', () => {
  const sim = createSim({ seed: 17 });
  sim.issue({ kind: 'build', tile: COLLECTOR_TILE, building: 'collector' });
  sim.issue({ kind: 'build', tile: HARPOON_TILE, building: 'harpoon' });
  // 첫 인양 보상이 들어오는 시점
  sim.issue({ kind: 'moveSub', to: { x: 0.5, y: 7.5 } });
  let firstGain = -1;
  for (let i = 0; i < 30 * 30 && firstGain < 0; i++) {
    sim.step();
    if (sim.view().stats.manualSalvage > 0) firstGain = (i + 1) * TICK_SECONDS;
  }
  assert.ok(firstGain > 0 && firstGain < 15, `첫 수동 인양 ${firstGain.toFixed(1)}초`);
  harvestUntilExhausted(sim);
  sim.issue({ kind: 'build', tile: T(5, 8), building: 'harpoon' });
  sim.issue({ kind: 'build', tile: T(4, 7), building: 'harpoon' });
  sim.issue({ kind: 'startWave' });
  const { seconds, view } = playWave(sim);
  assert.equal(view.phase, 'build');
  assert.equal(view.wave.index, 2, '웨이브 1 클리어 후 2로 넘어간다');
  assert.ok(view.resources.scrap > 0);
  assert.ok(sim.view().stats.elapsed < 90, `웨이브 1 종료까지 ${sim.view().stats.elapsed.toFixed(1)}초`);
  assert.ok(seconds < 90);
  assert.equal(view.insight >= 1, true, '최초 클리어는 통찰 +1');
});

test('동시 적 수는 상한을 넘지 않고 보스 소환도 상한 안에 있다', () => {
  const sim = createSim({ seed: 19 });
  let peak = 0;
  for (let wave = 1; wave <= 8; wave++) {
    harvestUntilExhausted(sim);
    sim.issue({ kind: 'startWave' });
    let steps = 0;
    while (sim.view().phase === 'wave' && steps < 30 * 240) {
      sim.step();
      steps++;
      peak = Math.max(peak, sim.view().enemyCount);
      assert.ok(sim.view().enemyCount <= MAX_ENEMIES, 'MAX_ENEMIES 초과');
    }
    const view = sim.view();
    if (view.phase === 'chapterCleared') sim.issue({ kind: 'advanceChapter' });
    else if (view.phase === 'defeat') sim.issue({ kind: 'retryWave' });
    else if (view.phase === 'victory') break;
  }
  assert.ok(peak > 0);
  assert.ok(peak <= MAX_ENEMIES);
});

test('부유체는 벽을 넘어가고 지상 적은 벽을 부순다', () => {
  const sim = createSim({ seed: 23 });
  // 천연 초크(행 6)를 완전히 막는다 → 우회로가 없으니 지상 적은 벽을 부숴야 한다
  harvestUntilExhausted(sim);
  for (const x of [0, 3, 4, 5, 8]) {
    assert.deepEqual(sim.issue({ kind: 'build', tile: T(x, 6), building: 'bulkhead' }), { ok: true });
  }
  const walls = sim.view().buildingCount;
  assert.equal(walls, 5);
  // 웨이브 1(표류체)은 벽을 부순다
  sim.issue({ kind: 'startWave' });
  let breached = false;
  for (let i = 0; i < 30 * 120 && sim.view().phase === 'wave'; i++) {
    sim.step();
    const view = sim.view();
    for (let e = 0; e < view.enemyCount; e++) if (view.enemies[e].breaching) breached = true;
  }
  assert.equal(breached, true, '지상 적은 벽을 때린다');
  assert.ok(sim.view().stats.wallsLost > 0, '벽이 실제로 파괴된다');
});

test('잠수정: 자동 사격·피격·부활, 그리고 다운 중 명령 거부', () => {
  const sim = createSim({ seed: 29 });
  harvestUntilExhausted(sim);
  sim.issue({ kind: 'startWave' });
  // 잠수정을 «실제 진입 레인»(행 0에서 열 3·4로 모인 뒤 내려온다)에 세워 몸으로 막는다.
  sim.issue({ kind: 'moveSub', to: { x: 3.5, y: 2.5 } });
  let downed = false;
  let hpDropped = false;
  const startHp = sim.view().sub.hp;
  for (let i = 0; i < 30 * 400 && !downed; i++) {
    sim.step();
    const view = sim.view();
    if (view.sub.hp < startHp) hpDropped = true;
    if (view.sub.downedTicks > 0) downed = true;
    if (view.phase === 'build') {
      sim.issue({ kind: 'startWave' });
      sim.issue({ kind: 'moveSub', to: { x: 3.5, y: 2.5 } });
    }
    if (view.phase === 'defeat') sim.issue({ kind: 'retryWave' });
  }
  assert.equal(hpDropped, true, '레인에 서 있으면 피해를 받는다');
  assert.equal(downed, true, '접촉 피해로 잠수정이 다운된다');
  assert.equal(sim.issue({ kind: 'ability', ability: 'sonarPulse', at: { x: 2, y: 2 } }).reason, 'subDowned');
  assert.equal(sim.issue({ kind: 'moveSub', to: { x: 4, y: 9 } }).reason, 'subDowned');
  run(sim, SUB.downedSeconds + 0.5);
  assert.equal(sim.view().sub.downedTicks, 0, '부활한다');
  assert.ok(sim.view().sub.hp > 0);
  assert.ok(sim.view().stats.kills > 0, '자동 사격으로 적을 잡는다');
});

test('액티브: 쿨다운 거부·정밀 판정·용접은 구조물/코어를 회복한다', () => {
  const sim = createSim({ seed: 31 });
  assert.deepEqual(sim.issue({ kind: 'ability', ability: 'sonarPulse', at: { x: 4, y: 4 } }), { ok: true });
  assert.equal(sim.issue({ kind: 'ability', ability: 'sonarPulse', at: { x: 4, y: 4 } }).reason, 'onCooldown');
  assert.equal(sim.view().stats.abilityUses, 1);
  const abilities = sim.view().sub.abilities;
  assert.equal(abilities.length, 2);
  assert.ok(abilities[0].cooldown > 0 && abilities[0].cooldownMax === 8);
  assert.ok(abilities[0].meter >= 0 && abilities[0].meter <= 1);
  assert.ok(abilities[0].perfectWindow > 0);

  // 용접: 손상된 벽을 회복
  const sim2 = createSim({ seed: 31 });
  sim2.issue({ kind: 'build', tile: T(4, 6), building: 'bulkhead' });
  harvestUntilExhausted(sim2);
  sim2.issue({ kind: 'startWave' });
  for (let i = 0; i < 30 * 200 && sim2.view().phase === 'wave'; i++) {
    sim2.step();
    const view = sim2.view();
    let damaged = null;
    for (let b = 0; b < view.buildingCount; b++) {
      if (view.buildings[b].hp < view.buildings[b].maxHp) damaged = view.buildings[b];
    }
    if (damaged) {
      const hp = damaged.hp;
      const result = sim2.issue({
        kind: 'ability',
        ability: 'weld',
        at: { x: (damaged.tile % 9) + 0.5, y: Math.floor(damaged.tile / 9) + 0.5 },
      });
      if (result.ok) {
        const after = sim2.view();
        let healed = false;
        for (let b = 0; b < after.buildingCount; b++) {
          if (after.buildings[b].tile === damaged.tile && after.buildings[b].hp > hp) healed = true;
        }
        assert.equal(healed, true, '용접은 구조물을 회복한다');
        break;
      }
    }
  }
});

test('숨은 해금은 1회만 지급되고 공명기를 열어 준다', () => {
  const sim = createSim({ seed: 37 });
  harvestUntilExhausted(sim);
  // 열수 타일 2곳에 공격 건물 → ventResonance
  assert.deepEqual(sim.issue({ kind: 'build', tile: THERMAL_A, building: 'harpoon' }), { ok: true });
  assert.equal(sim.view().discovered.includes('ventResonance'), false);
  const insightBefore = sim.view().insight;
  assert.deepEqual(sim.issue({ kind: 'build', tile: THERMAL_B, building: 'harpoon' }), { ok: true });
  const view = sim.view();
  assert.equal(view.discovered.includes('ventResonance'), true);
  assert.equal(view.insight, insightBefore + 3);
  assert.equal(view.unlockedBuildings.includes('resonator'), true);
  const events = sim.drainEvents().filter((event) => event.kind === 'discovered');
  assert.equal(events.length, 1);
  // 같은 조건을 더 만족해도 다시 지급되지 않는다
  sim.issue({ kind: 'build', tile: T(4, 8), building: 'harpoon' });
  assert.equal(sim.view().insight, insightBefore + 3);
  assert.equal(sim.drainEvents().filter((event) => event.kind === 'discovered').length, 0);
  // 공명기는 열수 타일에만
  assert.equal(sim.issue({ kind: 'build', tile: T(4, 5), building: 'resonator' }).reason, 'thermalOnly');
});

test('전투 중 전방 잔해 인양이 심해 고고학을 발견시킨다(누적 카운터 아님)', () => {
  const sim = createSim({ seed: 41 });
  harvestUntilExhausted(sim); // 1웨이브 리저브를 미리 다 쓰면 발견이 안 된다 → 다시 채워지는 2웨이브에서 시도
  sim.issue({ kind: 'build', tile: HARPOON_TILE, building: 'harpoon' });
  sim.issue({ kind: 'startWave' });
  // 전투 중 전방 잔해 (0,3) 로 간다
  sim.issue({ kind: 'moveSub', to: { x: 0.5, y: 3.5 } });
  let found = false;
  for (let i = 0; i < 30 * 200 && !found; i++) {
    sim.step();
    if (sim.view().phase !== 'wave') {
      sim.issue({ kind: 'startWave' });
      sim.issue({ kind: 'moveSub', to: { x: 0.5, y: 3.5 } });
    }
    found = sim.view().discovered.includes('deepArchaeology');
  }
  assert.equal(found, true, '전투 중 전방 인양으로 발견된다');
});

test('실패 → 같은 웨이브 재시도: 진행·발견은 유지되고 재건 예산이 지급된다', () => {
  const sim = createSim({ seed: 43 });
  harvestUntilExhausted(sim);
  sim.issue({ kind: 'build', tile: THERMAL_A, building: 'harpoon' });
  sim.issue({ kind: 'build', tile: THERMAL_B, building: 'harpoon' }); // 발견 확보
  // 방어 없이 여러 웨이브를 흘려 코어를 깎는다
  let guard = 0;
  while (sim.view().phase !== 'defeat' && guard < 30 * 60 * 20) {
    const view = sim.view();
    if (view.phase === 'build') {
      sim.issue({ kind: 'startWave' });
      continue;
    }
    if (view.phase === 'chapterCleared') {
      sim.issue({ kind: 'advanceChapter' });
      continue;
    }
    if (view.phase === 'victory') break;
    sim.step();
    guard++;
  }
  const defeated = sim.view();
  assert.equal(defeated.phase, 'defeat');
  assert.equal(defeated.retry.available, true);
  assert.equal(defeated.retry.keepsDiscoveries, true);
  const failedWave = defeated.wave.index;
  const discoveries = [...defeated.discovered];
  const insight = defeated.insight;
  const grant = defeated.retry.rebuildGrant;
  const scrap = defeated.resources.scrap;
  assert.ok(grant > 0, '재건 예산이 있다');

  assert.deepEqual(sim.issue({ kind: 'retryWave' }), { ok: true });
  const retried = sim.view();
  assert.equal(retried.phase, 'build');
  assert.equal(retried.wave.index, failedWave, '같은 웨이브를 다시 한다');
  assert.equal(retried.core.hp, retried.core.maxHp, '코어가 복구된다');
  assert.deepEqual([...retried.discovered], discoveries, '발견은 유지된다');
  assert.equal(retried.insight, insight, '통찰은 유지된다');
  assert.equal(retried.resources.scrap, scrap + grant, '재건 예산이 지급된다');
  assert.equal(retried.retry.attempts, 1);
  assert.ok(retried.salvage.reserveRemaining > 0, '재시도하면 리저브가 다시 배정된다');
  // 재시도 횟수가 늘면 예산도 늘어난다(벌점 없음)
  assert.ok(retried.retry.rebuildGrant > grant);
});

test('장 전환: 4웨이브 클리어 → chapterCleared → 2장 레이아웃과 5웨이브', () => {
  const sim = createSim({ seed: 47 });
  let guard = 0;
  while (sim.view().phase !== 'chapterCleared' && guard < 30 * 60 * 20) {
    const view = sim.view();
    if (view.phase === 'build') {
      harvestUntilExhausted(sim);
      sim.issue({ kind: 'build', tile: HARPOON_TILE, building: 'harpoon' });
      sim.issue({ kind: 'build', tile: T(5, 8), building: 'harpoon' });
      sim.issue({ kind: 'build', tile: T(4, 7), building: 'harpoon' });
      sim.issue({ kind: 'startWave' });
      continue;
    }
    if (view.phase === 'defeat') {
      sim.issue({ kind: 'retryWave' });
      continue;
    }
    sim.step();
    guard++;
  }
  const cleared = sim.view();
  assert.equal(cleared.phase, 'chapterCleared');
  assert.equal(cleared.chapterCleared, true);
  assert.equal(cleared.wave.index, 4);
  assert.equal(cleared.chapter, 1);
  assert.equal(sim.issue({ kind: 'startWave' }).reason, 'wrongPhase');
  const insight = cleared.insight;
  const terrainBefore = [...cleared.terrain];

  assert.deepEqual(sim.issue({ kind: 'advanceChapter' }), { ok: true });
  const chapter2 = sim.view();
  assert.equal(chapter2.chapter, 2);
  assert.equal(chapter2.wave.index, 5);
  assert.equal(chapter2.phase, 'build');
  assert.equal(chapter2.insight, insight + 8);
  assert.notDeepEqual([...chapter2.terrain], terrainBefore, '레이아웃이 바뀐다');
  assert.equal(chapter2.buildingCount, 0, '건물은 두고 간다');
  assert.ok(chapter2.resources.scrap > 0, '이전 예산이 지급된다');
  // 2장 분출구는 3곳
  assert.equal(chapter2.wave.incoming.length, 3);
});

test('자동화는 해금 후에만 설정되고 드론이 실제로 일한다', () => {
  const sim = createSim({ seed: 53 });
  assert.equal(sim.issue({ kind: 'setAutomation', key: 'droneRole', value: 1 }).reason, 'buildingLocked');
  // 드론정비고는 3웨이브 클리어 후 해금
  let guard = 0;
  while (sim.view().wave.index <= 3 && guard < 30 * 60 * 20) {
    const view = sim.view();
    if (view.phase === 'build') {
      harvestUntilExhausted(sim);
      sim.issue({ kind: 'build', tile: HARPOON_TILE, building: 'harpoon' });
      sim.issue({ kind: 'build', tile: T(5, 8), building: 'harpoon' });
      sim.issue({ kind: 'build', tile: T(4, 7), building: 'harpoon' });
      sim.issue({ kind: 'startWave' });
      continue;
    }
    if (view.phase === 'defeat') {
      sim.issue({ kind: 'retryWave' });
      continue;
    }
    if (view.phase !== 'wave') break;
    sim.step();
    guard++;
  }
  assert.ok(sim.view().unlockedBuildings.includes('droneBay'), '3웨이브 클리어로 드론정비고 해금');
  harvestUntilExhausted(sim);
  const built = sim.issue({ kind: 'build', tile: T(2, 8), building: 'droneBay' });
  if (built.ok) {
    assert.ok(sim.view().automationUnlocked.includes('droneRole'));
    assert.deepEqual(sim.issue({ kind: 'setAutomation', key: 'droneRole', value: 0 }), { ok: true });
    assert.equal(sim.view().automation.droneRole, 0);
    assert.equal(sim.issue({ kind: 'setAutomation', key: 'droneRole', value: 99 }).ok, true);
    assert.equal(sim.view().automation.droneRole, 2, '값은 0..2로 고정된다');
    run(sim, 1);
    assert.ok(sim.view().droneCount >= 1, '드론이 생긴다');
  }
});

test('view() 는 같은 객체를 돌려주고 배열을 재사용한다', () => {
  const sim = createSim({ seed: 59 });
  const first = sim.view();
  const enemies = first.enemies;
  const buildings = first.buildings;
  run(sim, 1);
  const second = sim.view();
  assert.equal(first, second, '같은 객체 참조');
  assert.equal(enemies, second.enemies, '배열도 재사용');
  assert.equal(buildings, second.buildings);
  assert.equal(second.enemies.length, MAX_ENEMIES, '풀 길이는 고정');
});

test('이벤트는 한 번만 drain 된다', () => {
  const sim = createSim({ seed: 61 });
  sim.issue({ kind: 'build', tile: HARPOON_TILE, building: 'harpoon' });
  const first = sim.drainEvents();
  assert.ok(first.length > 0);
  assert.equal(sim.drainEvents().length, 0, '두 번째 drain 은 비어 있다');
});

test('시뮬레이션 소스에 DOM·실시간·Math.random 이 없다', () => {
  const files = ['sim.ts', 'sim-state.ts', 'sim-combat.ts', 'sim-economy.ts', 'content.ts', 'path.ts', 'save.ts'];
  const forbidden = ['Math.random', 'Date.now', 'new Date', 'performance.now', 'window.', 'document.', 'localStorage'];
  for (const file of files) {
    const raw = readFileSync(new URL(`../src/outpost/${file}`, import.meta.url), 'utf8');
    // 주석은 제외하고 «실제 코드»만 본다(문서 주석에서 금지 API를 언급할 수는 있다)
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const token of forbidden) {
      assert.ok(!source.includes(token), `${file} must not use ${token}`);
    }
  }
});
