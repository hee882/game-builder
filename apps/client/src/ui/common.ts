import type { Command, HotSlot, SkillId } from '@yeonmu/sim';
export interface UiActions {
  command: (command: Command) => void;
  cast: (slot: HotSlot | 'lmb') => void;
  pickup: (id: number) => void;
  inventory: () => void;
  skills: () => void;
  reenter: () => void;
}
export const SLOT_KEYS = ['우클릭', '1', '2', '3', '4'] as const;
export const GLYPHS: Record<SkillId, string> = { slash: '斬', spin: '旋', dash: '疾', talisman: '炎', cleave: '魂', ward: '結' };
export function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.className = className; element.textContent = text; return element;
}
export function button(text: string, action: () => void, className = ''): HTMLButtonElement {
  const element = node('button', className, text); element.type = 'button';
  element.addEventListener('pointerup', e => { if (e.button === 0) { e.preventDefault(); action(); } });
  element.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) action(); }
  });
  return element;
}
export function panel(title: string, close: () => void): HTMLElement {
  const root = node('section', 'ui-panel'); root.hidden = true; root.setAttribute('aria-label', title);
  const header = node('header'); header.append(node('h2', '', title), button('닫기 ×', close)); root.append(header);
  document.body.append(root); return root;
}
export function fraction(value: number, max: number): number { return Math.max(0, Math.min(1, max > 0 ? value / max : 0)); }
