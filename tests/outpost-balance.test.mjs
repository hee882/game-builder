/**
 * 밸런스·도달성 검증. 단정은 «부등식과 구간»만 쓴다(정확값을 박으면 튜닝마다 깨진다).
 *
 * 핵심 질문 셋:
 *   1. 건전한 전략 3종이 «재시도 없이» 8웨이브를 깰 수 있는가
 *   2. 나쁜 전략은 실제로 후반에 무너지는가
 *   3. 무너진 뒤에도 막히지 않는가(재시도로 계속 진행 가능)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_SECONDS } from '../src/outpost/contract.ts';
import { BOSS_SUMMON, ENEMIES, HP_GROWTH_PER_WAVE, TOTAL_WAVES, VARIANTS, WAVES } from '../src/outpost/content.ts';
import { createSim } from '../src/outpost/sim.ts';

const T = (x, y) => y * 9 + x;

/** 전략 = «배치 계획 + 테크 선택». 웨이브 번호별로 그 웨이브 준비 단계에서 시도할 항목. */
const STRATEGIES = {
  // 초크 미로 + 박격포: 경로를 늘려 폭발로 태운다
  mazeMortar: {
    techs: ['wideBlast', 'reinforcedWalls'],
    plan: {
      1: [[T(1, 7), 'collector'], [T(3, 8), 'harpoon']],
      2: [[T(5, 8), 'harpoon'], [T(0, 6), 'bulkhead'], [T(8, 6), 'bulkhead']],
      3: [[T(4, 7), 'mortar'], ['up', T(3, 8)]],
      4: [[T(1, 8), 'droneBay'], [T(4, 2), 'harpoon'], ['up', T(4, 7)]],
      5: [[T(4, 6), 'collector'], [T(1, 8), 'harpoon'], [T(7, 8), 'harpoon']],
      6: [[T(4, 7), 'mortar'], [T(3, 3), 'resonator'], ['up', T(1, 8)]],
      7: [[T(5, 3), 'resonator'], [T(4, 4), 'harpoon'], ['up', T(7, 8)], ['up', T(4, 7)]],
      8: [[T(4, 5), 'mortar'], [T(3, 8), 'harpoon'], [T(5, 8), 'harpoon'], ['up', T(3, 3)]],
    },
  },
  // 분산 대공 작살망: 공중·지상을 끊김 없이 맞춘다
  distributedHarpoons: {
    techs: ['piercingHarpoon', 'droneLogistics'],
    plan: {
      1: [[T(1, 7), 'collector'], [T(3, 8), 'harpoon']],
      2: [[T(5, 8), 'harpoon'], [T(2, 5), 'harpoon']],
      3: [[T(6, 5), 'harpoon'], ['up', T(3, 8)]],
      4: [[T(2, 8), 'droneBay'], [T(4, 2), 'harpoon'], [T(1, 3), 'harpoon'], ['up', T(5, 8)]],
      5: [[T(4, 6), 'collector'], [T(1, 8), 'harpoon'], [T(7, 8), 'harpoon']],
      6: [[T(3, 5), 'harpoon'], [T(5, 5), 'harpoon'], ['up', T(1, 8)], ['up', T(7, 8)]],
      7: [[T(4, 4), 'harpoon'], [T(2, 7), 'harpoon'], ['up', T(3, 5)]],
      8: [[T(6, 7), 'harpoon'], [T(4, 7), 'mortar'], ['up', T(5, 5)], ['up', T(4, 4)]],
    },
  },
  // 전진 열수 공명기: 스폰 직후에 녹이고 전방 잔해로 돈을 번다
  forwardResonator: {
    techs: ['reinforcedWalls'],
    plan: {
      1: [[T(1, 7), 'collector'], [T(3, 8), 'harpoon']],
      2: [[T(5, 8), 'harpoon'], [T(2, 2), 'harpoon']],
      3: [[T(6, 2), 'harpoon'], ['up', T(3, 8)]],
      4: [[T(2, 8), 'droneBay'], [T(4, 7), 'mortar'], ['up', T(5, 8)]],
      5: [[T(4, 6), 'collector'], [T(1, 8), 'harpoon'], [T(7, 8), 'harpoon']],
      6: [[T(3, 3), 'resonator'], [T(5, 3), 'resonator'], [T(0, 2), 'collector']],
      7: [[T(4, 4), 'harpoon'], ['up', T(3, 3)], ['up', T(5, 3)]],
      8: [[T(4, 7), 'mortar'], [T(4, 2), 'harpoon'], ['up', T(4, 7)]],
    },
  },
  // 나쁜 전략 A: 경제와 벽에만 쓰고 화력을 올리지 않는다
  wallsOnly: {
    techs: ['reinforcedWalls'],
    plan: {
      1: [[T(1, 7), 'collector'], [T(3, 8), 'harpoon']],
      2: [[T(0, 6), 'bulkhead'], [T(8, 6), 'bulkhead'], [T(3, 6), 'bulkhead']],
      3: [[T(4, 6), 'bulkhead'], [T(5, 6), 'bulkhead'], [T(1, 8), 'bulkhead']],
      4: [[T(7, 8), 'bulkhead'], [T(2, 8), 'bulkhead'], [T(6, 8), 'bulkhead']],
      5: [[T(4, 6), 'collector'], [T(3, 7), 'bulkhead'], [T(5, 7), 'bulkhead']],
      6: [[T(3, 8), 'bulkhead'], [T(5, 8), 'bulkhead']],
      7: [[T(2, 7), 'bulkhead'], [T(6, 7), 'bulkhead']],
      8: [[T(1, 5), 'bulkhead'], [T(7, 5), 'bulkhead']],
    },
  },
  // 나쁜 전략 B: 코어 옆에 단일 타겟만 뭉쳐 놓는다(광역·전진·경로 설계 없음)
  poorClump: {
    techs: ['piercingHarpoon'],
    plan: {
      1: [[T(1, 7), 'collector'], [T(3, 8), 'harpoon']],
      2: [[T(5, 8), 'harpoon']],
      3: [[T(2, 8), 'harpoon']],
      4: [[T(6, 7), 'droneBay'], [T(6, 8), 'harpoon']],
      5: [[T(4, 8), 'harpoon']],
      6: [[T(1, 8), 'harpoon']],
      7: [[T(7, 8), 'harpoon']],
      8: [[T(2, 7), 'harpoon']],
    },
  },
};

function nearestWreck(view) {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const wreck of view.wrecks) {
    const x = (wreck.tile % 9) + 0.5;
    const y = Math.floor(wreck.tile / 9) + 0.5;
    const distance = Math.hypot(x - view.sub.pos.x, y - view.sub.pos.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x, y };
    }
  }
  return best;
}

/**
 * 결정적 스크립트 봇. 준비 단계에서는 계획 실행 + 리저브를 다 캐고,
 * 전투에서는 체력에 따라 정박 수리/스탠드오프를 고르고 액티브를 쓴다.
 */
function play(name, { seed = 11, maxRetries = 0, limitMinutes = 40 } = {}) {
  const strategy = STRATEGIES[name];
  const sim = createSim({ seed });
  const applied = new Set();
  const phases = new Set();
  const reached = { wave: 1, chapter: 1 };
  let retries = 0;
  let guard = 0;
  const maxSteps = Math.round((limitMinutes * 60) / TICK_SECONDS);

  while (guard < maxSteps) {
    const view = sim.view();
    phases.add(view.phase);
    reached.wave = Math.max(reached.wave, view.wave.index);
    reached.chapter = Math.max(reached.chapter, view.chapter);
    if (view.phase === 'victory') break;
    if (view.phase === 'chapterCleared') {
      sim.issue({ kind: 'advanceChapter' });
      continue;
    }
    if (view.phase === 'defeat') {
      if (retries >= maxRetries) break;
      retries++;
      sim.issue({ kind: 'retryWave' });
      continue;
    }
    if (view.phase === 'build') {
      for (let wave = 1; wave <= view.wave.index; wave++) {
        for (const [first, second] of strategy.plan[wave] ?? []) {
          const key = `${wave}:${first}:${second}`;
          if (applied.has(key)) continue;
          const result =
            first === 'up'
              ? sim.issue({ kind: 'upgrade', tile: second })
              : sim.issue({ kind: 'build', tile: first, building: second });
          if (result.ok) applied.add(key);
        }
      }
      for (const tech of strategy.techs) sim.issue({ kind: 'research', tech });
      sim.issue({ kind: 'setAutomation', key: 'droneRole', value: 0 });
      sim.issue({ kind: 'setAutomation', key: 'autoRebuildWalls', value: 1 });
      const wreck = nearestWreck(view);
      if (wreck) sim.issue({ kind: 'moveSub', to: wreck });
      if (view.salvage.exhausted || view.wave.buildSeconds > 180) {
        sim.issue({ kind: 'startWave' });
        continue;
      }
      sim.step();
      guard++;
      continue;
    }
    // 전투
    const hurt = view.sub.hp < view.sub.maxHp * 0.45;
    sim.issue({ kind: 'moveSub', to: hurt ? { x: 4, y: 10 } : { x: 6.2, y: 8.5 } });
    let sumX = 0;
    let sumY = 0;
    let threats = 0;
    for (let i = 0; i < view.enemyCount; i++) {
      const enemy = view.enemies[i];
      if (enemy.pos.y < 4) continue;
      sumX += enemy.pos.x;
      sumY += enemy.pos.y;
      threats++;
    }
    if (threats >= 3) sim.issue({ kind: 'ability', ability: 'sonarPulse', at: { x: sumX / threats, y: sumY / threats } });
    let weakest = null;
    for (let i = 0; i < view.buildingCount; i++) {
      const building = view.buildings[i];
      if (building.hp / building.maxHp < 0.5 && (weakest === null || building.hp < weakest.hp)) weakest = building;
    }
    if (weakest) {
      sim.issue({
        kind: 'ability',
        ability: 'weld',
        at: { x: (weakest.tile % 9) + 0.5, y: Math.floor(weakest.tile / 9) + 0.5 },
      });
    } else if (view.core.hp < view.core.maxHp * 0.7) {
      sim.issue({ kind: 'ability', ability: 'weld', at: { x: 0.5, y: 0.5 } });
    }
    sim.step();
    guard++;
  }
  const view = sim.view();
  return {
    sim,
    view,
    retries,
    phases,
    reached,
    minutes: view.stats.elapsed / 60,
    won: view.phase === 'victory',
  };
}

const SEEDS = [11, 29, 101];

test('건전한 전략 3종은 재시도 없이 8웨이브를 클리어한다', () => {
  for (const name of ['mazeMortar', 'distributedHarpoons', 'forwardResonator']) {
    for (const seed of SEEDS) {
      const outcome = play(name, { seed, maxRetries: 0 });
      assert.equal(outcome.won, true, `${name}/seed ${seed}: ${outcome.view.phase} at wave ${outcome.view.wave.index}`);
      assert.equal(outcome.retries, 0, `${name} 은 재시도 없이 깬다`);
      assert.ok(outcome.view.core.hp > 0, '코어가 살아 있다');
      assert.ok(outcome.view.core.hp < outcome.view.core.maxHp, `${name}: 무상처 승리는 너무 쉽다는 신호`);
      assert.ok(outcome.reached.chapter === 2, '2장까지 간다');
      assert.ok(outcome.view.stats.kills > 50, '실제로 싸워서 이긴다');
    }
  }
});

test('나쁜 전략은 재시도 없이 후반 웨이브에서 무너진다', () => {
  for (const name of ['wallsOnly', 'poorClump']) {
    for (const seed of SEEDS) {
      const outcome = play(name, { seed, maxRetries: 0 });
      assert.equal(outcome.won, false, `${name}/seed ${seed} 는 그냥 이겨서는 안 된다`);
      assert.equal(outcome.view.phase, 'defeat');
      assert.equal(outcome.view.core.hp, 0);
      // 초반에 바로 죽지는 않는다 — 실패는 «후반»에 일어나야 한다
      assert.ok(outcome.view.wave.index >= 5, `${name} 은 최소 5웨이브까지 간다(실제 ${outcome.view.wave.index})`);
      assert.ok(outcome.view.wave.index <= 8);
      assert.ok(outcome.reached.chapter === 2, '1장은 통과한다(초반은 관대하다)');
    }
  }
});

test('나쁜 전략도 재시도하면 막히지 않는다(소프트락 없음)', () => {
  const blocked = play('poorClump', { seed: 11, maxRetries: 0 });
  assert.equal(blocked.view.phase, 'defeat');
  const retried = play('poorClump', { seed: 11, maxRetries: 6 });
  assert.ok(retried.retries > 0, '재시도를 실제로 썼다');
  // 재시도 후에는 더 멀리 간다(또는 끝까지 간다)
  assert.ok(
    retried.view.wave.index >= blocked.view.wave.index,
    `재시도로 같은 웨이브 이상 진행(${blocked.view.wave.index} → ${retried.view.wave.index})`,
  );
  assert.ok(retried.view.resources.scrap >= 0);
  // 재시도는 발견·통찰을 깎지 않는다
  assert.ok(retried.view.insight >= blocked.view.insight);
});

test('아무것도 하지 않으면 초반에 무너진다', () => {
  const sim = createSim({ seed: 11 });
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
  const view = sim.view();
  assert.equal(view.phase, 'defeat', '방어를 전혀 안 하면 진다');
  assert.ok(view.wave.index <= 4, `초반에 무너진다(웨이브 ${view.wave.index})`);
});

test('캠페인 도달성: 모든 단계를 실제로 지나간다', () => {
  const outcome = play('forwardResonator', { seed: 11, maxRetries: 0 });
  for (const phase of ['build', 'wave', 'chapterCleared', 'victory']) {
    assert.ok(outcome.phases.has(phase), `${phase} 단계에 도달해야 한다`);
  }
  assert.equal(outcome.view.wave.index, TOTAL_WAVES);
  assert.ok(outcome.view.discovered.length >= 2, '플레이 중 숨은 해금이 실제로 열린다');
  assert.ok(outcome.view.insight >= 10, '통찰이 쌓인다');
  // 실패 단계도 도달 가능해야 한다(같은 시드의 나쁜 전략으로 확인)
  const failing = play('wallsOnly', { seed: 11, maxRetries: 0 });
  assert.ok(failing.phases.has('defeat'));
});

test('페이싱: 한 판이 합리적인 시간 안에 끝나고 첫 보상이 빠르다', () => {
  const outcome = play('mazeMortar', { seed: 11, maxRetries: 0 });
  assert.ok(outcome.minutes > 3, `너무 짧지 않다(${outcome.minutes.toFixed(1)}분)`);
  assert.ok(outcome.minutes < 20, `너무 늘어지지 않는다(${outcome.minutes.toFixed(1)}분)`);

  // 첫 웨이브 클리어 보상까지 60초 안
  const sim = createSim({ seed: 11 });
  sim.issue({ kind: 'build', tile: T(1, 7), building: 'collector' });
  sim.issue({ kind: 'build', tile: T(3, 8), building: 'harpoon' });
  sim.issue({ kind: 'moveSub', to: { x: 0.5, y: 3.5 } });
  let rewardAt = -1;
  for (let i = 0; i < 30 * 120 && rewardAt < 0; i++) {
    const view = sim.view();
    if (view.phase === 'build' && view.salvage.exhausted) {
      sim.issue({ kind: 'build', tile: T(5, 8), building: 'harpoon' });
      sim.issue({ kind: 'startWave' });
      continue;
    }
    sim.step();
    for (const event of sim.drainEvents()) {
      if (event.kind === 'waveClear') rewardAt = sim.view().stats.elapsed;
    }
  }
  assert.ok(rewardAt > 0 && rewardAt < 60, `첫 웨이브 보상까지 ${rewardAt.toFixed(1)}초`);
});

test('난이도는 웨이브마다 단조 증가한다(유효 HP 기준)', () => {
  const effectiveHp = (wave) => {
    const spec = WAVES[wave - 1];
    let total = 0;
    const scale = 1 + HP_GROWTH_PER_WAVE * (wave - 1);
    for (const entry of spec.composition) {
      const base = ENEMIES[entry.role].hp * VARIANTS[entry.variant].hpMultiplier;
      total += base * entry.count * scale;
      // 보스는 전투 중 군체를 추가로 소환한다 — 실제 부담에 포함해야 한다
      if (entry.role === 'leviathan') total += ENEMIES[BOSS_SUMMON.role].hp * BOSS_SUMMON.total * scale * entry.count;
    }
    return total;
  };
  for (let wave = 2; wave <= TOTAL_WAVES; wave++) {
    assert.ok(effectiveHp(wave) > effectiveHp(wave - 1), `웨이브 ${wave} 가 ${wave - 1} 보다 세야 한다`);
  }
  // 2장은 장갑으로 카운터가 바뀐다
  const chapter2 = WAVES.filter((spec) => spec.chapter === 2);
  assert.ok(chapter2.some((spec) => spec.composition.some((entry) => entry.variant === 'elite')));
  assert.ok(VARIANTS.elite.flatArmor > 0);
});

test('웨이브별 리저브 배정과 수입 상한이 콘텐츠 표와 일치한다', () => {
  const sim = createSim({ seed: 11 });
  for (let wave = 1; wave <= 3; wave++) {
    const view = sim.view();
    assert.equal(view.wave.index, wave);
    assert.equal(view.salvage.reserveTotal, WAVES[wave - 1].salvageReserve);
    // 이 사이클에서 아무리 캐도 배정량을 넘지 못한다
    const before = view.resources.scrap;
    const wreck = nearestWreck(view);
    sim.issue({ kind: 'moveSub', to: wreck });
    let guard = 0;
    while (!sim.view().salvage.exhausted && guard < 30 * 600) {
      sim.step();
      guard++;
    }
    const gained = sim.view().resources.scrap - before;
    assert.ok(gained <= WAVES[wave - 1].salvageReserve + 0.5, `웨이브 ${wave}: ${gained} ≤ 리저브`);
    sim.issue({ kind: 'build', tile: T(3, 8), building: 'harpoon' });
    sim.issue({ kind: 'build', tile: T(5, 8), building: 'harpoon' });
    sim.issue({ kind: 'build', tile: T(4, 7), building: 'harpoon' });
    sim.issue({ kind: 'startWave' });
    let steps = 0;
    while (sim.view().phase === 'wave' && steps < 30 * 240) {
      sim.step();
      steps++;
    }
    if (sim.view().phase === 'defeat') sim.issue({ kind: 'retryWave' });
  }
});
