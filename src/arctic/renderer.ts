/**
 * 북극 사냥 식당 — 아이소메트릭 장면 렌더러.
 * 상태는 읽기만 한다. 손맛(날아가는 고기·돈·번쩍임·흔들림)은 전부 이벤트에서 만든다.
 */
import {
  BUILDS,
  BUILD_ORDER,
  COUNTER_BOX,
  FLOOR,
  GRILLS,
  HUNT_FIELD,
  MONEY_PAD,
  OFFICE_PAD,
  WORLD,
  type Vec,
} from './content.ts';
import { box, flat, flatOutline, project, shade, withAlpha, type Camera, type Ctx } from './iso.ts';
import {
  PALETTE,
  drawBear,
  drawCounter,
  drawGrill,
  drawIceRock,
  drawItem,
  drawMoney,
  drawPenguin,
  drawPerson,
  drawPine,
  drawShed,
  drawSign,
  drawStack,
  type Facing,
  type Item,
} from './models.ts';
import { grillBuilt, padVisible, salePrice, type WorldEvent, type WorldState } from './world.ts';

/** 날아가는 물건: 고기이거나(item), 확장 칸에 빨려 드는 동전(coin) */
interface Flight { item: Item | 'coin'; from: Vec; to: () => Vec; t: number }
interface Floater { x: number; y: number; z: number; text: string; color: string; size: number; life: number }
interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; color: string; size: number }
interface ScreenBill { x: number; y: number; tx: number; ty: number; t: number; delay: number }

const BEAR_MAX_HP = 3;
const DECOR: readonly { kind: 'pine' | 'rock'; x: number; y: number; s: number }[] = [
  { kind: 'pine', x: 0.4, y: 0.6, s: 1.1 }, { kind: 'pine', x: 11.4, y: 0.8, s: 1.2 }, { kind: 'pine', x: 0.5, y: 3.2, s: 0.9 },
  { kind: 'pine', x: 11.5, y: 4.2, s: 1 }, { kind: 'pine', x: 6.2, y: 0.3, s: 0.8 }, { kind: 'rock', x: 3.5, y: 6.6, s: 1 },
  { kind: 'rock', x: 9.6, y: 3, s: 0.8 }, { kind: 'pine', x: 11.4, y: 16.3, s: 1 }, { kind: 'pine', x: 0.4, y: 16.5, s: 0.9 },
  { kind: 'rock', x: 11.2, y: 13.8, s: 0.9 },
];

export interface ArcticRenderer {
  resize(width: number, height: number, dpr: number): void;
  draw(state: WorldState, events: readonly WorldEvent[], dt: number): void;
  /** 돈이 날아갈 HUD 좌표(캔버스 기준 CSS px) */
  setMoneyTarget(x: number, y: number): void;
  onMoneyArrive(callback: () => void): void;
  setGuide(target: Vec | null): void;
}

export function createRenderer(canvas: HTMLCanvasElement): ArcticRenderer {
  const found = canvas.getContext('2d');
  if (!found) throw new Error('arctic: 2D 컨텍스트를 만들 수 없습니다');
  const ctx: Ctx = found;
  const cam: Camera = { x: 5.5, y: 7, tile: 64, width: 1, height: 1 };
  let dpr = 1;
  let time = 0;
  let shake = 0;
  let lunge = 0;
  let playerWalk = 0;
  let facing: Facing = 'y';
  let guide: Vec | null = null;
  let moneyTarget = { x: 0, y: 0 };
  let arrive: () => void = () => {};
  let payCoinTimer = 0;
  const flights: Flight[] = [];
  const floaters: Floater[] = [];
  const particles: Particle[] = [];
  const bills: ScreenBill[] = [];
  const flashes = new Map<number, number>();
  const lastPos = new Map<number, Vec>();
  const walkPhase = new Map<number, number>();
  const headSign = new Map<number, number>();
  const snow = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() }));

  /* ── 이벤트 → 연출 ── */
  function burst(at: Vec, z: number, color: string, count: number, power: number): void {
    for (let i = 0; i < count && particles.length < 260; i++) {
      const a = Math.random() * Math.PI * 2;
      particles.push({ x: at.x, y: at.y, z, vx: Math.cos(a) * power, vy: Math.sin(a) * power, vz: 1.5 + Math.random() * 2.5, life: 0.7, color, size: 0.06 + Math.random() * 0.06 });
    }
  }

  function floater(at: Vec, z: number, text: string, color: string, size: number): void {
    if (floaters.length > 40) floaters.shift();
    floaters.push({ x: at.x, y: at.y, z, text, color, size, life: 1 });
  }

  function carrierPos(state: WorldState, to: 'player' | number): () => Vec {
    return () => {
      if (to === 'player') return state.player.pos;
      return state.workers.find((w) => w.id === to)?.pos ?? state.player.pos;
    };
  }

  function onEvent(state: WorldState, event: WorldEvent): void {
    switch (event.kind) {
      case 'hit': {
        flashes.set(event.bear, 1);
        if (event.by === 'player') lunge = 1;
        const bear = state.bears.find((b) => b.id === event.bear);
        if (bear) burst(bear.pos, 0.5, '#ffffff', 6, 1.5);
        shake = Math.max(shake, 3);
        break;
      }
      case 'bearDown':
        burst(event.at, 0.4, '#ffffff', 22, 2.5);
        floater(event.at, 1.2, '고기 GET!', '#ff7a7a', 20);
        break;
      case 'pickup':
        flights.push({ item: event.item, from: event.from, to: carrierPos(state, event.to), t: 0 });
        break;
      case 'drop': {
        const target = event.to;
        flights.push({ item: event.item, from: event.from, to: () => target, t: 0 });
        break;
      }
      case 'cooked': {
        const g = GRILLS[event.grill].box;
        burst({ x: g.x + 0.2, y: g.y }, 0.7, '#dfe6ee', 3, 0.4);
        break;
      }
      case 'sale':
        floater(event.at, 1.3, `+${event.amount}`, '#ffd84a', 22);
        break;
      case 'collect':
        spawnBills(Math.min(24, Math.max(4, Math.round(event.amount / salePrice(state)))));
        break;
      case 'pay':
        payCoinTimer -= 1;
        if (payCoinTimer <= 0) {
          payCoinTimer = 2;
          const pad = BUILDS[event.build].pad;
          flights.push({ item: 'coin', from: { ...state.player.pos }, to: () => pad, t: 0 });
        }
        break;
      case 'built': {
        const pad = BUILDS[event.build].pad;
        burst(pad, 0.3, '#ffd84a', 30, 3);
        burst(pad, 0.3, '#7fd7ff', 20, 3);
        floater(pad, 1.4, 'OPEN!', '#ffffff', 34);
        shake = Math.max(shake, 8);
        break;
      }
    }
  }

  function spawnBills(count: number): void {
    const from = project(cam, MONEY_PAD.x, MONEY_PAD.y, 0.3);
    for (let i = 0; i < count; i++) {
      bills.push({ x: from.x + (Math.random() - 0.5) * 30, y: from.y + (Math.random() - 0.5) * 20, tx: moneyTarget.x, ty: moneyTarget.y, t: 0, delay: i * 0.03 });
    }
  }

  /* ── 바닥 ── */
  function regionColor(tx: number, ty: number): string {
    const cx = tx + 0.5;
    const cy = ty + 0.5;
    const alt = (tx + ty) % 2 === 0;
    if (cx > FLOOR.x0 && cx < FLOOR.x1 && cy > FLOOR.y0 && cy < FLOOR.y1) return alt ? PALETTE.wood : shade(PALETTE.wood, 0.94);
    if (cx > HUNT_FIELD.x0 && cx < HUNT_FIELD.x1 && cy > HUNT_FIELD.y0 && cy < HUNT_FIELD.y1) return alt ? PALETTE.field : shade(PALETTE.field, 0.97);
    return alt ? PALETTE.snow : PALETTE.snowShade;
  }

  function drawGround(): void {
    const g = ctx.createLinearGradient(0, 0, 0, cam.height);
    g.addColorStop(0, '#5aa2cf');
    g.addColorStop(1, '#3f86b8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cam.width, cam.height);
    for (let i = 0; i < 14; i++) {
      const wx = ((i * 37) % 30) - 8 + Math.sin(time * 0.3 + i) * 0.3;
      const wy = ((i * 53) % 34) - 8;
      if (wx > WORLD.x0 - 1 && wx < WORLD.x1 + 1 && wy > WORLD.y0 - 1 && wy < WORLD.y1 + 1) continue;
      flat(ctx, cam, wx, wy, 0.9, 0.7, 'rgba(230,245,255,0.55)', -0.5);
    }
    // 얼음섬 두께 — 떠 있는 섬처럼 보이게
    box(ctx, cam, WORLD.x0, WORLD.y0, -0.6, WORLD.x1 - WORLD.x0, WORLD.y1 - WORLD.y0, 0.6, { color: PALETTE.ice });
    for (let tx = WORLD.x0; tx < WORLD.x1; tx++) {
      for (let ty = WORLD.y0; ty < WORLD.y1; ty++) flat(ctx, cam, tx, ty, 1, 1, regionColor(tx, ty));
    }
    flatOutline(ctx, cam, FLOOR.x0, FLOOR.y0, FLOOR.x1 - FLOOR.x0, FLOOR.y1 - FLOOR.y0, 'rgba(120,80,40,0.35)', 2);
  }

  /* ── 패드 ── */
  function drawPads(state: WorldState): void {
    for (const id of BUILD_ORDER) {
      if (!padVisible(state, id)) continue;
      const spec = BUILDS[id];
      const p = spec.pad;
      const ratio = state.paid[id] / spec.cost;
      const on = Math.hypot(state.player.pos.x - p.x, state.player.pos.y - p.y) < 0.75;
      flat(ctx, cam, p.x - 0.65, p.y - 0.65, 1.3, 1.3, on ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.45)');
      if (ratio > 0) flat(ctx, cam, p.x - 0.65, p.y - 0.65, 1.3 * ratio, 1.3, 'rgba(80,170,255,0.55)');
      flatOutline(ctx, cam, p.x - 0.65, p.y - 0.65, 1.3, 1.3, on ? '#2f8fff' : 'rgba(40,90,150,0.8)', 3, [8, 6]);
    }
  }

  function drawPadLabels(state: WorldState): void {
    for (const id of BUILD_ORDER) {
      if (!padVisible(state, id)) continue;
      const spec = BUILDS[id];
      const p = project(cam, spec.pad.x, spec.pad.y, 0.2);
      const remain = Math.ceil(spec.cost - state.paid[id]);
      label(p.x, p.y - cam.tile * 0.1, spec.name, `💰 ${remain}`);
    }
  }

  function label(x: number, y: number, title: string, sub: string): void {
    const s = cam.tile / 64;
    ctx.font = `700 ${Math.round(12 * s)}px "Jua", sans-serif`;
    const w = Math.max(ctx.measureText(title).width, 50 * s) + 16 * s;
    ctx.fillStyle = 'rgba(20,40,70,0.78)';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 34 * s, w, 32 * s, 8 * s);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(title, x, y - 25 * s);
    ctx.fillStyle = '#ffd84a';
    ctx.font = `800 ${Math.round(13 * s)}px "Jua", sans-serif`;
    ctx.fillText(sub, x, y - 11 * s);
  }

  /* ── 물체(깊이 정렬) ── */
  function motion(id: number, pos: Vec, dt: number): { walking: boolean; dx: number; dy: number } {
    const prev = lastPos.get(id) ?? pos;
    const dx = pos.x - prev.x;
    const dy = pos.y - prev.y;
    lastPos.set(id, { x: pos.x, y: pos.y });
    const walking = Math.hypot(dx, dy) > 0.001;
    walkPhase.set(id, walking ? (walkPhase.get(id) ?? 0) + dt : 0);
    return { walking, dx, dy };
  }

  function collect(state: WorldState, dt: number): { key: number; draw: () => void }[] {
    const list: { key: number; draw: () => void }[] = [];
    const add = (x: number, y: number, draw: () => void): void => {
      list.push({ key: x + y, draw });
    };
    for (const d of DECOR) add(d.x, d.y, () => (d.kind === 'pine' ? drawPine(ctx, cam, d.x, d.y, d.s) : drawIceRock(ctx, cam, d.x, d.y, d.s)));
    GRILLS.forEach((g, i) => {
      if (!grillBuilt(state, i)) return;
      const grill = state.grills[i];
      add(g.box.x, g.box.y, () => drawGrill(ctx, cam, g.box.x, g.box.y, grill.input, grill.output, time, grill.input > 0));
    });
    const registers = state.built.has('register') ? 2 : 1;
    add(COUNTER_BOX.x, COUNTER_BOX.y, () => drawCounter(ctx, cam, COUNTER_BOX.x, COUNTER_BOX.y, state.stock, registers));
    const billsCount = Math.ceil(state.pile / Math.max(1, salePrice(state)));
    if (billsCount > 0) add(MONEY_PAD.x, MONEY_PAD.y, () => drawMoney(ctx, cam, MONEY_PAD.x, MONEY_PAD.y, billsCount));
    if (state.built.has('office')) add(OFFICE_PAD.x + 0.9, OFFICE_PAD.y - 0.9, () => drawShed(ctx, cam, OFFICE_PAD.x + 0.9, OFFICE_PAD.y - 0.9));
    if (padVisible(state, 'fishing')) add(BUILDS.fishing.pad.x + 0.6, BUILDS.fishing.pad.y - 0.6, () => drawSign(ctx, cam, BUILDS.fishing.pad.x + 0.6, BUILDS.fishing.pad.y - 0.6));
    collectActors(state, dt, add);
    return list;
  }

  function collectActors(state: WorldState, dt: number, add: (x: number, y: number, draw: () => void) => void): void {
    for (const bear of state.bears) {
      if (bear.hp <= 0) continue;
      const m = motion(bear.id, bear.pos, dt);
      if (Math.abs(m.dx) > 0.002) headSign.set(bear.id, m.dx > 0 ? 1 : -1);
      const flash = flashes.get(bear.id) ?? 0;
      add(bear.pos.x, bear.pos.y, () => drawBear(ctx, cam, bear.pos.x, bear.pos.y, headSign.get(bear.id) ?? 1, walkPhase.get(bear.id) ?? 0, flash, bear.hp, BEAR_MAX_HP));
    }
    for (const meat of state.meats) add(meat.pos.x, meat.pos.y, () => drawItem(ctx, cam, meat.pos.x, meat.pos.y, 0.05 + Math.abs(Math.sin(time * 4 + meat.id)) * 0.08, 'raw'));
    // 줄 선 손님이 전부 말풍선을 띄우면 세로로 겹친다 — 지금 주문 중인 맨 앞 손님만
    const head = state.customers.find((c) => !c.leaving);
    for (const c of state.customers) {
      motion(c.id, c.pos, dt);
      const want = c === head ? c.want - c.got : null;
      add(c.pos.x, c.pos.y, () => drawPenguin(ctx, cam, c.pos.x, c.pos.y, walkPhase.get(c.id) ?? 0, want));
    }
    for (const w of state.workers) {
      const m = motion(w.id, w.pos, dt);
      const face: Facing = Math.abs(m.dx) > Math.abs(m.dy) ? 'x' : 'y';
      const coat = w.role === 'carrier' ? '#4fbf8a' : '#9b6a3c';
      const hat = w.role === 'carrier' ? '#2e8a5f' : '#ff9f2e';
      add(w.pos.x, w.pos.y, () => {
        drawPerson(ctx, cam, w.pos.x, w.pos.y, { coat, hat, facing: face, walk: walkPhase.get(w.id) ?? 0, lunge: 0 });
        if (w.kind) drawStack(ctx, cam, w.pos.x, w.pos.y, w.kind, w.count, face, m.walking ? Math.sin(time * 10) : 0);
      });
    }
    const p = state.player;
    if (Math.abs(p.dir.x) + Math.abs(p.dir.y) > 0.05) facing = Math.abs(p.dir.x) > Math.abs(p.dir.y) ? 'x' : 'y';
    const walking = Math.hypot(p.dir.x, p.dir.y) > 0.05;
    playerWalk = walking ? playerWalk + dt : 0;
    add(p.pos.x, p.pos.y, () => {
      drawPerson(ctx, cam, p.pos.x, p.pos.y, { coat: '#3f7bea', hat: '#e84a5f', facing, walk: playerWalk, lunge });
      if (p.kind) drawStack(ctx, cam, p.pos.x, p.pos.y, p.kind, p.count, facing, walking ? Math.sin(time * 10) : 0);
    });
  }

  /* ── 효과 ── */
  function drawFlights(dt: number): void {
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      f.t += dt / 0.25;
      if (f.t >= 1) {
        flights.splice(i, 1);
        continue;
      }
      const to = f.to();
      const x = f.from.x + (to.x - f.from.x) * f.t;
      const y = f.from.y + (to.y - f.from.y) * f.t;
      const z = 0.4 + Math.sin(f.t * Math.PI) * 0.9;
      if (f.item === 'coin') {
        const s = project(cam, x, y, z);
        coin(s.x, s.y, cam.tile * 0.1);
      } else drawItem(ctx, cam, x, y, z, f.item);
    }
  }

  function coin(x: number, y: number, r: number): void {
    ctx.fillStyle = '#f5b400';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe680';
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.55, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParticles(dt: number): void {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vz -= 9 * dt;
      p.z = Math.max(0, p.z + p.vz * dt);
      const s = project(cam, p.x, p.y, p.z);
      const size = p.size * cam.tile;
      ctx.globalAlpha = Math.min(1, p.life / 0.3);
      ctx.fillStyle = p.color;
      ctx.fillRect(s.x - size / 2, s.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters(dt: number): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= dt;
      if (f.life <= 0) {
        floaters.splice(i, 1);
        continue;
      }
      f.z += dt * 1.2;
      const s = project(cam, f.x, f.y, f.z);
      const pop = f.life > 0.85 ? 1 + (f.life - 0.85) * 3 : 1;
      const size = Math.round(f.size * pop * (cam.tile / 64));
      ctx.globalAlpha = Math.min(1, f.life / 0.3);
      ctx.font = `800 ${size}px "Jua", sans-serif`;
      ctx.strokeStyle = 'rgba(20,30,60,0.85)';
      ctx.lineWidth = Math.max(3, size * 0.18);
      ctx.strokeText(f.text, s.x, s.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawBills(dt: number): void {
    for (let i = bills.length - 1; i >= 0; i--) {
      const b = bills[i];
      if (b.delay > 0) {
        b.delay -= dt;
        continue;
      }
      b.t += dt * 1.8;
      if (b.t >= 1) {
        bills.splice(i, 1);
        arrive();
        continue;
      }
      const t = b.t * b.t;
      const x = b.x + (b.tx - b.x) * t;
      const y = b.y + (b.ty - b.y) * t - Math.sin(b.t * Math.PI) * 60;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(b.t * 6);
      ctx.fillStyle = PALETTE.money;
      ctx.fillRect(-9, -5, 18, 10);
      ctx.fillStyle = '#2e8a45';
      ctx.fillRect(-3, -5, 6, 10);
      ctx.restore();
    }
  }

  function drawGuide(): void {
    if (!guide) return;
    const bounce = Math.abs(Math.sin(time * 4)) * 0.3;
    const s = project(cam, guide.x, guide.y, 1.4 + bounce);
    const margin = 36;
    const inside = s.x > margin && s.x < cam.width - margin && s.y > margin && s.y < cam.height - margin;
    const r = cam.tile * 0.22;
    if (inside) {
      const ground = project(cam, guide.x, guide.y, 0);
      ctx.strokeStyle = withAlpha('#ffd84a', 0.8);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y, cam.tile * 0.45, cam.tile * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
      chevron(s.x, s.y, r, Math.PI / 2);
      return;
    }
    // 화면 밖이면 가장자리에서 방향을 가리킨다
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    const angle = Math.atan2(s.y - cy, s.x - cx);
    const ex = Math.min(cam.width - margin, Math.max(margin, cx + Math.cos(angle) * cam.width));
    const ey = Math.min(cam.height - margin, Math.max(margin, cy + Math.sin(angle) * cam.height));
    chevron(ex, ey, r * 1.2, angle);
  }

  function chevron(x: number, y: number, r: number, angle: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#ffd84a';
    ctx.strokeStyle = '#7a4f00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(r * 1.2, 0);
    ctx.lineTo(-r * 0.6, -r);
    ctx.lineTo(-r * 0.2, 0);
    ctx.lineTo(-r * 0.6, r);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  function drawSnow(dt: number): void {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const f of snow) {
      f.y += dt * 0.04 * f.s;
      f.x += Math.sin(time + f.s * 10) * dt * 0.01;
      if (f.y > 1) f.y -= 1;
      ctx.beginPath();
      ctx.arc(((f.x % 1) + 1) % 1 * cam.width, f.y * cam.height, 1.5 * f.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function updateCamera(state: WorldState, dt: number): void {
    const follow = 1 - Math.exp(-dt * 6);
    cam.x += (state.player.pos.x - cam.x) * follow;
    cam.y += (state.player.pos.y - cam.y) * follow;
    time += dt;
    lunge = Math.max(0, lunge - dt * 6);
    shake = Math.max(0, shake - dt * 30);
    for (const [id, v] of flashes) {
      if (v - dt * 6 <= 0) flashes.delete(id);
      else flashes.set(id, v - dt * 6);
    }
  }

  return {
    resize(width, height, ratio) {
      cam.width = Math.max(1, width);
      cam.height = Math.max(1, height);
      cam.tile = Math.max(44, Math.min(110, Math.min(width / 6, height / 8)));
      dpr = Math.min(2, Math.max(1, ratio));
      canvas.width = Math.round(cam.width * dpr);
      canvas.height = Math.round(cam.height * dpr);
    },
    draw(state, events, dt) {
      for (const event of events) onEvent(state, event);
      updateCamera(state, dt);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      drawGround();
      drawPads(state);
      const list = collect(state, dt);
      list.sort((a, b) => a.key - b.key);
      for (const item of list) item.draw();
      drawFlights(dt);
      drawParticles(dt);
      drawPadLabels(state);
      drawFloaters(dt);
      drawGuide();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSnow(dt);
      drawBills(dt);
    },
    setMoneyTarget(x, y) {
      moneyTarget = { x, y };
    },
    onMoneyArrive(callback) {
      arrive = callback;
    },
    setGuide(target) {
      guide = target;
    },
  };
}
