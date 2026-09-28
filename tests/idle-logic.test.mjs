import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENEMY, REBIRTH, UNLOCK_STAGE, UPGRADE_ORDER } from '../src/idle/content.ts';
import * as L from '../src/idle/logic.ts';

const runSeconds = (state, seconds) => {
  for (let i = 0; i < Math.round(seconds * 20); i++) L.step(state);
};

/** 가성비가 가장 좋은 강화를 사고, 막히면 20초 사냥 후 보스에 재도전하는 봇 */
function playBot(state, minutes, onTick = () => {}) {
  let farmSeconds = 0;
  const gain = (id) => {
    const before = L.expectedDps(state) * L.goldMultiplier(state);
    state.levels[id]++;
    const after = L.expectedDps(state) * L.goldMultiplier(state);
    state.levels[id]--;
    return (after / before - 1) / L.upgradeCost(id, state.levels[id]);
  };
  for (let t = 0; t < minutes * 60 * 20; t++) {
    L.step(state);
    if (t % 10 === 0) {
      for (let k = 0; k < 20; k++) {
        const ids = UPGRADE_ORDER.filter((id) => L.purchasePlan(state, id, 1).count > 0);
        ids.sort((a, b) => gain(b) - gain(a));
        if (ids.length === 0 || !L.buy(state, ids[0], 1)) break;
      }
      L.castSkill(state);
    }
    if (state.farming && (farmSeconds += 0.05) > 20) {
      L.challengeBoss(state);
      farmSeconds = 0;
    }
    L.drainEvents(state);
    onTick(state);
  }
}

test('같은 시드·같은 입력은 같은 결과를 만든다(결정성)', () => {
  const a = L.createState(9);
  const b = L.createState(9);
  playBot(a, 3);
  playBot(b, 3);
  assert.equal(L.serialize(a), L.serialize(b));
});

test('초반 속도: 1분 반 안에 5스테이지, 4분 안에 10스테이지', () => {
  const state = L.createState(7);
  const reached = {};
  playBot(state, 4, (s) => {
    reached[s.stage] ??= s.playSeconds;
  });
  assert.ok(reached[5] < 90, `5스테이지 ${reached[5]}초`);
  assert.ok(reached[10] < 240, `10스테이지 ${reached[10]}초`);
});

test('환생 없이는 성장이 막힌다 — 30분 안에 35~70스테이지에서 멈춘다', () => {
  const state = L.createState(7);
  playBot(state, 30);
  assert.ok(state.stage >= 35 && state.stage <= 70, `30분 후 ${state.stage}스테이지`);
});

test('보스를 30초 안에 못 잡으면 반복 사냥으로 돌아가고, 도전 버튼으로 다시 붙는다', () => {
  const state = L.createState(1);
  state.stage = 30; // 초기 공격력으로는 절대 못 잡는 보스
  state.kills = ENEMY.killsPerStage;
  state.enemy = null;
  state.walkTimer = 0;
  runSeconds(state, 1);
  assert.equal(state.enemy?.boss, true);
  runSeconds(state, ENEMY.bossSeconds);
  assert.equal(state.farming, true);
  const events = L.drainEvents(state).map((event) => event.kind);
  assert.ok(events.includes('bossStart') && events.includes('bossFail'));
  runSeconds(state, 5);
  assert.notEqual(state.enemy?.boss, true, '반복 사냥 중에는 보스가 나오지 않는다');
  assert.equal(L.challengeBoss(state), true);
  runSeconds(state, 1);
  assert.equal(state.enemy?.boss, true);
});

test('골드가 모자라면 강화할 수 없고 골드는 음수가 되지 않는다', () => {
  const state = L.createState(1);
  assert.equal(L.buy(state, 'attack', 1), false);
  state.gold = L.upgradeCost('attack', 0) + L.upgradeCost('attack', 1) + 1;
  assert.equal(L.buy(state, 'attack', 'max'), true);
  assert.equal(state.levels.attack, 2);
  assert.ok(state.gold >= 0 && state.gold < L.upgradeCost('attack', 2));
  assert.equal(L.buy(state, 'attack', 10), false, 'x10 은 10레벨 값을 다 낼 수 있어야 한다');
});

test('25레벨마다 무기가 진화하고 공격력이 뛰어오른다', () => {
  const state = L.createState(1);
  state.levels.attack = 24;
  const before = L.heroAttack(state);
  state.gold = 1e12;
  L.buy(state, 'attack', 1);
  const evolve = L.drainEvents(state).find((event) => event.kind === 'evolve');
  assert.ok(evolve, '진화 이벤트');
  assert.ok(L.heroAttack(state) > before * 2);
});

test('해금은 스테이지 도달로 열리고, 잠긴 동료는 살 수 없다', () => {
  const state = L.createState(1);
  state.gold = 1e9;
  assert.equal(L.buy(state, 'companion', 1), false);
  assert.equal(L.castSkill(state), false);
  assert.equal(L.setAuto(state, 'skill', true), false);
  state.best = UNLOCK_STAGE.auto;
  assert.equal(L.buy(state, 'companion', 1), true);
  assert.equal(L.castSkill(state), true);
  assert.equal(L.setAuto(state, 'skill', true), true);
});

test('환생: 강화·골드·스테이지는 초기화, 영혼석·해금·기록은 유지', () => {
  const state = L.createState(1);
  assert.equal(L.rebirth(state), false, '조건 미달이면 거부');
  state.stage = 45;
  state.runBest = 45;
  state.best = 45;
  state.gold = 5000;
  state.levels.attack = 80;
  const stones = L.rebirthStones(state);
  assert.ok(stones > 0);
  const attackBefore = L.createState(1);
  assert.equal(L.rebirth(state), true);
  assert.equal(state.stage, 1);
  assert.equal(state.gold, 0);
  assert.equal(state.levels.attack, 0);
  assert.equal(state.stones, stones);
  assert.equal(state.best, 45);
  assert.ok(L.isUnlocked(state, 'rebirth'));
  assert.ok(L.heroAttack(state) > L.heroAttack(attackBefore), '영혼석이 공격력을 올린다');
  assert.equal(L.rebirthStones(state), 0, '곧바로 다시 환생해 영혼석을 복제할 수 없다');
  assert.ok(REBIRTH.minStage > 1);
});

test('방치 보상은 짧은 부재에는 없고 8시간에서 멈춘다', () => {
  const state = L.createState(1);
  assert.equal(L.offlineGold(state, 30), 0);
  assert.ok(L.offlineGold(state, 3600) > 0);
  assert.equal(L.offlineGold(state, 8 * 3600), L.offlineGold(state, 100 * 3600));
  assert.equal(L.offlineGold(state, Number.NaN), 0);
  assert.equal(L.offlineGold(state, -5), 0);
});

test('저장 왕복과 손상·조작된 저장', () => {
  const state = L.createState(3);
  playBot(state, 3);
  const restored = L.parse(L.serialize(state), 3);
  assert.equal(L.serialize(restored), L.serialize(state));

  assert.equal(L.parse('{broken', 1).stage, 1);
  assert.equal(L.parse(null, 1).gold, 0);
  const hostile = L.parse(
    JSON.stringify({ version: 1, gold: -50, stage: 999, best: 10, levels: { attack: 1e9, speed: 'x', __proto__: { crit: 5 } }, stones: Number.NaN }),
    1,
  );
  assert.equal(hostile.gold, 0);
  assert.equal(hostile.stage, 10, '스테이지는 최고 기록을 넘을 수 없다');
  assert.equal(hostile.levels.speed, 0);
  assert.equal(hostile.levels.crit, 0);
  assert.ok(hostile.levels.attack <= 10_000);
  assert.equal(hostile.stones, 0);
});

test('게임 로직에 DOM·실시간·Math.random 이 없다', () => {
  const source = readFileSync(new URL('../src/idle/logic.ts', import.meta.url), 'utf8');
  for (const banned of ['document', 'window', 'Date.now', 'performance', 'Math.random', 'localStorage']) {
    assert.equal(source.includes(banned), false, banned);
  }
});
