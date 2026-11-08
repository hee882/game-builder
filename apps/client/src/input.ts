import * as THREE from 'three';
import { EMPTY_INPUT, isFloor } from '@yeonmu/sim';
import type { Command, HotSlot, TickInput, Vec, World } from '@yeonmu/sim';
import type { Actors } from './render/actors';
import type { Pickups } from './render/pickups';
import type { GameScene } from './render/scene';

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
  private press = { x: 0, y: 0 };
  private dragging = false;
  private commands: Command[] = [];
  private casts: NonNullable<TickInput['cast']>[] = [];
  private portalTarget = false;
  private abort = new AbortController();
  aim: Aim = { at: null, enemy: null, item: null, portal: false };

  constructor(private view: GameScene, private world: () => World, private actors: () => Actors, private pickups: () => Pickups,
    private inventory: () => void, private reenter: () => void) {
    const canvas = view.canvas; const options = { signal: this.abort.signal };
    canvas.addEventListener('pointermove', e => {
      this.point(e.clientX, e.clientY);
      if (this.left && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 6) this.dragging = true;
    }, options);
    canvas.addEventListener('pointerdown', e => {
      this.point(e.clientX, e.clientY); this.updateAim();
      if (e.button === 0) {
        this.left = true; this.clicked = { ...this.aim }; this.dragging = false;
        this.press = { x: e.clientX, y: e.clientY }; this.portalTarget = this.aim.portal;
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

  updateAim(): void {
    this.ray.setFromCamera(this.pointer, this.view.camera);
    const point = this.ray.ray.intersectPlane(this.plane, this.intersection);
    const at = point ? { x: point.x, z: point.z } : null;
    this.aim = { at, enemy: null, item: null, portal: false };
    for (const hit of this.ray.intersectObjects(this.actors().pickables, false)) {
      const id = this.actors().enemyAt(hit);
      if (id !== null) { this.aim.enemy = id; break; }
    }
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

  build(): TickInput {
    this.updateAim();
    const input: TickInput = { ...EMPTY_INPUT, commands: this.commands.splice(0), standStill: this.keys.has('shift'), cast: this.casts.shift() ?? null };
    const selected = this.clicked ?? (this.left && this.dragging ? this.aim : null);
    if (selected) {
      if (input.standStill && selected.at) input.cast = { slot: 'lmb', at: selected.at };
      else if (selected.enemy !== null) { input.attack = selected.enemy; this.portalTarget = false; }
      else if (selected.item !== null) { input.pickup = selected.item; this.portalTarget = false; }
      else if (selected.portal && this.world().state.portal) input.moveTo = this.world().state.portal;
      else if (selected.at && isFloor(this.world().dungeon, selected.at.x, selected.at.z)) input.moveTo = selected.at;
    } else if (this.left && input.standStill && this.aim.at) input.cast = { slot: 'lmb', at: this.aim.at };
    this.clicked = null;
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

  afterFrame(): void {
    const { player, portal } = this.world().state;
    if (this.portalTarget && portal && Math.hypot(player.x - portal.x, player.z - portal.z) < 1.8) { this.portalTarget = false; this.reenter(); }
  }
  clear(): void { this.keys.clear(); this.left = false; this.right = false; this.clicked = null; this.casts.length = 0; this.commands.length = 0; this.portalTarget = false; }
  dispose(): void { this.abort.abort(); }
}
