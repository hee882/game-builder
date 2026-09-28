/**
 * 순수 좌표 수학. DOM·캔버스에 접근하지 않으며 node에서 그대로 단위 테스트한다.
 *
 * 좌표계
 *   월드(Vec2)  타일 단위 실수. 정수 = 타일 좌상단 (contract.ts Vec2 주석)
 *   화면        캔버스 CSS 픽셀. 좌상단 원점
 *
 * 캔버스는 셸이 HUD 레이아웃을 끝낸 뒤 **자기 CSS 박스**를 넘긴다. 여기서 HUD를 다시 빼지
 * 않는다. insets 는 캔버스 박스 «안쪽»으로 겹치는 영역(노치·오버레이 바)만 의미한다.
 * 타일 하한을 강제해 넘치게 만들지 않는다 — 좁은 화면에서는 목표치보다 작게 그린다.
 */

import { GRID_H, GRID_W } from './contract.ts';
import type { TileIndex, Vec2, ViewportInsets } from './contract.ts';

/** 목표 타일 크기. 하한이 아니라 «이보다 작아지면 스냅으로 보정한다»는 기준선 */
export const TARGET_TILE = 40;
/** 데스크톱에서 판이 허황되게 커지지 않게 하는 상한 */
export const MAX_TILE = 64;
/** 어떤 박스에서도 그리기를 포기하지 않기 위한 절대 하한 */
export const FLOOR_TILE = 8;

export const NO_INSETS: ViewportInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export interface ViewLayout {
  /** 한 타일의 CSS 픽셀 크기(정수) */
  readonly tile: number;
  /** 그리드 좌상단의 화면 좌표 */
  readonly originX: number;
  readonly originY: number;
  /** 그리드 전체 픽셀 크기 */
  readonly gridWidth: number;
  readonly gridHeight: number;
  /** 넘겨받은 캔버스 CSS 박스 */
  readonly boxWidth: number;
  readonly boxHeight: number;
  /** 그리드가 채우지 못한 여백. 여기가 배경 장면(밴드)이 된다 */
  readonly bandX: number;
  readonly bandY: number;
  /** 탭 스냅 반경. 타일이 작아질수록 커진다 */
  readonly snapRadius: number;
  /** 목표 타일보다 작게 그렸는가(셸이 확정 버튼을 더 크게 쓸 근거) */
  readonly belowTarget: boolean;
}

function clampInset(value: number, limit: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, limit);
}

/**
 * 캔버스 CSS 박스 안에 9×12 를 전부 넣는다. 넘치지 않는 것이 최우선이고,
 * 남는 축은 배경 밴드로 넘긴다.
 */
export function fitView(
  cssWidth: number,
  cssHeight: number,
  insets: ViewportInsets = NO_INSETS,
): ViewLayout {
  const boxWidth = Math.max(0, Number.isFinite(cssWidth) ? cssWidth : 0);
  const boxHeight = Math.max(0, Number.isFinite(cssHeight) ? cssHeight : 0);

  // 인셋은 박스 «안쪽» 침범분이다. 합이 박스를 먹어치우지 않도록 절반으로 제한한다.
  const insetLeft = clampInset(insets.left, boxWidth * 0.4);
  const insetRight = clampInset(insets.right, boxWidth * 0.4);
  const insetTop = clampInset(insets.top, boxHeight * 0.4);
  const insetBottom = clampInset(insets.bottom, boxHeight * 0.4);

  const usableWidth = Math.max(0, boxWidth - insetLeft - insetRight);
  const usableHeight = Math.max(0, boxHeight - insetTop - insetBottom);

  // 하한 클램프 없음 — 목표치를 못 채우면 작게 그린다. 넘치는 것보다 낫다.
  const byWidth = Math.floor(usableWidth / GRID_W);
  const byHeight = Math.floor(usableHeight / GRID_H);
  const tile = Math.max(FLOOR_TILE, Math.min(byWidth, byHeight, MAX_TILE));

  const gridWidth = tile * GRID_W;
  const gridHeight = tile * GRID_H;

  // 남는 공간을 인셋 영역 안에서 중앙 정렬한다.
  const originX = insetLeft + (usableWidth - gridWidth) / 2;
  const originY = insetTop + (usableHeight - gridHeight) / 2;

  return {
    tile,
    originX: Math.round(originX * 2) / 2,
    originY: Math.round(originY * 2) / 2,
    gridWidth,
    gridHeight,
    boxWidth,
    boxHeight,
    bandX: Math.max(0, (usableWidth - gridWidth) / 2),
    bandY: Math.max(0, (usableHeight - gridHeight) / 2),
    snapRadius: Math.max(12, tile * 0.55),
    belowTarget: tile < TARGET_TILE,
  };
}

export function tileX(tile: TileIndex): number {
  return tile % GRID_W;
}

export function tileY(tile: TileIndex): number {
  return Math.floor(tile / GRID_W);
}

export function tileIndex(x: number, y: number): TileIndex {
  return y * GRID_W + x;
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
}

/** 타일 좌상단의 화면 좌표 */
export function tileToScreen(layout: ViewLayout, tile: TileIndex): { x: number; y: number } {
  return {
    x: layout.originX + tileX(tile) * layout.tile,
    y: layout.originY + tileY(tile) * layout.tile,
  };
}

/** 타일 중심의 화면 좌표 */
export function tileCenterToScreen(layout: ViewLayout, tile: TileIndex): { x: number; y: number } {
  const half = layout.tile / 2;
  const at = tileToScreen(layout, tile);
  return { x: at.x + half, y: at.y + half };
}

/** 월드(타일 단위) → 화면 */
export function worldToScreen(layout: ViewLayout, point: Vec2): { x: number; y: number } {
  return {
    x: layout.originX + point.x * layout.tile,
    y: layout.originY + point.y * layout.tile,
  };
}

/** 화면 → 월드(타일 단위). 그리드 밖도 그대로 외삽한다(잠수정 이동 명령용) */
export function screenToWorld(layout: ViewLayout, cssX: number, cssY: number): Vec2 {
  return {
    x: (cssX - layout.originX) / layout.tile,
    y: (cssY - layout.originY) / layout.tile,
  };
}

/** 잠수정 이동·조준용. 항상 그리드 범위 안으로 잘라 낸다 */
export function clampToGrid(point: Vec2): Vec2 {
  return {
    x: Math.min(GRID_W, Math.max(0, point.x)),
    y: Math.min(GRID_H, Math.max(0, point.y)),
  };
}

/**
 * 화면 → 타일. 그리드 안이면 그 타일, 밖이면 스냅 반경 안의 가장 가까운 타일.
 * 어디에도 닿지 않으면 -1.
 */
export function screenToTile(layout: ViewLayout, cssX: number, cssY: number): TileIndex {
  const world = screenToWorld(layout, cssX, cssY);
  const rawX = Math.floor(world.x);
  const rawY = Math.floor(world.y);
  if (inBounds(rawX, rawY)) return tileIndex(rawX, rawY);

  // 가장자리 바깥: 스냅 반경 안이면 가장 가까운 경계 타일로 끌어당긴다.
  const snappedX = Math.min(GRID_W - 1, Math.max(0, rawX));
  const snappedY = Math.min(GRID_H - 1, Math.max(0, rawY));
  const center = tileCenterToScreen(layout, tileIndex(snappedX, snappedY));
  const dx = cssX - center.x;
  const dy = cssY - center.y;
  const reach = layout.snapRadius + layout.tile / 2;
  if (dx * dx + dy * dy <= reach * reach) return tileIndex(snappedX, snappedY);
  return -1;
}

/** 화면 좌표가 그리드 사각형 안에 있는가(밴드 영역 제외) */
export function isOverGrid(layout: ViewLayout, cssX: number, cssY: number): boolean {
  return (
    cssX >= layout.originX &&
    cssX < layout.originX + layout.gridWidth &&
    cssY >= layout.originY &&
    cssY < layout.originY + layout.gridHeight
  );
}

/** 화면 거리 → 월드 거리(사거리 원 등) */
export function worldRadiusToScreen(layout: ViewLayout, tiles: number): number {
  return tiles * layout.tile;
}
