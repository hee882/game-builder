import * as THREE from 'three';
import { EMPTY_INPUT, isFloor } from '@yeonmu/sim';
import type { Command, HotSlot, TickInput, Vec, World } from '@yeonmu/sim';
import type { Actors } from './render/actors';
import type { Pickups } from './render/pickups';
import type { GameScene } from './render/scene';

const ENEMY_PICK_PX = 42;

export interface Aim { at: Vec | null; enemy: number | null; item: number | null; portal: boolean }

export class InputController {
  private keys = new Set<string>();
  private pointer = new THREE.Vector2();
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private intersection = new THREE.Vector3();
  private left = false;
  private right = false;
  private clicked: Aim | null = null;
  private commands: Command[] = [];
  private casts: NonNullable<TickInput['cast']>[] = [];
  private portalTarget = false;
  private pickupQueue: number | null = null;
  private abort = new AbortController();
  aim: Aim = { at: null, enemy: null, item: null, portal: false };

  constructor(private view: GameScene, private world: () => World, private actors: () => Actors, private pickups: () => Pickups,
    private inventory: () => void, private reenter: () => void) {
    const canvas = view.canvas; const options = { signal: this.abort.signal };
    canvas.addEventListener('pointermove', e => {
      this.point(e.clientX, e.clientY);
    }, options);
    canvas.addEventListener('pointerdown', e => {
      if (e.isTrusted) canvas.setPointerCapture(e.pointerId);
      this.point(e.clientX, e.clientY); this.updateAim();
      if (e.button === 0) {
        this.left = true; this.clicked = { ...this.aim }; this.portalTarget = this.aim.portal;
      }
      if (e.button === 2) { this.right = true; this.queueCast('rmb'); }
    }, options);
    window.addEventListener('pointerup', e => { if (e.button === 0) this.left = false; if (e.button === 2) this.right = false; }, options);
    canvas.addEventListener('pointercancel', () => this.clear(), options);
    canvas.addEventListener('contextmenu', e => e.preventDefault(), options);
    canvas.addEventListener('wheel', e => { e.preventDefault(); view.zoom(e.deltaY); }, { ...options, passive: false });
    window.addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      this.keys.add(e.key.toLowerCase());
      if (!e.repeat && e.key.toLowerCase() === 'i') this.inventory();
      if (!e.repeat && e.key.toLowerCase() === 'r' && this.world().state.status === 'dead') this.reenter();
      const slot = ({ '1': 's1', '2': 's2', '3': 's3', '4': 's4' } as const)[e.key as '1'];
      if (slot && !e.repeat) this.queueCast(slot);
    }, options);
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()), options);
    window.addEventListener('blur', () => this.clear(), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); }, options);
  }

  private point(x: number, y: number): void {
    const rect = this.view.canvas.getBoundingClientRect();
    this.pointer.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
  }
  private queueCast(slot: HotSlot): void { this.updateAim(); if (this.aim.at && this.casts.length < 8) this.casts.push({ slot, at: { ...this.aim.at } }); }
  command(command: Command): void { this.commands.push(command); }
  /** UI(바닥 이름표 등)에서 줍기 요청. 다음 틱 입력으로 전달된다. */
  pickup(id: number): void { this.pickupQueue = id; }
  /** UI 버튼에서 슬롯 시전. 현재 커서 지점을 겨눈다. */
  cast(slot: HotSlot | 'lmb'): void {
    this.updateAim(); if (!this.aim.at || this.casts.length >= 8) return;
    this.casts.push({ slot, at: { ...this.aim.at } });
  }

  updateAim(): void {
    this.ray.setFromCamera(this.pointer, this.view.camera);
    const point = this.ray.ray.intersectPlane(this.plane, this.intersection);
    const at = point ? { x: point.x, z: point.z } : null;
    this.aim = { at, enemy: null, item: null, portal: false };
    for (const hit of this.ray.intersectObjects(this.actors().pickables, false)) {
      const id = this.actors().enemyAt(hit);
      if (id !== null) { this.aim.enemy = id; break; }
    }
    if (this.aim.enemy === null) this.aim.enemy = this.nearestOnScreen();
    for (const hit of this.ray.intersectObjects(this.pickups().pickables, false)) {
      const item = this.pickups().itemAt(hit);
      if (item === 'portal') this.aim.portal = true;
      else if (item !== null) this.aim.item = item;
      if (item !== null) break;
    }
    const portal = this.world().state.portal;
    if (at && portal && Math.hypot(at.x - portal.x, at.z - portal.z) < 1.2) this.aim.portal = true;
    this.view.canvas.style.cursor = this.aim.enemy !== null ? 'crosshair' : this.aim.item !== null || this.aim.portal ? 'pointer' : 'default';
  }

  /** 몹이 작아 레이캐스트가 자주 빗나가므로, 커서 주변 화면 반경 안의 가장 가까운 적을 잡는다. */
  private nearestOnScreen(): number | null {
    const rect = this.view.canvas.getBoundingClientRect();
    const px = (this.pointer.x + 1) / 2 * rect.width + rect.left; const py = (1 - this.pointer.y) / 2 * rect.height + rect.top;
    let best: number | null = null; let bestD = ENEMY_PICK_PX;
    for (const enemy of this.world().state.enemies) {
      if (enemy.hp <= 0) continue;
      const s = this.view.project(enemy, enemy.boss ? 1.6 : 0.7);
      const d = Math.hypot(s.x - px, s.y - py) - (enemy.boss ? 40 : 0);
      if (d < bestD) { bestD = d; best = enemy.id; }
    }
    return best;
  }

  build(): TickInput {
    this.updateAim();
    const input: TickInput = { ...EMPTY_INPUT, commands: this.commands.splice(0), standStill: this.keys.has('shift'), cast: this.casts.shift() ?? null };
    const selected = this.clicked ?? (this.left ? this.holdTarget() : null);
    if (selected) {
      if (input.standStill && selected.at) input.cast = { slot: 'lmb', at: selected.at };
      else if (selected.enemy !== null) { input.attack = selected.enemy; this.portalTarget = false; }
      else if (selected.item !== null) { input.pickup = selected.item; this.portalTarget = false; }
      else if (selected.portal && this.world().state.portal) input.moveTo = this.world().state.portal;
      else if (selected.at && isFloor(this.world().dungeon, selected.at.x, selected.at.z)) input.moveTo = selected.at;
    } else if (this.left && input.standStill && this.aim.at) input.cast = { slot: 'lmb', at: this.aim.at };
    this.clicked = null;
    if (this.pickupQueue !== null) { input.pickup = this.pickupQueue; input.attack = null; input.moveTo = null; this.pickupQueue = null; }
    if (!input.cast && this.aim.at) {
      if (this.right) input.cast = { slot: 'rmb', at: this.aim.at };
      for (const [key, slot] of [['1', 's1'], ['2', 's2'], ['3', 's3'], ['4', 's4']] as const)
        if (this.keys.has(key)) input.cast = { slot, at: this.aim.at };
    }
    if (input.standStill && (this.left || input.cast)) {
      const p = this.world().state.player; input.moveTo = { x: p.x, z: p.z };
    }
    return input;
  }

  /**
   * 누르고 있는 동안: 커서 아래 적이 있으면 그 적을 공격하고, 공격 중인 적이 살아 있으면 계속 때리고,
   * 그 외에는 커서 쪽으로 계속 걷는다. 적이 죽으면 다음 적으로 자연스럽게 넘어간다.
   */
  private holdTarget(): Aim | null {
    if (this.aim.enemy !== null) return { ...this.aim, item: null, portal: false };
    const { player, enemies } = this.world().state;
    if (player.order.kind === 'attack') {
      const id = player.order.enemy;
      if (enemies.some(e => e.id === id && e.hp > 0)) return null;
    }
    if (player.order.kind === 'pickup') return null;
    return { at: this.aim.at, enemy: null, item: null, portal: false };
  }

  afterFrame(): void {
    const { player, portal } = this.world().state;
    if (this.portalTarget && portal && Math.hypot(player.x - portal.x, player.z - portal.z) < 1.8) { this.portalTarget = false; this.reenter(); }
  }
  clear(): void { this.keys.clear(); this.left = false; this.right = false; this.clicked = null; this.casts.length = 0; this.commands.length = 0; this.pickupQueue = null; this.portalTarget = false; }
  dispose(): void { this.abort.abort(); }
}
