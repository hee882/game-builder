import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILDS, COUNTER_PAD, GRILLS, MONEY_PAD, OFFICE_PAD, PLAYER } from '../src/arctic/content.ts';
import * as W from '../src/arctic/world.ts';

const seconds = (state, s) => {
  for (let i = 0; i < Math.round(s * 30); i++) W.step(state);
};

/** 화면 안내 화살표만 따라가는 초보 플레이어 */
function followGuide(state, minutes, onEvent = () => {}) {
  for (let t = 0; t < minutes * 60 * 30; t++) {
    const { target } = W.objective(state);
    const dx = target ? target.x - state.player.pos.x : 0;
    const dy = target ? target.y - state.player.pos.y : 0;
    const d = Math.hypot(dx, dy);
    W.setInput(state, d > 0.15 ? dx / d : 0, d > 0.15 ? dy / d : 0);
    W.step(state);
    for (const event of W.drainEvents(state)) onEvent(event, state);
  }
}

function walkTo(state, goal) {
  for (let i = 0; i < 30 * 20; i++) {
    const dx = goal.x - state.player.pos.x;
    const dy = goal.y - state.player.pos.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) break;
    W.setInput(state, dx / Math.max(d, 0.2), dy / Math.max(d, 0.2));
    W.step(state);
  }
  W.setInput(state, 0, 0);
}

test('같은 시드·같은 입력은 같은 결과(결정성)', () => {
  const a = W.createWorld(5);
  const b = W.createWorld(5);
  followGuide(a, 2);
  followGuide(b, 2);
  assert.equal(W.serialize(a), W.serialize(b));
});

test('안내만 따라가도 1분 안에 첫 확장, 5분 안에 운반 알바를 연다', () => {
  const state = W.createWorld(11);
  const builtAt = {};
  followGuide(state, 5, (event, s) => {
    if (event.kind === 'built') builtAt[event.build] = s.time;
  });
  assert.ok(builtAt.grill2 < 60, `화로 추가 ${builtAt.grill2}초`);
  assert.ok(builtAt.carrier1 < 300, `운반 알바 ${builtAt.carrier1}초`);
});

test('사냥 → 화로 → 카운터 → 판매 → 돈 줍기 한 바퀴', () => {
  const state = W.createWorld(3);
  const bear = state.bears[0];
  bear.hp = 1;
  walkTo(state, bear.pos);
  seconds(state, 0.5);
  assert.ok(state.meats.length > 0 || state.player.count > 0, '곰이 고기를 떨어뜨린다');
  for (const meat of [...state.meats]) walkTo(state, meat.pos);
  assert.equal(state.player.kind, 'raw');
  walkTo(state, GRILLS[0].pad);
  seconds(state, 1);
  assert.equal(state.player.count, 0, '날고기를 전부 화로에 올린다');
  seconds(state, 5);
  assert.ok(state.player.kind === 'cooked', '구워진 고기를 챙긴다');
  walkTo(state, COUNTER_PAD);
  seconds(state, 1);
  assert.ok(state.stock > 0 || state.pile > 0, '카운터에 내려놓는다');
  seconds(state, 8);
  assert.ok(state.pile > 0, '손님이 사 가면 돈이 쌓인다');
  const pile = state.pile;
  walkTo(state, MONEY_PAD);
  assert.equal(state.money, pile);
  assert.equal(state.pile, 0);
});

test('날고기를 든 채로는 구운 고기를 집을 수 없다(한 번에 한 종류)', () => {
  const state = W.createWorld(3);
  state.player.kind = 'raw';
  state.player.count = 1;
  // 입력·출력이 모두 꽉 차 화로가 멈춰 있다 → 날고기를 내려놓을 수도, 구운 고기를 집을 수도 없다
  state.grills[0].output = 16;
  state.grills[0].input = 10;
  walkTo(state, GRILLS[0].pad);
  seconds(state, 1);
  assert.equal(state.player.kind, 'raw');
  assert.equal(state.grills[0].output, 16);
});

test('확장 칸은 서 있어야 결제되고, 중간에 떠나도 낸 돈은 남으며, 돈은 음수가 되지 않는다', () => {
  const state = W.createWorld(3);
  const pad = BUILDS.grill2.pad;
  state.money = 10;
  walkTo(state, pad);
  seconds(state, 2);
  assert.equal(state.money, 0);
  assert.equal(state.paid.grill2, 10);
  assert.equal(state.built.has('grill2'), false);
  walkTo(state, PLAYER.start);
  state.money = 100;
  walkTo(state, pad);
  seconds(state, 2);
  assert.ok(state.built.has('grill2'));
  assert.equal(state.money, 100 - (BUILDS.grill2.cost - 10));
  assert.equal(W.padVisible(state, 'grill2'), false);
  assert.ok(W.padVisible(state, 'office'), '다음 칸이 나타난다');
});

test('직원만으로도 가게가 돌아간다(방치)', () => {
  const state = W.createWorld(7);
  for (const id of ['grill2', 'carrier1', 'hunter1']) {
    state.money = BUILDS[id].cost;
    walkTo(state, BUILDS[id].pad);
    seconds(state, 3);
  }
  assert.equal(state.workers.length, 2);
  walkTo(state, PLAYER.start);
  const before = state.totalEarned;
  seconds(state, 120);
  assert.ok(state.totalEarned - before > 30, `2분 동안 직원만으로 ${state.totalEarned - before}`);
});

test('업그레이드는 창고에서만, 돈이 있을 때만 산다', () => {
  const state = W.createWorld(3);
  state.money = 10_000;
  assert.equal(W.buyUpgrade(state, 'speed'), false, '창고가 없다');
  state.built.add('office');
  assert.equal(W.buyUpgrade(state, 'speed'), false, '창고에 서 있지 않다');
  walkTo(state, OFFICE_PAD);
  const speed = W.playerSpeed(state);
  assert.equal(W.buyUpgrade(state, 'speed'), true);
  assert.ok(W.playerSpeed(state) > speed);
  state.money = 0;
  assert.equal(W.buyUpgrade(state, 'capacity'), false);
});

test('저장 왕복과 손상·조작된 저장', () => {
  const state = W.createWorld(9);
  followGuide(state, 4);
  const restored = W.parse(W.serialize(state), 9);
  assert.equal(W.serialize(restored), W.serialize(state));
  assert.equal(restored.workers.length, state.workers.length, '고용한 직원이 돌아온다');

  assert.equal(W.parse('{oops', 1).money, 0);
  const hostile = W.parse(
    JSON.stringify({ version: 1, money: -5, stock: 999, built: ['nope', 'office'], paid: { grill2: 1e9 }, upgrades: { speed: 99 }, carry: { kind: 'gold', count: 50 } }),
    1,
  );
  assert.equal(hostile.money, 0);
  assert.ok(hostile.stock <= 24);
  assert.deepEqual([...hostile.built], ['office']);
  assert.ok(hostile.paid.grill2 < BUILDS.grill2.cost);
  assert.equal(hostile.upgrades.speed, 6);
  assert.equal(hostile.player.kind, null);
  assert.equal(hostile.player.count, 0);
});

test('게임 로직에 DOM·실시간·Math.random 이 없다', () => {
  const source = readFileSync(new URL('../src/arctic/world.ts', import.meta.url), 'utf8');
  for (const banned of ['document', 'window', 'Date.now', 'performance', 'Math.random', 'localStorage']) {
    assert.equal(source.includes(banned), false, banned);
  }
});
