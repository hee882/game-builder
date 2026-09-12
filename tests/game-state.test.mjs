import { test } from "node:test";
import assert from "node:assert/strict";
import { GameState, slots, towerTypes } from "../src/game-state.ts";

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

test('invalid purchase costs cannot credit or corrupt the wallet',()=>{
 for(const cost of [-1,NaN,Infinity]){
  const state=new GameState('defense');assert.equal(state.spend(cost),false);assert.equal(state.money,140);assert.equal(state.upgrades,0);
 }
});

test('a defeated hunt enemy cannot inflict contact damage before removal',()=>{
 const state=new GameState('hunt');state.spawnTimer=99;
 state.enemies=[{...state.player,id:0,hp:0,maxHp:10,progress:0,speed:30,kind:0,flash:0}];
 state.update(.05);assert.equal(state.health,20);assert.equal(state.kills,1);assert.equal(state.enemies.length,0);
});

test('keyboard movement receives the same mobility bonus as pointer movement',()=>{
 const keyboard=new GameState('hunt'),pointer=new GameState('hunt');
 for(const state of [keyboard,pointer]){state.spawnTimer=99;state.mobilityMultiplier=1.18;}
 pointer.target={x:900,y:pointer.player.y};
 keyboard.update(.05,{x:1,y:0});pointer.update(.05);
 assert.ok(Math.abs(keyboard.player.x-pointer.player.x)<1e-9);assert.ok(keyboard.player.x>469);
});

test('new tower actions purchase and upgrade while action three remains next wave',()=>{
 const s=new GameState('defense');s.money=1000;s.action(4);assert.equal(s.selectedKind,3);s.click(slots[0]);assert.equal(s.money,905);
 s.action(5);assert.equal(s.selectedKind,4);s.click(slots[1]);assert.equal(s.money,795);s.click(slots[1]);assert.equal(s.towers[1].level,2);assert.equal(s.money,730);
 s.intermission=2;s.action(3);assert.equal(s.intermission,0);assert.equal(s.selectedKind,4);assert.equal(s.selectTower(99),false);
 assert.equal(towerTypes.length,5);for(const t of towerTypes)assert.ok(t.name&&t.symbol&&t.description&&t.color);
});

test('tremor slows nearby enemies temporarily and mirror refracts into two neighbours',()=>{
 const enemy=(id,x)=>({id,x,y:225,hp:100,maxHp:100,progress:x+45,speed:40,kind:0,flash:0});
 const tremor=new GameState('defense');tremor.towers=[{x:150,y:250,kind:3,level:1,cooldown:0,angle:0}];tremor.enemies=[enemy(0,150),enemy(1,200),enemy(2,400)];
 tremor.update(.01);assert.deepEqual(tremor.enemies.map(e=>e.hp),[86,86,100]);assert.ok(tremor.enemies[1].slowedUntil>tremor.time);
 const e=tremor.enemies[0];tremor.towers=[];tremor.time=e.slowedUntil;const before=e.progress;tremor.update(.01);assert.ok(Math.abs(e.progress-before-.4)<1e-9);
 const mirror=new GameState('defense');mirror.towers=[{x:150,y:250,kind:4,level:1,cooldown:0,angle:0}];mirror.enemies=[enemy(0,150),enemy(1,200),enemy(2,250),enemy(3,280)];
 mirror.update(.01);assert.deepEqual(mirror.enemies.map(e=>e.hp),[80,86,86,100]);assert.ok(mirror.shots.every(s=>s.color));
});
