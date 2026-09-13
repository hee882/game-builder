import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRID_W, TILE_COUNT } from '../src/outpost/contract.ts';
import { CHAPTERS, ENEMIES, PATH_COST, TERRAIN, parseLayout, tileIndex } from '../src/outpost/content.ts';
import { DIRECTIONS, FieldCache, UNREACHABLE, buildField, tracePath } from '../src/outpost/path.ts';

const layout = (chapter) => parseLayout(CHAPTERS[chapter - 1].layout);

function inputFor(parsed, wallTiles = [], structureTiles = []) {
  const walls = new Uint8Array(TILE_COUNT);
  const structures = new Uint8Array(TILE_COUNT);
  for (const tile of wallTiles) walls[tile] = 1;
  for (const tile of structureTiles) structures[tile] = 1;
  return { terrain: parsed.terrain, walls, structures };
}

test('흐름장은 코어에서 0이고, 흐름을 따라가면 비용이 단조 감소한다', () => {
  const parsed = layout(1);
  const field = buildField(inputFor(parsed), parsed.coreTiles, 400, false);
  for (const tile of parsed.coreTiles) assert.equal(field.dist[tile], 0);
  for (let tile = 0; tile < TILE_COUNT; tile++) {
    if (parsed.terrain[tile] === TERRAIN.rock) continue;
    assert.ok(field.dist[tile] < UNREACHABLE, `tile ${tile} unreachable`);
    const dir = field.flow[tile];
    if (dir < 0) {
      assert.equal(field.dist[tile], 0);
      continue;
    }
    const step = DIRECTIONS[dir];
    const next = tile + step.dy * GRID_W + step.dx;
    assert.ok(field.dist[next] < field.dist[tile], `flow must descend at ${tile}`);
  }
});

test('분출구에서 흐름을 따라가면 반드시 코어에 도착한다(양 장 모두)', () => {
  for (const chapter of [1, 2]) {
    const parsed = layout(chapter);
    const field = buildField(inputFor(parsed), parsed.coreTiles, 400, false);
    for (const vent of parsed.ventTiles) {
      const path = tracePath(field, vent);
      const last = path[path.length - 1];
      assert.ok(parsed.coreTiles.includes(last), `chapter ${chapter} vent ${vent} never reaches core`);
      assert.ok(path.length <= TILE_COUNT, 'path must be finite');
    }
  }
});

test('격벽을 세우면 지상 경로가 실제로 바뀐다', () => {
  const parsed = layout(1);
  const vent = parsed.ventTiles[0];
  const before = buildField(inputFor(parsed), parsed.coreTiles, 400, false);
  const beforePath = tracePath(before, vent);
  // 1장 행 6의 천연 초크(개방 열 0/3,4,5/8) 중 중앙 레인을 막는다
  const walls = [tileIndex(3, 6), tileIndex(4, 6), tileIndex(5, 6)];
  const after = buildField(inputFor(parsed, walls), parsed.coreTiles, 400, false);
  const afterPath = tracePath(after, vent);
  assert.notDeepEqual(beforePath, afterPath, '경로가 바뀌어야 한다');
  assert.ok(after.dist[vent] > before.dist[vent], '막으면 비용이 커져야 한다');
  // 표류체(400)는 벽을 부수지 않고 돌아간다
  assert.ok(!afterPath.some((tile) => walls.includes(tile)), '표류체는 우회한다');
});

test('중앙만 막으면 굴착체는 뚫고 표류체는 돌아간다 — 같은 레이아웃, 다른 선택', () => {
  const parsed = layout(1);
  const vent = parsed.ventTiles[0];
  // 중앙 레인(행 6 개방 열 3,4,5)만 막는다. 바깥 레인 0·8은 열려 있다.
  const walls = [tileIndex(3, 6), tileIndex(4, 6), tileIndex(5, 6)];
  const input = inputFor(parsed, walls);
  const ground = buildField(input, parsed.coreTiles, ENEMIES.drifter.wallCost, false);
  const breaker = buildField(input, parsed.coreTiles, ENEMIES.breacher.wallCost, false);
  const groundPath = tracePath(ground, vent);
  const breakerPath = tracePath(breaker, vent);
  assert.ok(breaker.dist[vent] < ground.dist[vent], '굴착체 비용이 더 낮다');
  assert.ok(breakerPath.some((tile) => walls.includes(tile)), '굴착체는 벽을 부수고 직진한다');
  assert.ok(!groundPath.some((tile) => walls.includes(tile)), '표류체는 바깥 레인으로 돌아간다');
  assert.notDeepEqual(groundPath, breakerPath, '두 역할의 경로가 달라야 한다');
});

test('완전 봉쇄면 모두 가장 싼 벽을 뚫지만 비용 차이는 남는다', () => {
  const parsed = layout(1);
  const vent = parsed.ventTiles[0];
  const walls = [tileIndex(0, 6), tileIndex(3, 6), tileIndex(4, 6), tileIndex(5, 6), tileIndex(8, 6)];
  const input = inputFor(parsed, walls);
  const ground = buildField(input, parsed.coreTiles, ENEMIES.drifter.wallCost, false);
  const breaker = buildField(input, parsed.coreTiles, ENEMIES.breacher.wallCost, false);
  assert.ok(tracePath(ground, vent).some((tile) => walls.includes(tile)), '표류체도 결국 벽을 뚫는다');
  assert.ok(tracePath(breaker, vent).some((tile) => walls.includes(tile)));
  assert.ok(breaker.dist[vent] < ground.dist[vent]);
});

test('완전 봉쇄해도 도달 불가가 되지 않는다(벽은 통행 비용일 뿐)', () => {
  const parsed = layout(1);
  const walls = [];
  for (let x = 0; x < GRID_W; x++) walls.push(tileIndex(x, 7));
  const field = buildField(inputFor(parsed, walls), parsed.coreTiles, 400, false);
  for (const vent of parsed.ventTiles) assert.ok(field.dist[vent] < UNREACHABLE);
});

test('비행 필드는 암반과 벽을 모두 무시한다', () => {
  const parsed = layout(1);
  const walls = [];
  for (let x = 0; x < GRID_W; x++) walls.push(tileIndex(x, 5));
  const input = inputFor(parsed, walls);
  const flying = buildField(input, parsed.coreTiles, 0, true);
  const ground = buildField(input, parsed.coreTiles, 400, false);
  for (const vent of parsed.ventTiles) {
    assert.ok(flying.dist[vent] < ground.dist[vent], '비행은 더 싸다');
  }
  // 암반 타일도 비행에게는 도달 가능하다
  const rock = tileIndex(2, 4);
  assert.equal(parsed.terrain[rock], TERRAIN.rock);
  assert.ok(flying.dist[rock] < UNREACHABLE);
  assert.equal(ground.dist[rock], UNREACHABLE);
});

test('비벽 구조물은 벽보다 싸지 않고, 빈 물은 항상 가장 싸다', () => {
  const parsed = layout(1);
  const tile = tileIndex(4, 6);
  const open = buildField(inputFor(parsed), parsed.coreTiles, 400, false);
  const structure = buildField(inputFor(parsed, [], [tile]), parsed.coreTiles, 400, false);
  const wall = buildField(inputFor(parsed, [tile]), parsed.coreTiles, 400, false);
  const vent = parsed.ventTiles[0];
  assert.ok(open.dist[vent] <= structure.dist[vent]);
  assert.equal(PATH_COST.open, 10);
  assert.ok(structure.dist[vent] <= wall.dist[vent] || wall.dist[vent] >= open.dist[vent]);
});

test('타이브레이크가 고정되어 같은 입력은 언제나 같은 필드를 만든다', () => {
  const parsed = layout(2);
  const input = inputFor(parsed, [tileIndex(4, 5)]);
  const a = buildField(input, parsed.coreTiles, 400, false);
  const b = buildField(input, parsed.coreTiles, 400, false);
  assert.deepEqual([...a.dist], [...b.dist]);
  assert.deepEqual([...a.flow], [...b.flow]);
});

test('대칭 위치에서 흐름 방향은 상→좌→우→하 순서를 따른다', () => {
  const parsed = layout(1);
  const field = buildField(inputFor(parsed), parsed.coreTiles, 400, false);
  // 코어 바로 위 타일은 «하»(코어 방향)를 골라야 한다
  const aboveCore = tileIndex(3, 8);
  assert.equal(field.flow[aboveCore], 3);
});

test('FieldCache 는 비용별 필드를 따로 들고 rebuild 횟수를 센다', () => {
  const parsed = layout(1);
  const cache = new FieldCache([12, 400, 600, 6]);
  const walls = [tileIndex(3, 6), tileIndex(4, 6), tileIndex(5, 6)];
  cache.rebuild(inputFor(parsed, walls), parsed.coreTiles);
  assert.equal(cache.rebuildCount, 1);
  const vent = parsed.ventTiles[0];
  // 벽을 싸게 보는 쪽(6·12)이 비싸게 보는 쪽(400·600)보다 비용이 낮다
  assert.ok(cache.ground(6).dist[vent] < cache.ground(400).dist[vent]);
  assert.ok(cache.ground(12).dist[vent] < cache.ground(600).dist[vent]);
  assert.ok(cache.flying().dist[vent] <= cache.ground(12).dist[vent]);
  cache.rebuild(inputFor(parsed), parsed.coreTiles);
  assert.equal(cache.rebuildCount, 2);
});
