import type { RunState, SimEvent } from '@yeonmu/sim';
import { button, node } from './common';
export class Screens {
  private death = node('div', 'death-screen');
  private portal = node('div', 'portal-notice', '귀환 문이 열렸다 · 푸른 문을 클릭하여 귀환');
  private summary = node('div', 'run-summary');
  private pickups = new Set<number>();
  private summaryUntil = 0;
  constructor(reenter: () => void) {
    this.death.hidden = true; this.portal.hidden = true; this.summary.hidden = true;
    const box = node('section'); box.append(node('h1', '', '쓰러졌습니다'), node('p', '', '장비와 경지는 보존됩니다'), button('다시 진입 · R', reenter));
    this.death.append(box); this.summary.setAttribute('role', 'status'); document.body.append(this.death, this.portal, this.summary);
  }
  events(events: readonly SimEvent[]): void { for (const event of events) if (event.type === 'pickup') this.pickups.add(event.item); }
  leave(state: RunState): void {
    if (state.portal && state.status !== 'dead') {
      this.summary.textContent = `귀환 완료\n처치 ${state.kills} · 획득 아이템 ${this.pickups.size} · Lv ${state.player.level}\n새로운 망자의 길에 진입했습니다`;
      this.summaryUntil = performance.now() + 6500;
    }
    this.pickups.clear();
  }
  update(state: RunState, now: number): void {
    this.death.hidden = state.status !== 'dead'; this.portal.hidden = !state.portal || state.status === 'dead';
    this.summary.hidden = now >= this.summaryUntil;
  }
}
