import { AFFIXES, DROP, LEGENDARIES, RARE_NAMES, RARE_SUFFIX, RARITY_AFFIXES, SLOT_NAMES, levelMult } from './data';
import { chance, nextFloat, nextInt, pick } from './rng';
import type { RngHolder } from './rng';
import { EQUIP_SLOTS } from './types';
import type { Affix, EquipSlot, Item, LegendaryId, Profile, Rarity, SkillId, StatKey, Stats } from './types';

export type DropSource = 'normal' | 'elite' | 'boss';
export interface ItemCounter { nextItemId: number }

export function rollRarity(holder: RngHolder, source: DropSource): Rarity {
  const roll = nextFloat(holder);
  if (roll < DROP.legendary[source]) return 'legendary';
  if (roll < DROP.legendary[source] + DROP.rare[source]) return 'rare';
  if (roll < DROP.legendary[source] + DROP.rare[source] + DROP.magic[source]) return 'magic';
  return 'common';
}

const STAT_KEYS = Object.keys(AFFIXES) as StatKey[];
const LEGENDARY_IDS = Object.keys(LEGENDARIES) as LegendaryId[];

function rollAffixes(holder: RngHolder, count: number, ilvl: number): Affix[] {
  const pool = [...STAT_KEYS]; const result: Affix[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const stat = pool.splice(nextInt(holder, 0, pool.length - 1), 1)[0]!;
    const def = AFFIXES[stat];
    const raw = def.min + nextFloat(holder) * (def.max - def.min);
    result.push({ stat, value: Math.max(1, Math.round(def.scale ? raw * levelMult(ilvl) : raw)) });
  }
  return result;
}

function itemName(holder: RngHolder, slot: EquipSlot, rarity: Rarity, affixes: Affix[], legendary: LegendaryId | null): string {
  if (legendary) return LEGENDARIES[legendary].name;
  const base = SLOT_NAMES[slot];
  if (rarity === 'magic' && affixes[0]) return `${AFFIXES[affixes[0].stat].prefix} ${base}`;
  if (rarity === 'rare') return `${pick(holder, RARE_NAMES)} ${pick(holder, RARE_SUFFIX)} ${base}`;
  return base;
}

export function rollItem(holder: RngHolder, counter: ItemCounter, ilvl: number, rarity: Rarity, fixedSlot?: EquipSlot): Item {
  let legendary: LegendaryId | null = null;
  let slot: EquipSlot = fixedSlot ?? pick(holder, EQUIP_SLOTS);
  if (rarity === 'legendary') { legendary = pick(holder, LEGENDARY_IDS); slot = LEGENDARIES[legendary].slot; }
  const [min, max] = RARITY_AFFIXES[rarity];
  const affixes = rollAffixes(holder, nextInt(holder, min, max), ilvl);
  const base = slot === 'weapon' ? 10 + 3 * ilvl + nextInt(holder, 0, 3) : 4 * ilvl + nextInt(holder, 0, 4);
  return { id: counter.nextItemId++, slot, rarity, name: itemName(holder, slot, rarity, affixes, legendary), ilvl, base, affixes, legendary };
}

export function dropCount(holder: RngHolder, source: DropSource): number {
  if (source === 'boss') return DROP.bossItems;
  if (source === 'elite') return nextInt(holder, DROP.eliteItems[0], DROP.eliteItems[1]);
  return chance(holder, DROP.normalItem) ? 1 : 0;
}

export function starterProfile(): Profile {
  const weapon: Item = { id: 1, slot: 'weapon', rarity: 'common', name: '낡은 환도', ilvl: 1, base: 12, affixes: [], legendary: null };
  return {
    version: 1, level: 1, xp: 0, inventory: [], runCount: 0, nextItemId: 2,
    equipped: { weapon, hat: null, robe: null, gloves: null, boots: null, charm: null },
    slots: { rmb: 'spin', s1: null, s2: null, s3: null, s4: null },
  };
}

export function computeStats(level: number, equipped: Record<EquipSlot, Item | null>): Stats {
  const sum: Record<StatKey, number> = Object.fromEntries(STAT_KEYS.map(key => [key, 0])) as Record<StatKey, number>;
  let armorLife = 0; const legendaries: LegendaryId[] = [];
  for (const slot of EQUIP_SLOTS) {
    const item = equipped[slot];
    if (!item) continue;
    if (slot !== 'weapon') armorLife += item.base;
    for (const affix of item.affixes) sum[affix.stat] += affix.value;
    if (item.legendary) legendaries.push(item.legendary);
  }
  const pct = (value: number): number => 1 + value / 100;
  const skillMult: Record<SkillId, number> = {
    slash: 1, spin: pct(sum.spinPct), dash: pct(sum.dashPct), talisman: pct(sum.talismanPct), cleave: pct(sum.cleavePct), ward: 1,
  };
  return {
    maxHp: 140 + 10 * (level - 1) + armorLife + sum.life,
    weaponDamage: equipped.weapon?.base ?? 6,
    damageMult: (1 + 0.08 * (level - 1)) * pct(sum.damagePct),
    attackSpeed: pct(sum.attackSpeedPct),
    critChance: 0.05 + sum.critChance / 100,
    critDamage: 0.5 + sum.critDamage / 100,
    moveSpeed: 0.2 * pct(sum.moveSpeedPct),
    spiritRegen: (2 + sum.spiritRegen) / 30,
    lifeOnKill: sum.lifeOnKill,
    cooldownMult: 1 - Math.min(40, sum.cooldownPct) / 100,
    skillMult, legendaries,
  };
}

export function affixText(affix: Affix): string { return AFFIXES[affix.stat].label.replace('{v}', String(affix.value)); }
