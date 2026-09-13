import { test } from "node:test";
import assert from "node:assert/strict";

import { GRID_H, GRID_W, TILE_COUNT } from "../src/outpost/contract.ts";
import {
  FLOOR_TILE,
  MAX_TILE,
  NO_INSETS,
  TARGET_TILE,
  clampToGrid,
  fitView,
  inBounds,
  isOverGrid,
  screenToTile,
  screenToWorld,
  tileCenterToScreen,
  tileIndex,
  tileToScreen,
  tileX,
  tileY,
  worldToScreen,
  worldRadiusToScreen,
} from "../src/outpost/layout.ts";

/** 그리드가 캔버스 박스를 절대 넘지 않는다 — 모든 단언의 전제 */
function assertFits(layout, label) {
  assert.ok(
    layout.gridWidth <= layout.boxWidth + 0.001,
    `${label}: 가로 넘침 ${layout.gridWidth} > ${layout.boxWidth}`,
  );
  assert.ok(
    layout.gridHeight <= layout.boxHeight + 0.001,
    `${label}: 세로 넘침 ${layout.gridHeight} > ${layout.boxHeight}`,
  );
  assert.ok(layout.originX >= -0.001, `${label}: originX 음수 ${layout.originX}`);
  assert.ok(layout.originY >= -0.001, `${label}: originY 음수 ${layout.originY}`);
}

test("그리드 상수가 계약과 일치한다", () => {
  assert.equal(GRID_W, 9);
  assert.equal(GRID_H, 12);
  assert.equal(TILE_COUNT, GRID_W * GRID_H);
});

test("폰 세로(390x595 캔버스 박스) — 폭 제약으로 타일 43", () => {
  const layout = fitView(390, 595, NO_INSETS);
  assert.equal(layout.tile, 43);
  assert.equal(layout.gridWidth, 387);
  assert.equal(layout.gridHeight, 516);
  assert.equal(layout.belowTarget, false);
  // 남는 축은 세로 — 배경 밴드가 상하로 생긴다
  assert.ok(layout.bandY > layout.bandX, "폰은 세로 밴드여야 한다");
  assert.equal(layout.bandY, 39.5);
  assertFits(layout, "390x595");
});

test("데스크톱(1048x796) — 타일 상한 64에 걸리고 가로 밴드가 생긴다", () => {
  const layout = fitView(1048, 796, NO_INSETS);
  assert.equal(layout.tile, MAX_TILE);
  assert.equal(layout.gridWidth, 576);
  assert.equal(layout.gridHeight, 768);
  assert.ok(layout.bandX > layout.bandY, "데스크톱은 가로 밴드여야 한다");
  assert.equal(layout.bandX, 236);
  assertFits(layout, "1048x796");
});

test("짧은 화면 — 목표 40px를 못 채워도 넘치지 않고 작게 그린다", () => {
  const layout = fitView(360, 456, NO_INSETS);
  assert.equal(layout.tile, 38);
  assert.ok(layout.tile < TARGET_TILE);
  assert.equal(layout.belowTarget, true);
  assert.equal(layout.gridHeight, 456);
  assertFits(layout, "360x456");
});

test("좁은 화면 — 세로가 남아도 가로가 타일을 결정한다", () => {
  const layout = fitView(300, 900, NO_INSETS);
  assert.equal(layout.tile, Math.floor(300 / GRID_W));
  // 가로가 병목이라 남는 가로는 «타일 하나보다 작은» 나머지뿐이고, 세로가 크게 남는다
  assert.ok(layout.bandX < layout.tile, `bandX ${layout.bandX} 는 타일보다 작아야 한다`);
  assert.ok(layout.bandY > layout.tile, `bandY ${layout.bandY} 가 세로 여유여야 한다`);
  assertFits(layout, "300x900");
});

test("인셋은 캔버스 박스 안쪽 침범분으로 처리되고 원점을 밀어낸다", () => {
  const plain = fitView(390, 700, NO_INSETS);
  const inset = fitView(390, 700, { top: 40, right: 0, bottom: 20, left: 0 });
  assert.ok(inset.tile <= plain.tile);
  assert.ok(inset.originY >= 40 - 0.001, `originY ${inset.originY} 가 상단 인셋 아래로 내려와야 한다`);
  assert.ok(
    inset.originY + inset.gridHeight <= 700 - 20 + 0.001,
    "하단 인셋을 침범하지 않아야 한다",
  );
  assertFits(inset, "인셋");
});

test("과도한 인셋에도 그리기를 포기하지 않는다", () => {
  const layout = fitView(390, 700, { top: 9999, right: 9999, bottom: 9999, left: 9999 });
  assert.ok(layout.tile >= FLOOR_TILE);
  assert.ok(Number.isFinite(layout.originX) && Number.isFinite(layout.originY));
});

test("0 크기·비정상 입력에서도 던지지 않는다", () => {
  for (const [w, h] of [[0, 0], [-10, -10], [Number.NaN, 500], [500, Number.NaN]]) {
    const layout = fitView(w, h, NO_INSETS);
    assert.ok(layout.tile >= FLOOR_TILE);
    assert.ok(Number.isFinite(layout.gridWidth));
    assert.ok(Number.isFinite(layout.originX));
  }
});

test("타일 인덱스 변환은 왕복한다", () => {
  for (let i = 0; i < TILE_COUNT; i++) {
    assert.equal(tileIndex(tileX(i), tileY(i)), i);
  }
  assert.equal(tileX(0), 0);
  assert.equal(tileY(0), 0);
  // 코어는 아래(행 9~10), 분출구는 위(행 0)
  assert.equal(tileY(tileIndex(4, 9)), 9);
  assert.equal(tileY(tileIndex(1, 0)), 0);
});

test("inBounds 가 격자 밖을 거른다", () => {
  assert.ok(inBounds(0, 0));
  assert.ok(inBounds(GRID_W - 1, GRID_H - 1));
  assert.ok(!inBounds(-1, 0));
  assert.ok(!inBounds(0, -1));
  assert.ok(!inBounds(GRID_W, 0));
  assert.ok(!inBounds(0, GRID_H));
});

test("타일 → 화면 → 타일 왕복이 모든 타일에서 일치한다", () => {
  const layout = fitView(390, 595, NO_INSETS);
  for (let i = 0; i < TILE_COUNT; i++) {
    const center = tileCenterToScreen(layout, i);
    assert.equal(screenToTile(layout, center.x, center.y), i, `타일 ${i} 왕복 실패`);
  }
});

test("타일 좌상단과 중심의 관계가 타일 크기의 절반이다", () => {
  const layout = fitView(1048, 796, NO_INSETS);
  const corner = tileToScreen(layout, tileIndex(3, 5));
  const center = tileCenterToScreen(layout, tileIndex(3, 5));
  assert.equal(center.x - corner.x, layout.tile / 2);
  assert.equal(center.y - corner.y, layout.tile / 2);
});

test("월드 좌표는 타일 단위이고 정수가 타일 좌상단이다", () => {
  const layout = fitView(390, 595, NO_INSETS);
  const at = worldToScreen(layout, { x: 2, y: 3 });
  const corner = tileToScreen(layout, tileIndex(2, 3));
  assert.equal(at.x, corner.x);
  assert.equal(at.y, corner.y);
  const back = screenToWorld(layout, at.x, at.y);
  assert.ok(Math.abs(back.x - 2) < 1e-9);
  assert.ok(Math.abs(back.y - 3) < 1e-9);
});

test("바깥 픽 — 스냅 반경 안이면 가장자리 타일, 멀면 -1", () => {
  const layout = fitView(390, 595, NO_INSETS);
  const topLeft = tileToScreen(layout, 0);

  // 그리드 위쪽 살짝 밖 → 0번 타일로 스냅
  const near = screenToTile(layout, topLeft.x + layout.tile / 2, layout.originY - 4);
  assert.equal(near, 0);

  // 한참 위 → 어디에도 닿지 않는다
  assert.equal(screenToTile(layout, topLeft.x + layout.tile / 2, layout.originY - 400), -1);
  // 좌측 한참 밖
  assert.equal(screenToTile(layout, layout.originX - 400, layout.originY + layout.gridHeight / 2), -1);
  // 우측·하단 한참 밖
  assert.equal(
    screenToTile(layout, layout.originX + layout.gridWidth + 400, layout.originY + 10),
    -1,
  );
  assert.equal(
    screenToTile(layout, layout.originX + 10, layout.originY + layout.gridHeight + 400),
    -1,
  );
});

test("바깥 픽이 가장 가까운 모서리 타일을 고른다", () => {
  const layout = fitView(390, 595, NO_INSETS);
  const bottomRight = tileIndex(GRID_W - 1, GRID_H - 1);
  const picked = screenToTile(
    layout,
    layout.originX + layout.gridWidth + 3,
    layout.originY + layout.gridHeight + 3,
  );
  assert.equal(picked, bottomRight);
});

test("스냅 반경은 타일이 작아질수록 커진다", () => {
  const big = fitView(1048, 796, NO_INSETS);
  const small = fitView(300, 900, NO_INSETS);
  assert.ok(small.snapRadius >= 12);
  assert.ok(big.snapRadius > small.snapRadius);
  assert.equal(big.snapRadius, big.tile * 0.55);
});

test("isOverGrid 는 밴드 영역을 제외한다", () => {
  const layout = fitView(1048, 796, NO_INSETS);
  assert.ok(isOverGrid(layout, layout.originX + 1, layout.originY + 1));
  assert.ok(!isOverGrid(layout, 4, layout.originY + 1), "좌측 밴드는 그리드가 아니다");
  assert.ok(!isOverGrid(layout, layout.originX + layout.gridWidth + 4, layout.originY + 1));
});

test("pickPoint 용 클램프가 항상 격자 범위 안을 돌려준다", () => {
  for (const p of [
    { x: -5, y: -5 },
    { x: 99, y: 99 },
    { x: 4.5, y: 6.25 },
  ]) {
    const clamped = clampToGrid(p);
    assert.ok(clamped.x >= 0 && clamped.x <= GRID_W);
    assert.ok(clamped.y >= 0 && clamped.y <= GRID_H);
  }
  assert.deepEqual(clampToGrid({ x: 4.5, y: 6.25 }), { x: 4.5, y: 6.25 });
});

test("사거리 변환은 타일 단위를 픽셀로 바꾼다", () => {
  const layout = fitView(390, 595, NO_INSETS);
  assert.equal(worldRadiusToScreen(layout, 3), 3 * layout.tile);
  assert.equal(worldRadiusToScreen(layout, 0), 0);
});

test("타일은 언제나 정수라 DPR 스케일에서 흐려지지 않는다", () => {
  for (const [w, h] of [
    [390, 595],
    [412, 699],
    [360, 492],
    [360, 456],
    [1048, 796],
    [768, 1024],
    [333, 617],
  ]) {
    const layout = fitView(w, h, NO_INSETS);
    assert.equal(layout.tile, Math.floor(layout.tile), `${w}x${h} 타일이 정수가 아니다`);
    assertFits(layout, `${w}x${h}`);
  }
});
