import { HOT_SLOTS, HZ, SKILLS, SKILL_ORDER } from '@yeonmu/sim';
import type { HotSlot, Player, SkillId } from '@yeonmu/sim';
import { button, GLYPHS, node, panel, SLOT_KEYS } from './common';
import type { UiActions } from './common';
const DESCRIPTIONS: Record<SkillId, string> = {
  slash: '전방 부채꼴 베기 · 무기 피해 100% · 기 +8', spin: '주변 원형 베기 · 무기 피해 160%',
  dash: '커서 방향 최대 6m 돌진 · 경로 피해 120%', talisman: '지정한 곳 반경 3m 폭발 · 피해 220%',
  cleave: '전방 넓은 원뿔 · 피해 400% · 강한 경직', ward: '5초 동안 주변 적 40% 둔화 · 받는 피해 30% 감소',
};
export class Skills {
  readonly root = panel('무공 · K', () => this.toggle());
  private list = node('div', 'skill-list');
  private slots = node('div', 'assignment-slots');
  private hint = node('p', 'panel-hint');
  private selected: SkillId | null = null;
  private signature = '';
  constructor(private actions: UiActions) { this.root.id = 'skills'; this.root.append(this.hint, this.list, this.slots); }
  toggle(): void { this.root.hidden = !this.root.hidden; this.signature = ''; }
  update(p: Player): void {
    if (this.root.hidden) return;
    const signature = JSON.stringify([p.level, p.slots, this.selected]); if (signature === this.signature) return;
    this.signature = signature; this.list.replaceChildren(); this.slots.replaceChildren();
    this.hint.textContent = this.selected ? `${SKILLS[this.selected].name} → 아래 배치할 슬롯 선택` : '무공을 고른 뒤 아래 슬롯을 누르세요. 전투는 계속됩니다.';
    for (const id of SKILL_ORDER) {
      const def = SKILLS[id], locked = p.level < def.unlock;
      const row = button('', () => { this.selected = id; this.signature = ''; }, 'skill-choice');
      row.disabled = locked || id === 'slash'; row.classList.toggle('selected', id === this.selected);
      row.append(node('strong', '', `${GLYPHS[id]} ${def.name}${locked ? ' · 잠김' : ''}`),
        node('span', '', `Lv ${def.unlock} 해금 · 기 ${def.cost} · 쿨 ${def.cooldown / HZ}초`),
        node('small', '', DESCRIPTIONS[id] + (id === 'slash' ? ' · 좌클릭 고정' : '')));
      this.list.append(row);
    }
    HOT_SLOTS.forEach((slot: HotSlot, index) => {
      const control = button(`${SLOT_KEYS[index]}\n${p.slots[slot] ? SKILLS[p.slots[slot]!].name : '빈 슬롯'}`, () => {
        if (this.selected) this.actions.command({ type: 'assign', slot, skill: this.selected });
      });
      control.disabled = !this.selected; this.slots.append(control);
    });
  }
}
