import { ELITE_NAMES, ENEMIES } from '@yeonmu/sim';
import type { RunState, Vec } from '@yeonmu/sim';
import { button, fraction, node } from './common';
interface Plate { root: HTMLElement; name: HTMLElement; fill: HTMLElement; id: number }
export class Nameplates {
  private root = node('div', 'nameplates');
  // 15 world plates + one boss plate; pool never grows with mob count.
  private plates: Plate[] = Array.from({ length: 15 }, () => this.makePlate());
  private boss = this.makePlate('boss-plate');
  private loot: { root: HTMLButtonElement; id: number }[] = [];
  private alt = false;
  constructor(private project: (at: Vec, y?: number) => Vec2, private pickup: (id: number) => void) {
    this.root.append(...this.plates.map(p => p.root), this.boss.root); document.body.append(this.root);
    for (let i = 0; i < 30; i++) {
      const label = { root: button('', () => this.pickup(label.id), 'loot-label'), id: -1 };
      label.root.hidden = true; this.loot.push(label); this.root.append(label.root);
    }
    window.addEventListener('keydown', e => { if (e.key === 'Alt') { e.preventDefault(); this.alt = true; } });
    window.addEventListener('keyup', e => { if (e.key === 'Alt') this.alt = false; });
    window.addEventListener('blur', () => this.alt = false);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.alt = false; });
  }
  private makePlate(className = 'enemy-plate'): Plate {
    const root = node('div', className), name = node('span'), track = node('div', 'health-track'), fill = node('div', 'health-fill');
    root.hidden = true; track.append(fill); root.append(name, track); return { root, name, fill, id: -1 };
  }
  update(state: RunState, hovered: number | null): void {
    const visible = state.enemies.filter(e => !e.boss && (e.elite || e.id === hovered) && this.onScreen(this.project(e, 2.3)));
    visible.sort((a, b) => Number(b.id === hovered) - Number(a.id === hovered) || Math.hypot(a.x - state.player.x, a.z - state.player.z) - Math.hypot(b.x - state.player.x, b.z - state.player.z));
    this.plates.forEach((plate, i) => {
      const enemy = visible[i]; plate.id = enemy?.id ?? -1; plate.root.hidden = !enemy;
      if (!enemy) return;
      plate.name.textContent = enemy.elite ? `${ELITE_NAMES[enemy.elite]} ${ENEMIES[enemy.kind].name}` : '';
      plate.root.classList.toggle('elite', !!enemy.elite); plate.fill.style.width = `${fraction(enemy.hp, enemy.maxHp) * 100}%`;
    });
    const boss = state.enemies.find(e => e.boss && Math.hypot(e.x - state.player.x, e.z - state.player.z) < 22);
    this.boss.root.hidden = !boss; this.boss.id = boss?.id ?? -1;
    if (boss) { this.boss.name.textContent = `${ENEMIES[boss.kind].name} · ${Math.ceil(boss.hp)} / ${boss.maxHp}`; this.boss.fill.style.width = `${fraction(boss.hp, boss.maxHp) * 100}%`; }
    const items = this.alt ? state.items.filter(item => this.onScreen(this.project(item, 0.6))).sort((a, b) => Math.hypot(a.x - state.player.x, a.z - state.player.z) - Math.hypot(b.x - state.player.x, b.z - state.player.z)).slice(0, 30) : [];
    this.loot.forEach((label, i) => {
      const item = items[i]; label.id = item?.id ?? -1; label.root.hidden = !item;
      if (item) { label.root.textContent = item.item.name; label.root.className = `loot-label ${item.item.rarity}`; }
    });
  }
  // Per-frame updates only reposition existing nodes; content/health update at 10 Hz.
  position(state: RunState): void {
    for (const plate of this.plates) {
      if (plate.root.hidden) continue; const enemy = state.enemies.find(e => e.id === plate.id);
      if (!enemy) { plate.root.hidden = true; continue; }
      const point = this.project(enemy, 2.3); plate.root.style.transform = `translate(${point.x}px,${point.y}px) translate(-50%,-100%)`;
    }
    const occupied: Vec2[] = [];
    for (const label of this.loot) {
      if (!this.alt) { label.root.hidden = true; continue; }
      if (label.root.hidden) continue; const item = state.items.find(item => item.id === label.id);
      if (!item) { label.root.hidden = true; continue; }
      const point = this.project(item, 0.6);
      while (occupied.some(other => Math.abs(point.x - other.x) < 170 && Math.abs(point.y - other.y) < 44)) point.y -= 44;
      occupied.push(point); label.root.style.transform = `translate(${point.x}px,${point.y}px) translate(-50%,-100%)`;
    }
  }
  private onScreen(point: Vec2): boolean { return point.x > 0 && point.x < innerWidth && point.y > 0 && point.y < innerHeight; }
}
interface Vec2 { x: number; y: number }
