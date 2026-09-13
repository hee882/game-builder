import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ABILITY_LABELS,
  AUTOMATION_LABELS,
  BUILDING_LABELS,
  DISCOVERY_LABELS,
  ENEMY_LABELS,
  PHASE_LABELS,
  POLICY_LABELS,
  REJECT_MESSAGES,
  affordability,
  describeComposition,
  formatCost,
  formatNumber,
  formatPercent,
  formatRate,
  formatSeconds,
  rejectMessage,
  salvageLabel,
  strengthBar,
  threatAdvice,
  unlockLabel,
} from "../src/outpost/format.ts";

test("formatNumber switches units at 1천 and 1만", () => {
  assert.equal(formatNumber(0), "0");
  assert.equal(formatNumber(999), "999");
  assert.equal(formatNumber(1000), "1천");
  assert.equal(formatNumber(1234), "1.2천");
  assert.equal(formatNumber(9999), "9.9천");
  assert.equal(formatNumber(10000), "1만");
  assert.equal(formatNumber(34567), "3.4만");
  assert.equal(formatNumber(-250), "-250");
});

test("formatNumber tolerates non-finite input instead of printing NaN", () => {
  assert.equal(formatNumber(Number.NaN), "0");
  assert.equal(formatNumber(Number.POSITIVE_INFINITY), "0");
});

test("formatRate always carries a sign and one decimal", () => {
  assert.equal(formatRate(3.24), "+3.2/초");
  assert.equal(formatRate(0), "+0.0/초");
  assert.equal(formatRate(-1.55), "-1.6/초");
});

test("formatSeconds reads as Korean minutes past 60", () => {
  assert.equal(formatSeconds(12.7), "12초");
  assert.equal(formatSeconds(59), "59초");
  assert.equal(formatSeconds(60), "1분 00초");
  assert.equal(formatSeconds(125), "2분 05초");
  assert.equal(formatSeconds(-5), "0초");
});

test("formatPercent clamps to 0..100", () => {
  assert.equal(formatPercent(0.5), "50%");
  assert.equal(formatPercent(-1), "0%");
  assert.equal(formatPercent(4), "100%");
});

test("formatCost omits any resource the item does not cost", () => {
  assert.equal(formatCost({ scrap: 45, biomass: 0 }), "고철 45");
  assert.equal(formatCost({ scrap: 80, biomass: 10 }), "고철 80 · 생체 10");
  // 테크는 생체물질만 쓴다 — "고철 0"이 붙으면 안 된다
  assert.equal(formatCost({ scrap: 0, biomass: 30 }), "생체 30");
  assert.equal(formatCost({ scrap: 0, biomass: 0 }), "무료");
});

test("affordability needs both resources", () => {
  const wallet = { scrap: 100, biomass: 5 };
  assert.equal(affordability(wallet, { scrap: 80, biomass: 5 }), "ok");
  assert.equal(affordability(wallet, { scrap: 120, biomass: 0 }), "tooExpensive");
  assert.equal(affordability(wallet, { scrap: 10, biomass: 20 }), "tooExpensive");
});

test("every reject reason has a non-empty Korean line", () => {
  const reasons = Object.keys(REJECT_MESSAGES);
  assert.equal(reasons.length, 16);
  for (const reason of reasons) {
    const message = rejectMessage(reason);
    assert.equal(typeof message, "string");
    assert.ok(message.length > 0, `${reason} 문구 누락`);
  }
});

test("label tables cover every id the contract declares", () => {
  assert.deepEqual(Object.keys(BUILDING_LABELS).sort(), [
    "bulkhead",
    "collector",
    "droneBay",
    "harpoon",
    "mortar",
    "resonator",
  ]);
  assert.deepEqual(Object.keys(ENEMY_LABELS).sort(), ["breacher", "drifter", "glider", "leviathan", "swarm"]);
  assert.deepEqual(Object.keys(ABILITY_LABELS).sort(), ["sonarPulse", "weld"]);
  assert.deepEqual(Object.keys(POLICY_LABELS).sort(), ["air", "leader", "nearest"]);
  assert.deepEqual(Object.keys(AUTOMATION_LABELS).sort(), ["autoRebuildWalls", "droneRole"]);
  assert.deepEqual(Object.keys(DISCOVERY_LABELS).sort(), ["deepArchaeology", "flawlessPair", "ventResonance"]);
  assert.deepEqual(Object.keys(PHASE_LABELS).sort(), ["build", "chapterCleared", "defeat", "victory", "wave"]);
});

test("describeComposition names variant, role and count", () => {
  assert.equal(describeComposition([]), "적 없음");
  assert.equal(
    describeComposition([
      { role: "drifter", variant: "elite", count: 10 },
      { role: "breacher", variant: "base", count: 3 },
    ]),
    "정예 표류체 10 · 굴착체 3",
  );
});

test("threatAdvice picks the largest group and warns about armor", () => {
  assert.equal(threatAdvice([]), "");
  assert.equal(
    threatAdvice([
      { role: "drifter", variant: "base", count: 8 },
      { role: "swarm", variant: "base", count: 10 },
    ]),
    ENEMY_LABELS.swarm.counter,
  );
  assert.equal(
    threatAdvice([{ role: "glider", variant: "elite", count: 6 }]),
    `장갑 있음 — ${ENEMY_LABELS.glider.counter}`,
  );
});

test("strengthBar maps 0..3 to one readable glyph each", () => {
  const glyphs = [strengthBar(0), strengthBar(1), strengthBar(2), strengthBar(3)];
  assert.equal(new Set(glyphs).size, 4);
  for (const glyph of glyphs) assert.equal(glyph.length, 1);
});

test("unlockLabel distinguishes wave progress from hidden discoveries", () => {
  const base = { building: "mortar", unlocked: false, requirement: "waveClear", wavesRemaining: 2, discovery: null };
  assert.equal(unlockLabel(base), "웨이브 2회 더");
  assert.equal(unlockLabel({ ...base, wavesRemaining: 0 }), "다음 웨이브 클리어");
  assert.equal(unlockLabel({ ...base, unlocked: true }), "해금됨");
  assert.equal(
    unlockLabel({ ...base, requirement: "discovery", discovery: "ventResonance" }),
    "??? 발견으로 열린다",
  );
});

test("salvageLabel explains exhaustion instead of showing a silent zero", () => {
  assert.equal(salvageLabel(90, 150, false), "잔해 90 / 150");
  assert.match(salvageLabel(0, 150, true), /고갈/);
  assert.match(salvageLabel(0, 150, true), /웨이브를 시작/);
});
