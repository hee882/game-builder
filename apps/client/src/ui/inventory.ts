import { AFFIXES, EQUIP_SLOTS, INVENTORY_SIZE, LEGENDARIES, SLOT_NAMES, affixText } from '@yeonmu/sim';
import type { EquipSlot, Item, Player, StatKey } from '@yeonmu/sim';
import { button, node, panel } from './common';
import type { UiActions } from './common';
export const RARITIES = { common: '일반', magic: '마법', rare: '희귀', legendary: '전설' };
export interface Difference { label: string; value: number }
/** Compare the union of affixes, including bonuses lost when replacing gear. */
export function compareItems(item: Item, equipped: Item | null): Difference[] {
  const rows: Difference[] = [{ label: item.slot === 'weapon' ? '기본 피해' : '기본 체력', value: item.base - (equipped?.base ?? 0) }];
  const values = new Map<StatKey, number>();
  for (const affix of item.affixes) values.set(affix.stat, (values.get(affix.stat) ?? 0) + affix.value);
  for (const affix of equipped?.affixes ?? []) values.set(affix.stat, (values.get(affix.stat) ?? 0) - affix.value);
  for (const [stat, value] of values) rows.push({ label: stat === 'cooldownPct' ? '재사용 대기시간 %' : AFFIXES[stat].label.replace(/[+-]\{v\}/, '').trim(), value });
  return rows.filter(row => row.value !== 0);
}
export class Inventory {
  readonly root = panel('행낭 · I', () => this.toggle());
  private equipped = node('div', 'equipment-grid');
  private bag = node('div', 'inventory-grid');
  private count = node('p', 'panel-hint');
  private tooltip = node('aside', 'item-tooltip');
  private signature = '';
  private hovered: { id: number; slot: EquipSlot | null; touch: boolean } | null = null;
  private player: Player | null = null;
  constructor(private actions: UiActions, private notify: (text: string) => void) {
    this.root.id = 'inventory'; this.tooltip.hidden = true; this.tooltip.setAttribute('aria-label', '장비 비교');
    this.root.append(node('p', 'panel-hint', '클릭 장착·해제 / 우클릭·길게 누르기 내려놓기'), this.equipped, this.count, this.bag);
    document.body.append(this.tooltip);
    this.root.addEventListener('contextmenu', e => e.preventDefault());
  }
  toggle(): void {
    this.root.hidden = !this.root.hidden; this.signature = '';
    if (this.root.hidden) { this.hovered = null; this.tooltip.hidden = true; }
  }
  update(p: Player): void {
    this.player = p; if (this.root.hidden) return;
    const signature = JSON.stringify([p.inventory, p.equipped]); if (signature === this.signature) return;
    this.signature = signature; this.equipped.replaceChildren(); this.bag.replaceChildren();
    for (const slot of EQUIP_SLOTS) this.equipped.append(this.cell(p.equipped[slot], slot));
    for (let i = 0; i < INVENTORY_SIZE; i++) this.bag.append(this.cell(p.inventory[i] ?? null, null));
    this.count.textContent = `행낭 ${p.inventory.length} / ${INVENTORY_SIZE} · 전투는 계속됩니다`;
    if (this.hovered) {
      const item = this.hovered.slot ? p.equipped[this.hovered.slot] : p.inventory.find(item => item.id === this.hovered?.id);
      if (item?.id === this.hovered.id) this.describe(item, this.hovered.slot);
      else { this.hovered = null; this.tooltip.hidden = true; }
    }
  }
  private equip(item: Item, slot: EquipSlot | null): void {
    if (slot && this.player!.inventory.length >= INVENTORY_SIZE) { this.notify('가방이 가득 차 장비를 해제할 수 없습니다'); return; }
    this.actions.command(slot ? { type: 'unequip', slot } : { type: 'equip', item: item.id });
    this.hovered = null; this.tooltip.hidden = true;
  }
  private drop(item: Item, slot: EquipSlot | null): void {
    if (slot) {
      if (this.player!.inventory.length >= INVENTORY_SIZE) { this.notify('먼저 가방 한 칸을 비워 주세요'); return; }
      this.actions.command({ type: 'unequip', slot });
    }
    this.actions.command({ type: 'drop_item', item: item.id }); this.hovered = null; this.tooltip.hidden = true;
  }
  private cell(item: Item | null, slot: EquipSlot | null): HTMLButtonElement {
    const root = node('button', `item-cell ${item?.rarity ?? ''}`); root.type = 'button';
    if (slot) root.append(node('small', '', slot === 'weapon' ? '무기' : SLOT_NAMES[slot]));
    root.append(node('span', '', item?.name ?? (slot ? '비어 있음' : '·')));
    root.setAttribute('aria-label', `${slot ? '착용 ' : ''}${item?.name ?? '빈 칸'}`);
    if (!item) { root.disabled = true; return root; }
    root.dataset.item = String(item.id); root.dataset.slot = slot ?? '';
    let timer = 0, held = false, origin = { x: 0, y: 0 };
    const cancel = () => { window.clearTimeout(timer); timer = 0; };
    root.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') { this.hovered = { id: item.id, slot, touch: false }; this.describe(item, slot); } });
    root.addEventListener('pointerleave', () => { cancel(); if (!this.hovered?.touch) { this.hovered = null; this.tooltip.hidden = true; } });
    root.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.button !== 2) return;
      held = false; origin = { x: e.clientX, y: e.clientY };
      if (e.button === 2) { e.preventDefault(); this.drop(item, slot); held = true; return; }
      timer = window.setTimeout(() => { held = true; this.drop(item, slot); }, 550);
    });
    root.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 10) { cancel(); held = true; } });
    root.addEventListener('pointercancel', cancel);
    root.addEventListener('pointerup', e => {
      cancel(); if (e.button !== 0 || held) return; e.preventDefault();
      if (e.pointerType === 'touch' && (this.hovered?.id !== item.id || !this.hovered.touch)) { this.hovered = { id: item.id, slot, touch: true }; this.describe(item, slot); }
      else this.equip(item, slot);
    });
    root.addEventListener('focus', () => { this.hovered = { id: item.id, slot, touch: false }; this.describe(item, slot); });
    root.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) this.equip(item, slot); }
    });
    return root;
  }
  private describe(item: Item, slot: EquipSlot | null): void {
    const equipped = this.player!.equipped[item.slot]; this.tooltip.replaceChildren(); this.tooltip.hidden = false;
    this.tooltip.append(node('h3', item.rarity, item.name), node('p', '', `${RARITIES[item.rarity]} · ${SLOT_NAMES[item.slot]} · 아이템 Lv ${item.ilvl}`),
      node('p', '', `${item.slot === 'weapon' ? '기본 피해' : '기본 체력'} ${item.base}`));
    for (const affix of item.affixes) this.tooltip.append(node('div', '', affixText(affix)));
    if (item.legendary) this.tooltip.append(node('p', 'legendary', LEGENDARIES[item.legendary].text));
    this.tooltip.append(node('hr'), node('strong', '', slot ? '현재 착용 중' : `착용 비교 · ${equipped?.name ?? '빈 슬롯'}`));
    if (!slot) {
      const rows = compareItems(item, equipped);
      for (const row of rows) this.tooltip.append(node('div', row.value > 0 ? 'improved' : 'reduced', `${row.label} ${row.value > 0 ? '+' : ''}${row.value}`));
      if (!rows.length) this.tooltip.append(node('div', '', '수치 변화 없음'));
      if (equipped?.legendary && equipped.legendary !== item.legendary) this.tooltip.append(node('p', 'reduced', `효과 상실: ${LEGENDARIES[equipped.legendary].text}`));
    }
    if (this.hovered?.touch) this.tooltip.append(button(slot ? '장비 해제' : '장착', () => this.equip(item, slot)), button('닫기', () => { this.tooltip.hidden = true; this.hovered = null; }));
  }
}
