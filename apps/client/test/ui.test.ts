import { describe, expect, it } from 'vitest';
import type { Item } from '../../../packages/sim/src/types';
import { compareItems } from '../src/ui/inventory';
const item = (partial: Partial<Item>): Item => ({ id: 1, slot: 'weapon', name: '검증 환도', rarity: 'common', ilvl: 1, base: 10, affixes: [], legendary: null, ...partial });
describe('equipment comparison', () => {
  it('shows base gains and lost bonuses across the union of affixes', () => {
    const rows = compareItems(item({ base: 15, affixes: [{ stat: 'life', value: 8 }] }), item({ affixes: [{ stat: 'critChance', value: 5 }] }));
    expect(rows.map(row => row.value)).toEqual([5, 8, -5]);
  });
  it('aggregates duplicate bonuses and treats cooldown reduction as a gain', () => {
    const rows = compareItems(item({ affixes: [{ stat: 'cooldownPct', value: 3 }, { stat: 'cooldownPct', value: 5 }] }), item({ affixes: [{ stat: 'cooldownPct', value: 4 }] }));
    expect(rows).toEqual([{ label: '재사용 대기시간 %', value: 4 }]);
  });
  it('compares empty slots and omits identical values without mutating equipment', () => {
    const current = item({ base: 16 }); const before = structuredClone(current);
    expect(compareItems(current, null)).toEqual([{ label: '기본 피해', value: 16 }]);
    expect(compareItems(current, current)).toEqual([]); expect(current).toEqual(before);
  });
});
