import { LEGENDARIES, MAX_LEVEL, SKILL_ORDER, AFFIXES } from './data';
import { EQUIP_SLOTS, HOT_SLOTS } from './types';
import type { Affix, EquipSlot, Item, LegendaryId, Profile, Rarity, SkillId, StatKey } from './types';

export function serializeProfile(profile: Profile): string { return JSON.stringify(profile); }

const RARITIES: readonly Rarity[] = ['common', 'magic', 'rare', 'legendary'];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isInt = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

function parseAffix(value: unknown): Affix | null {
  if (!isRecord(value) || typeof value.stat !== 'string' || !(value.stat in AFFIXES) || !isInt(value.value, 1, 100000)) return null;
  return { stat: value.stat as StatKey, value: value.value };
}

function parseItem(value: unknown): Item | null {
  if (!isRecord(value)) return null;
  const { id, slot, rarity, name, ilvl, base, affixes, legendary } = value;
  if (!isInt(id, 1, Number.MAX_SAFE_INTEGER) || typeof slot !== 'string' || !EQUIP_SLOTS.includes(slot as EquipSlot)) return null;
  if (typeof rarity !== 'string' || !RARITIES.includes(rarity as Rarity) || typeof name !== 'string') return null;
  if (!isInt(ilvl, 1, MAX_LEVEL) || !isInt(base, 0, 100000) || !Array.isArray(affixes)) return null;
  if (legendary !== null && (typeof legendary !== 'string' || !(legendary in LEGENDARIES))) return null;
  const parsed = affixes.map(parseAffix);
  if (parsed.some(affix => affix === null)) return null;
  return { id, slot: slot as EquipSlot, rarity: rarity as Rarity, name, ilvl, base, affixes: parsed as Affix[], legendary: legendary as LegendaryId | null };
}

/** 저장 문자열을 검증해 Profile로 만든다. 하나라도 어긋나면 null — 호출자가 백업 후 새로 시작한다. */
export function parseProfile(text: string): Profile | null {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!isRecord(raw) || raw.version !== 1) return null;
  const { level, xp, inventory, equipped, slots, runCount, nextItemId } = raw;
  if (!isInt(level, 1, MAX_LEVEL) || !isInt(xp, 0, 1e9) || !isInt(runCount, 0, 1e9) || !isInt(nextItemId, 1, Number.MAX_SAFE_INTEGER)) return null;
  if (!Array.isArray(inventory) || inventory.length > 30 || !isRecord(equipped) || !isRecord(slots)) return null;
  const items = inventory.map(parseItem);
  if (items.some(item => item === null)) return null;
  const gear = {} as Profile['equipped'];
  for (const slot of EQUIP_SLOTS) {
    const item = equipped[slot] === null || equipped[slot] === undefined ? null : parseItem(equipped[slot]);
    if (equipped[slot] && (!item || item.slot !== slot)) return null;
    gear[slot] = item;
  }
  const hot = {} as Profile['slots'];
  for (const slot of HOT_SLOTS) {
    const skill = slots[slot];
    if (skill !== null && (typeof skill !== 'string' || !SKILL_ORDER.includes(skill as SkillId))) return null;
    hot[slot] = skill as SkillId | null;
  }
  return { version: 1, level, xp, inventory: items as Item[], equipped: gear, slots: hot, runCount, nextItemId };
}
