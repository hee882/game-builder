import { HOT_SLOTS, HZ, MAX_LEVEL, SKILLS, xpToNext } from '@yeonmu/sim';
import type { RunState, SimEvent } from '@yeonmu/sim';
import { button, fraction, GLYPHS, node, SLOT_KEYS } from './common';
import type { UiActions } from './common';

export class Hud {
  private root = node('section', 'game-hud');
  private location = node('div', 'dungeon-info');
  private hp = this.orb('life', '체력');
  private spirit = this.orb('spirit', '기');
  private xp = node('div', 'xp-fill');
  private level = node('span', 'xp-level');
  private toast = node('div', 'ui-toast');
  private toastUntil = 0;
  private slots: { root: HTMLButtonElement; glyph: HTMLElement; label: HTMLElement; sweep: HTMLElement; seconds: HTMLElement }[] = [];
  constructor(actions: UiActions) {
    this.root.setAttribute('aria-label', '전투 상태'); this.toast.setAttribute('role', 'status');
    const center = node('div', 'hud-center'), experience = node('div', 'xp-bar'), bar = node('div', 'skill-bar');
    experience.append(this.xp, this.level);
    for (let i = 0; i < 6; i++) {
      const slot = i === 0 ? 'lmb' : HOT_SLOTS[i - 1]!;
      const root = button('', () => actions.cast(slot), 'skill-slot');
      const glyph = node('strong', 'skill-glyph'), label = node('span', 'skill-name');
      const sweep = node('span', 'cooldown-sweep'), seconds = node('span', 'cooldown-seconds');
      root.append(node('small', 'slot-key', i === 0 ? '좌클릭' : SLOT_KEYS[i - 1]), glyph, label, sweep, seconds);
      bar.append(root); this.slots.push({ root, glyph, label, sweep, seconds });
    }
    const help = node('div', 'hud-help', '클릭 이동·공격·줍기 / Shift 제자리 / Alt 전리품 / 휠 확대');
    const menus = node('nav', 'hud-menus'); menus.append(button('가방 I', actions.inventory), button('스킬 K', actions.skills));
    center.append(experience, bar, help, menus); this.root.append(this.hp.root, center, this.spirit.root);
    document.body.append(this.root, this.location, this.toast);
  }
  private orb(kind: string, label: string) {
    const root = node('div', `orb ${kind}`), liquid = node('div', 'orb-liquid'), text = node('span', 'orb-text');
    root.setAttribute('aria-label', label); root.append(liquid, text); return { root, liquid, text };
  }
  notify(message: string, now = performance.now()): void { this.toast.textContent = message; this.toastUntil = now + 5000; }
  events(events: readonly SimEvent[]): void {
    for (const event of events) {
      if (event.type === 'level_up') this.notify(`경지 상승 · Lv ${event.level}${event.unlocked.length ? ' — ' + event.unlocked.map(id => SKILLS[id].name).join(' · ') + ' 해금 · K로 배치' : ''}`);
      if (event.type === 'inventory_full') this.notify('가방이 가득 찼습니다 · I로 장비를 정리하세요');
    }
  }
  update(state: RunState, now: number): void {
    const p = state.player;
    this.hp.liquid.style.height = `${fraction(p.hp, p.stats.maxHp) * 100}%`;
    this.hp.text.textContent = `체력\n${Math.ceil(p.hp)} / ${p.stats.maxHp}`;
    this.spirit.liquid.style.height = `${fraction(p.spirit, 100) * 100}%`;
    this.spirit.text.textContent = `氣\n${Math.floor(p.spirit)} / 100`;
    this.xp.style.width = `${(p.level >= MAX_LEVEL ? 1 : fraction(p.xp, xpToNext(p.level))) * 100}%`;
    this.level.textContent = `Lv ${p.level} · ${p.level >= MAX_LEVEL ? '최고 경지' : `${p.xp} / ${xpToNext(p.level)}`}`;
    this.location.textContent = `연무 / 망자의 길\n던전 Lv ${state.dungeonLevel} · 처치 ${state.kills}`;
    this.toast.hidden = now >= this.toastUntil;
    this.slots.forEach((slot, i) => {
      const id = i === 0 ? 'slash' : p.slots[HOT_SLOTS[i - 1]!]; const def = id ? SKILLS[id] : null;
      const remaining = id ? Math.max(0, p.cooldowns[id] - state.tick) : 0;
      slot.glyph.textContent = id ? GLYPHS[id] : '◇'; slot.label.textContent = def?.name ?? '빈 슬롯';
      slot.root.classList.toggle('unavailable', !def || p.spirit < def.cost);
      slot.root.title = def ? `${def.name} · 기 ${def.cost} · 쿨 ${def.cooldown / HZ}초` : 'K에서 스킬 배치';
      slot.root.setAttribute('aria-label', `${i === 0 ? '좌클릭' : SLOT_KEYS[i - 1]} ${def?.name ?? '빈 슬롯'}`);
      slot.sweep.hidden = remaining === 0;
      slot.sweep.style.background = `conic-gradient(#02070cce ${fraction(remaining, (def?.cooldown ?? 0) * p.stats.cooldownMult) * 360}deg, transparent 0)`;
      slot.seconds.textContent = remaining ? (remaining / HZ).toFixed(1) : '';
    });
  }
}
