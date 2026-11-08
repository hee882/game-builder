import { describe, expect, it } from 'vitest';
import {
  BOSS_WINDUP, EMPTY_INPUT, MAX_LEVEL, SKILLS, computeStats, createRun, findPath, generateDungeon, isFloor, lineOfSight,
  makeWorld, parseProfile, profileFromRun, serializeProfile, starterProfile, step, xpToNext,
} from '../src/index';
import type { Item, Vec, World } from '../src/index';
import { addEnemy, bot, emptyWorld, input, profileAt, run } from './helpers';

const SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i * 37);

function snapshot(world: World): string {
  const { events: _events, ...rest } = world.state;
  return JSON.stringify(rest);
}

describe('던전 생성', () => {
  it('시드 20개 모두 방 6개 이상이고 모든 방이 시작 방에서 도달 가능하다', () => {
    for (const seed of SEEDS) {
      const d = generateDungeon(seed);
      expect(d.rooms.length).toBeGreaterThanOrEqual(6);
      const start = d.rooms[0]!;
      for (const room of d.rooms) expect(findPath(d, { x: start.cx, z: start.cz }, { x: room.cx, z: room.cz }), `seed ${seed}`).not.toBeNull();
    }
  });
  it('같은 시드는 같은 던전, 다른 시드는 다른 던전', () => {
    expect(Array.from(generateDungeon(5).floor)).toEqual(Array.from(generateDungeon(5).floor));
    expect(Array.from(generateDungeon(5).floor)).not.toEqual(Array.from(generateDungeon(6).floor));
  });
  it('시작·보스·정예 방이 하나씩 이상 있고 보스 방에는 보스 1체', () => {
    for (const seed of SEEDS) {
      const { state, dungeon } = createRun(starterProfile(), seed);
      const kinds = dungeon.rooms.map(room => room.kind);
      expect(kinds.filter(kind => kind === 'start')).toHaveLength(1);
      expect(kinds.filter(kind => kind === 'boss')).toHaveLength(1);
      expect(kinds).toContain('elite');
      expect(state.enemies.filter(e => e.boss)).toHaveLength(1);
      expect(state.enemies.some(e => e.elite !== null)).toBe(true);
      expect(state.enemies.length).toBeGreaterThanOrEqual(40);
    }
  });
});

describe('부하 측정 옵션', () => {
  it('totalMobs는 보스 포함 전체 몹 수를 정확히 맞춘다', () => {
    for (const total of [30, 60, 100]) {
      const { state } = createRun(starterProfile(), 9, { totalMobs: total });
      expect(state.enemies).toHaveLength(total);
      expect(state.enemies.filter(e => e.boss)).toHaveLength(1);
    }
  });
});

describe('결정성', () => {
  it('같은 시드·같은 입력 2400틱 → 매 300틱 같은 상태(드랍·난수 포함)', () => {
    const a = createRun(starterProfile(), 42); const b = createRun(starterProfile(), 42);
    const wa = makeWorld(a.state, a.dungeon); const wb = makeWorld(b.state, b.dungeon);
    for (let t = 0; t < 2400; t++) {
      step(wa, bot(wa)); step(wb, bot(wb));
      if (t % 300 === 0) expect(snapshot(wa)).toBe(snapshot(wb));
    }
    expect(snapshot(wa)).toBe(snapshot(wb));
    expect(wa.state.kills).toBeGreaterThan(0);
  });
});

describe('클릭 조작', () => {
  it('벽 너머 지점을 클릭하면 벽을 돌아 도착한다', () => {
    const world = emptyWorld(11); const d = world.dungeon; const p = world.state.player;
    const target = world.dungeon.rooms.map(room => ({ x: room.cx, z: room.cz })).find(point => !lineOfSight(d, p, point))!;
    expect(target).toBeDefined();
    let arrived = false;
    for (let t = 0; t < 1200 && !arrived; t++) {
      step(world, input({ moveTo: target }));
      expect(isFloor(d, p.x, p.z)).toBe(true);
      arrived = Math.hypot(p.x - target.x, p.z - target.z) < 0.3;
    }
    expect(arrived).toBe(true);
  });
  it('적을 클릭하면 사거리까지 다가가 기본 공격으로 피해를 준다', () => {
    const world = emptyWorld(); const id = addEnemy(world, 'shield', { x: 4, z: 0 }, false);
    const enemy = world.state.enemies.find(e => e.id === id)!;
    enemy.speed = 0; // 다가오지 않게 고정
    const hp = enemy.hp;
    step(world, input({ attack: id }));
    run(world, 60);
    expect(enemy.hp).toBeLessThan(hp);
  });
  it('클릭한 아이템까지 걸어가 줍는다', () => {
    const world = emptyWorld(); const p = world.state.player;
    const item: Item = { id: 99, slot: 'hat', rarity: 'magic', name: '굳센 흑립', ilvl: 1, base: 5, affixes: [{ stat: 'life', value: 10 }], legendary: null };
    world.state.items.push({ id: 500, x: p.x + 3, z: p.z, item });
    step(world, input({ pickup: 500 }));
    run(world, 40);
    expect(p.inventory.map(i => i.id)).toContain(99);
    expect(world.state.items).toHaveLength(0);
  });
});

describe('스킬', () => {
  it('해금 레벨 전에는 쓸 수 없다(질풍 돌진 = 2레벨)', () => {
    const world = emptyWorld(); const p = world.state.player;
    p.slots.s1 = 'dash';
    step(world, input({ cast: { slot: 's1', at: { x: p.x + 3, z: p.z } } }));
    expect(p.cast).toBeNull();
  });
  it('기가 모자라면 회전베기를 못 쓰고, 쓰면 25를 소모한다', () => {
    const world = emptyWorld(); const p = world.state.player;
    p.spirit = 10;
    step(world, input({ cast: { slot: 'rmb', at: p } }));
    expect(p.cast).toBeNull();
    p.spirit = 60;
    step(world, input({ cast: { slot: 'rmb', at: p } }));
    expect(p.cast?.skill).toBe('spin');
    expect(p.spirit).toBeCloseTo(60 + p.stats.spiritRegen - 25, 5);
  });
  it('회전베기는 주변 원형의 적을 모두 때린다', () => {
    const world = emptyWorld(); const p = world.state.player; p.spirit = 100;
    const ids = [{ x: 1.5, z: 0 }, { x: -1.5, z: 0.5 }, { x: 0, z: -2 }, { x: 8, z: 0 }].map(o => addEnemy(world, 'shield', o));
    step(world, input({ cast: { slot: 'rmb', at: p } }));
    run(world, 6);
    const hit = ids.map(id => world.state.enemies.find(e => e.id === id)!).map(e => e.hp < e.maxHp);
    expect(hit).toEqual([true, true, true, false]);
  });
  it('회전베기는 적을 바깥으로 밀어내고 보스는 밀지 않으며 넉백은 벽을 넘지 않는다', () => {
    const world = emptyWorld(); const p = world.state.player; p.spirit = 100;
    const reed = addEnemy(world, 'shield', { x: 1.5, z: 0 }); const boss = addEnemy(world, 'hat', { x: -2, z: 0 });
    const start = new Map(world.state.enemies.map(e => [e.id, Math.hypot(e.x - p.x, e.z - p.z)]));
    step(world, input({ cast: { slot: 'rmb', at: p } }));
    run(world, 10);
    const dist = (id: number): number => { const e = world.state.enemies.find(x => x.id === id)!; return Math.hypot(e.x - p.x, e.z - p.z); };
    expect(dist(reed) - start.get(reed)!).toBeGreaterThan(0.5);
    expect(Math.abs(dist(boss) - start.get(boss)!)).toBeLessThan(0.05);
    const killEvents = world.state.enemies.every(e => isFloor(world.dungeon, e.x, e.z));
    expect(killEvents).toBe(true);
  });
  it('재사용 대기 중에는 다시 못 쓴다(질풍 돌진 120틱)', () => {
    const world = emptyWorld(7, profileAt(2)); const p = world.state.player;
    p.slots.s1 = 'dash';
    step(world, input({ cast: { slot: 's1', at: { x: p.x + 2, z: p.z } } }));
    expect(p.cast?.skill).toBe('dash');
    run(world, 20);
    step(world, input({ cast: { slot: 's1', at: { x: p.x - 2, z: p.z } } }));
    expect(p.cast).toBeNull();
    expect(p.cooldowns.dash).toBe(SKILLS.dash.cooldown);
  });
  it('슬롯 교체: 잠긴 스킬은 거부, 이미 있는 스킬은 자리를 맞바꾼다', () => {
    const world = emptyWorld(7, profileAt(3)); const p = world.state.player;
    step(world, input({ commands: [{ type: 'assign', slot: 's1', skill: 'cleave' }] }));
    expect(p.slots.s1).toBeNull();
    step(world, input({ commands: [{ type: 'assign', slot: 's1', skill: 'talisman' }, { type: 'assign', slot: 's2', skill: 'spin' }] }));
    expect(p.slots).toMatchObject({ s1: 'talisman', s2: 'spin', rmb: null });
  });
  it('방패 역졸은 정면 기본 공격을 절반으로 줄이고 혼백 가르기는 막지 못한다', () => {
    const world = emptyWorld(7, profileAt(5)); const p = world.state.player;
    const id = addEnemy(world, 'shield', { x: 0, z: 1.5 }, false);
    const enemy = world.state.enemies.find(e => e.id === id)!;
    enemy.facing = Math.PI; // 플레이어를 바라봄
    p.stats.critChance = 0;
    step(world, input({ cast: { slot: 'lmb', at: enemy } }));
    run(world, 12);
    const slashLoss = enemy.maxHp - enemy.hp;
    expect(slashLoss).toBe(Math.round(p.stats.weaponDamage * p.stats.damageMult * 0.5));
    p.slots.s1 = 'cleave';
    const before = enemy.hp;
    step(world, input({ cast: { slot: 's1', at: enemy } }));
    run(world, 15);
    expect(before - enemy.hp).toBe(Math.min(before, Math.round(p.stats.weaponDamage * p.stats.damageMult * 4)));
  });
});

describe('보스', () => {
  it('보스 위험 공격 예고는 모두 15틱 이상', () => {
    for (const ticks of Object.values(BOSS_WINDUP)) expect(ticks).toBeGreaterThanOrEqual(15);
  });
  it('휩쓸기 예고 중 범위를 벗어나면 맞지 않고, 남아 있으면 맞는다', () => {
    for (const escape of [true, false]) {
      const world = emptyWorld(); const p = world.state.player; p.invulnerableUntil = 0;
      const id = addEnemy(world, 'hat', { x: 0, z: 3 });
      const boss = world.state.enemies.find(e => e.id === id)!;
      boss.nextSpecial = 0;
      step(world, EMPTY_INPUT);
      expect(boss.mode).toBe('windup');
      const attack = boss.attack;
      const target = attack === 'sweep' ? { x: boss.x, z: boss.z - 9 } : { x: p.x - 5, z: p.z };
      const hp = p.hp;
      run(world, 30, () => (escape ? input({ moveTo: target }) : EMPTY_INPUT));
      if (attack === 'summon') { expect(world.state.enemies.length).toBeGreaterThan(1); continue; }
      if (escape) expect(p.hp).toBe(hp); else expect(p.hp).toBeLessThan(hp);
    }
  });
  it('보스를 쓰러뜨리면 마을 문이 열리고 희귀 이상 아이템 포함 3개가 떨어진다', () => {
    const world = emptyWorld(); const id = addEnemy(world, 'hat', { x: 0, z: 2 });
    const boss = world.state.enemies.find(e => e.id === id)!;
    boss.hp = 1; world.state.player.stats.critChance = 0;
    step(world, input({ attack: id }));
    run(world, 20);
    expect(world.state.portal).not.toBeNull();
    expect(world.state.items).toHaveLength(3);
    expect(world.state.items.some(g => g.item.rarity === 'rare' || g.item.rarity === 'legendary')).toBe(true);
  });
});

describe('장비·성장', () => {
  const sword = (base: number, extra: Partial<Item> = {}): Item => ({ id: 77, slot: 'weapon', rarity: 'rare', name: '시험 환도', ilvl: 3, base, affixes: [], legendary: null, ...extra });
  it('장착하면 스탯이 바뀌고 실제 피해도 바뀐다', () => {
    const world = emptyWorld(); const p = world.state.player;
    p.inventory.push(sword(40, { affixes: [{ stat: 'damagePct', value: 10 }] }));
    step(world, input({ commands: [{ type: 'equip', item: 77 }] }));
    expect(p.equipped.weapon?.id).toBe(77);
    expect(p.inventory.map(i => i.name)).toContain('낡은 환도');
    expect(p.stats.weaponDamage).toBe(40);
    p.stats.critChance = 0;
    const id = addEnemy(world, 'shield', { x: 0, z: 1.5 }, false);
    const enemy = world.state.enemies.find(e => e.id === id)!;
    enemy.facing = 0; enemy.staggerUntil = 1e9; // 등을 보인 채 돌아서지 못하게 고정
    step(world, input({ cast: { slot: 'lmb', at: enemy } }));
    run(world, 12);
    expect(enemy.maxHp - enemy.hp).toBe(Math.round(40 * 1.1));
  });
  it('메아리 노리개: 회전베기가 0.4초 뒤 한 번 더 때린다', () => {
    const world = emptyWorld(); const p = world.state.player; p.spirit = 100;
    p.equipped.charm = { ...sword(5), id: 78, slot: 'charm', legendary: 'echo_charm' };
    p.stats = computeStats(p.level, p.equipped); p.stats.critChance = 0;
    const id = addEnemy(world, 'hat', { x: 1.5, z: 0 }, false);
    const enemy = world.state.enemies.find(e => e.id === id)!;
    step(world, input({ cast: { slot: 'rmb', at: p } }));
    run(world, 30);
    const one = Math.round(p.stats.weaponDamage * p.stats.damageMult * 1.6);
    expect(enemy.maxHp - enemy.hp).toBe(one * 2);
  });
  it('귀화 부적 토시: 폭염 부적이 추가 폭발 3개를 만든다', () => {
    const world = emptyWorld(7, profileAt(3)); const p = world.state.player; p.spirit = 100; p.slots.s1 = 'talisman';
    p.equipped.gloves = { ...sword(5), id: 79, slot: 'gloves', legendary: 'split_talisman' };
    p.stats = computeStats(p.level, p.equipped);
    const blasts: string[] = [];
    step(world, input({ cast: { slot: 's1', at: { x: p.x + 3, z: p.z } } }));
    for (let t = 0; t < 30; t++) { step(world, EMPTY_INPUT); for (const e of world.state.events) if (e.type === 'blast') blasts.push(e.source); }
    expect(blasts.filter(s => s === 'talisman')).toHaveLength(1);
    expect(blasts.filter(s => s === 'split_blast')).toHaveLength(3);
  });
  it('불길 걷는 환도: 돌진 경로에 불길이 남아 적에게 지속 피해를 준다', () => {
    const world = emptyWorld(7, profileAt(2)); const p = world.state.player; p.slots.s1 = 'dash';
    p.equipped.weapon = sword(20, { legendary: 'fire_walker' });
    p.stats = computeStats(p.level, p.equipped);
    const at = [{ x: 2, z: 0 }, { x: -2, z: 0 }, { x: 0, z: 2 }, { x: 0, z: -2 }].map(o => ({ x: p.x + o.x, z: p.z + o.z })).find(v => lineOfSight(world.dungeon, p, v, 0.4))!;
    step(world, input({ cast: { slot: 's1', at } }));
    run(world, 8);
    expect(world.state.fires.length).toBeGreaterThan(0);
    const fire = world.state.fires[0]!;
    const id = addEnemy(world, 'shield', { x: fire.x - p.x, z: fire.z - p.z }, false);
    world.state.enemies.find(e => e.id === id)!.speed = 0;
    run(world, 40);
    const enemy = world.state.enemies.find(e => e.id === id)!;
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
  });
  it('경험치 곡선과 레벨업 해금·자동 배치', () => {
    expect([1, 2, 3].map(xpToNext)).toEqual([100, 283, 520]);
    const world = emptyWorld(); const p = world.state.player;
    const id = addEnemy(world, 'reed', { x: 0, z: 1.2 }, false);
    world.state.enemies.find(e => e.id === id)!.hp = 1;
    p.xp = 95;
    step(world, input({ attack: id }));
    run(world, 10);
    expect(p.level).toBe(2);
    expect(Object.values(p.slots)).toContain('dash');
    expect(p.hp).toBe(p.stats.maxHp);
  });
  it(`레벨 상한 ${MAX_LEVEL}에서는 경험치가 쌓이지 않는다`, () => {
    const world = emptyWorld(7, profileAt(MAX_LEVEL));
    const id = addEnemy(world, 'reed', { x: 0, z: 1.2 }, false);
    world.state.enemies.find(e => e.id === id)!.hp = 1;
    step(world, input({ attack: id })); run(world, 10);
    expect(world.state.player).toMatchObject({ level: MAX_LEVEL, xp: 0 });
  });
});

describe('저장', () => {
  it('한 판 뒤 프로필을 저장·불러오면 같은 내용이다', () => {
    const { state, dungeon } = createRun(starterProfile(), 3);
    const world = makeWorld(state, dungeon);
    run(world, 1500, bot);
    const profile = profileFromRun(world.state, starterProfile());
    expect(profile.runCount).toBe(1);
    expect(parseProfile(serializeProfile(profile))).toEqual(profile);
  });
  it('손상·버전 불일치·잘못된 슬롯은 null', () => {
    const good = serializeProfile(starterProfile());
    expect(parseProfile('{oops')).toBeNull();
    expect(parseProfile(good.replace('"version":1', '"version":2'))).toBeNull();
    expect(parseProfile(good.replace('"rmb":"spin"', '"rmb":"fireball"'))).toBeNull();
    expect(parseProfile(good.replace('"slot":"weapon"', '"slot":"hat"'))).toBeNull();
    expect(parseProfile(good)).toEqual(starterProfile());
  });
});

describe('한 바퀴', () => {
  it('봇이 시드 3개에서 몹을 처치하며 진행하고 상태가 항상 유효하다', () => {
    for (const seed of [21, 22, 23]) {
      const { state, dungeon } = createRun(starterProfile(), seed);
      const world = makeWorld(state, dungeon);
      state.player.invulnerableUntil = Infinity; // 생존이 아니라 진행 경로만 본다
      for (let t = 0; t < 9000 && state.enemies.length > 0; t++) {
        step(world, bot(world));
        if (t % 500 === 0) for (const e of state.enemies) expect(isFloor(dungeon, e.x, e.z)).toBe(true);
      }
      expect(state.kills).toBeGreaterThan(30);
      expect(state.player.level).toBeGreaterThan(1);
    }
  });
});

export type { Vec };
