import { test } from "node:test";
import assert from "node:assert/strict";
import { GameState, slots } from "../src/game-state.ts";

function advance(state, seconds) {
  for (let i = 0; i < seconds * 20; i++) state.update(0.05);
}

test("defense purchases deduct money and reject unaffordable towers", () => {
  const state = new GameState("defense");
  state.click(slots[0]);
  assert.equal(state.money, 85);
  assert.equal(state.towers.length, 1);
  state.selectedKind = 1;
  state.click(slots[1]);
  assert.equal(state.money, 5);
  state.click(slots[2]);
  assert.equal(state.towers.length, 2);
});
test("defense advances through intermission and finishes all five waves", () => {
  const state = new GameState("defense");
  state.grow();
  state.wave = 0;
  advance(state, 200);
  assert.equal(state.wave, 5);
  assert.equal(state.remaining, 0);
  assert.equal(state.enemies.length, 0);
  assert.ok(state.health > 0);
  assert.ok(state.kills > 0);
});
test("hunt collects gems, pauses for a choice, then applies it once", () => {
  const state = new GameState("hunt");
  state.spawnTimer = 99;
  state.xp = 5;
  state.gems = [{ ...state.player }];
  state.update(0.05);
  assert.equal(state.level, 2);
  assert.equal(state.choices, true);
  const health = state.health;
  advance(state, 2);
  assert.equal(state.health, health);
  state.action(0);
  assert.equal(state.power, 1.6);
  assert.equal(state.choices, false);
  state.action(0);
  assert.equal(state.power, 1.6);
});
test("landlord manual service earns money, staff automates, floors are capped", () => {
  const state = new GameState("landlord");
  state.customers = [
    {
      x: 350,
      y: 514,
      target: 0,
      phase: 1,
      timer: 0,
      color: "#fff",
      variant: 0,
    },
  ];
  state.click({ x: 350, y: 510 });
  assert.equal(state.money, 48);
  assert.equal(state.combo, 1);
  state.money = 1000;
  state.action(0);
  assert.equal(state.staff, 1);
  const earned = state.earned;
  advance(state, 15);
  assert.ok(state.earned > earned);
  state.money = 10000;
  for (let i = 0; i < 8; i++) state.action(1);
  assert.equal(state.floors, 4);
  assert.ok(state.money >= 0);
});
test("switching between separate game states does not overwrite progress", () => {
  const defense = new GameState("defense"),
    hunt = new GameState("hunt");
  defense.click(slots[0]);
  hunt.grow();
  assert.equal(defense.towers.length, 1);
  assert.equal(defense.money, 85);
});
