/**
 * 꼬마 용사 키우기 — 월드 렌더러(Canvas 2D).
 * 상태는 읽기만 한다. 손맛(데미지 숫자·코인·흔들림·번쩍임)은 전부 이벤트에서 만든다.
 */
import { WEAPONS } from './content.ts';
import { formatBig } from './format.ts';
import { isUnlocked, weaponTier, zoneOf, type GameEvent, type GameState } from './logic.ts';
import { drawFairy, drawHero, drawMonster, hexAlpha, type HeroLook } from './sprites.ts';

interface Floater { x: number; y: number; vy: number; life: number; max: number; text: string; color: string; size: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; r: number }
interface Coin { x0: number; y0: number; t: number; delay: number }

const MAX_FLOATERS = 40;
const MAX_PARTICLES = 220;
const MAX_COINS = 40;
const SWING_SECONDS = 0.18;

export interface IdleRenderer {
  resize(width: number, height: number, dpr: number): void;
  draw(state: GameState, events: readonly GameEvent[], dt: number): void;
  /** 코인이 날아갈 화면 좌표(골드 표시 위치). 캔버스 기준 CSS px */
  setCoinTarget(x: number, y: number): void;
  setReducedMotion(value: boolean): void;
  /** 방치 보상을 받을 때 화면 위에서 코인이 쏟아진다 */
  coinRain(count: number): void;
}

export function createRenderer(canvas: HTMLCanvasElement): IdleRenderer {
  const found = canvas.getContext('2d');
  if (!found) throw new Error('idle: 2D 컨텍스트를 만들 수 없습니다');
  const ctx: CanvasRenderingContext2D = found;
  let width = 1;
  let height = 1;
  let dpr = 1;
  let reduced = false;
  let time = 0;
  let scroll = 0;
  let walk = 0;
  let swing = 0;
  let flash = 0;
  let knock = 0;
  let shake = 0;
  let skillFlash = 0;
  let evolveRing = 0;
  let bossPulse = 0;
  let enterT = 1;
  let lastEnemy: object | null = null;
  let coinTarget = { x: 24, y: -20 };
  const floaters: Floater[] = [];
  const particles: Particle[] = [];
  const coins: Coin[] = [];

  const scale = (): number => Math.min(width / 250, height / 240);
  const groundY = (): number => height * 0.8;
  const heroX = (): number => width * 0.27;
  const enemyX = (): number => width * 0.7;

  function floater(text: string, x: number, y: number, color: string, size: number): void {
    if (floaters.length >= MAX_FLOATERS) floaters.shift();
    floaters.push({ x, y, vy: -60, life: 0.9, max: 0.9, text, color, size });
  }

  function burst(x: number, y: number, color: string, count: number, speed: number): void {
    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, life: 0.6, max: 0.6, color, r: 2 + Math.random() * 3 });
    }
  }

  function onEvent(event: GameEvent, state: GameState): void {
    const s = scale();
    const ex = enemyX();
    const ey = groundY() - 30 * s;
    switch (event.kind) {
      case 'hit': {
        if (event.source === 'hero') swing = SWING_SECONDS;
        flash = 1;
        knock = event.source === 'companion' ? 0.3 : 1;
        const jitter = (Math.random() - 0.5) * 40 * s;
        if (event.source === 'skill') floater(`${formatBig(event.damage)}!!`, ex, ey - 40 * s, '#fff27a', 34 * s);
        else if (event.crit) floater(`치명타 ${formatBig(event.damage)}`, ex + jitter, ey - 20 * s, '#ffd84a', 24 * s);
        else if (event.source === 'companion') floater(formatBig(event.damage), ex + jitter, ey, '#7ff5c8', 15 * s);
        else if (event.source === 'tap') floater(formatBig(event.damage), ex + jitter, ey, '#9fe8ff', 15 * s);
        else floater(formatBig(event.damage), ex + jitter, ey - 10 * s, '#ffffff', 18 * s);
        if (event.crit) shake = Math.max(shake, 4);
        burst(ex - 10 * s, ey, '#ffffff', event.crit ? 8 : 3, 120 * s);
        break;
      }
      case 'kill': {
        burst(ex, ey, zoneOf(state.stage - (event.boss ? 1 : 0)).body, event.boss ? 40 : 16, 220 * s);
        floater(`+${formatBig(event.gold)}`, ex, ey - 50 * s, '#ffd84a', (event.boss ? 26 : 17) * s);
        const count = event.boss ? 14 : 5;
        for (let i = 0; i < count && coins.length < MAX_COINS; i++) {
          coins.push({ x0: ex + (Math.random() - 0.5) * 40 * s, y0: ey + (Math.random() - 0.5) * 30 * s, t: 0, delay: i * 0.03 });
        }
        if (event.boss) shake = Math.max(shake, 12);
        break;
      }
      case 'skill':
        skillFlash = 1;
        shake = Math.max(shake, 10);
        break;
      case 'bossStart':
        bossPulse = 1;
        shake = Math.max(shake, 5);
        break;
      case 'evolve':
        evolveRing = 1;
        burst(heroX(), groundY() - 40 * s, '#ffd84a', 40, 260 * s);
        break;
      case 'rebirth':
        evolveRing = 1;
        skillFlash = 0.8;
        break;
      default:
        break;
    }
  }

  function drawBackground(state: GameState): void {
    const zone = zoneOf(state.stage);
    const g = ctx.createLinearGradient(0, 0, 0, groundY());
    g.addColorStop(0, zone.sky[0]);
    g.addColorStop(1, zone.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    hills(zone.hill, 0.25, height * 0.55, 40, 0.012, 0.55);
    hills(zone.hill, 0.6, height * 0.66, 26, 0.02, 0.9);
    ctx.fillStyle = zone.ground;
    ctx.fillRect(0, groundY(), width, height - groundY());
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    const spacing = 46;
    const offset = -((scroll * 1.0) % spacing);
    for (let x = offset; x < width + spacing; x += spacing) {
      ctx.fillRect(x, groundY() + 10, 16, 3);
      ctx.fillRect(x + 22, groundY() + 26, 10, 3);
    }
  }

  function hills(color: string, parallax: number, base: number, amp: number, freq: number, alpha: number): void {
    ctx.fillStyle = hexAlpha(color, alpha);
    ctx.beginPath();
    ctx.moveTo(0, groundY());
    for (let x = 0; x <= width; x += 8) {
      const wx = x + scroll * parallax;
      ctx.lineTo(x, base - Math.sin(wx * freq) * amp - Math.sin(wx * freq * 2.3 + 1) * amp * 0.4);
    }
    ctx.lineTo(width, groundY());
    ctx.closePath();
    ctx.fill();
  }

  function heroLook(state: GameState): HeroLook {
    const total = state.levels.attack + state.levels.speed + state.levels.crit + state.levels.gold + state.levels.companion;
    return {
      weapon: weaponTier(state.levels.attack),
      armor: Math.min(5, Math.floor(total / 40)),
      cape: state.rebirths > 0,
      aura: state.stones >= 50,
    };
  }

  function drawActors(state: GameState): void {
    const s = scale();
    const gy = groundY();
    const look = heroLook(state);
    if (look.aura) {
      for (let i = 0; i < 3; i++) {
        const r = (30 + ((time * 30 + i * 20) % 60)) * s;
        ctx.strokeStyle = hexAlpha('#b07cff', 0.35 * (1 - ((time * 30 + i * 20) % 60) / 60));
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.ellipse(heroX(), gy - 4 * s, r, r * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    const swingPhase = swing > 0 ? 1 - swing / SWING_SECONDS : 0;
    drawHero(ctx, heroX(), gy, s, look, swingPhase, walk);
    if (state.levels.companion > 0 && isUnlocked(state, 'companion')) {
      drawFairy(ctx, heroX() - 30 * s, gy - 72 * s, s, time);
    }
    drawEnemy(state, s, gy);
    if (evolveRing > 0) {
      const r = (1 - evolveRing) * 120 * s;
      ctx.strokeStyle = hexAlpha(WEAPONS[look.weapon].glow ?? '#ffd84a', evolveRing);
      ctx.lineWidth = 4 * s;
      ctx.beginPath();
      ctx.arc(heroX(), gy - 35 * s, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawEnemy(state: GameState, s: number, gy: number): void {
    const enemy = state.enemy;
    if (enemy !== lastEnemy) {
      lastEnemy = enemy;
      if (enemy) enterT = 0;
    }
    if (!enemy) return;
    const ease = 1 - (1 - Math.min(1, enterT)) ** 3;
    const x = enemyX() + (1 - ease) * width * 0.45 + knock * 8 * s;
    drawMonster(ctx, x, gy, s, zoneOf(state.stage), enemy.boss, flash, time);
    const barW = (enemy.boss ? 90 : 56) * s;
    const barY = gy - (enemy.boss ? 110 : 66) * s;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.roundRect(x - barW / 2, barY, barW, 7 * s, 3 * s);
    ctx.fill();
    ctx.fillStyle = enemy.boss ? '#ff4d5e' : '#5fe08a';
    ctx.beginPath();
    ctx.roundRect(x - barW / 2, barY, barW * Math.max(0, enemy.hp / enemy.maxHp), 7 * s, 3 * s);
    ctx.fill();
  }

  function drawEffects(dt: number): void {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += 500 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
    }
    ctx.globalAlpha = 1;
    drawCoins(dt);
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= dt;
      if (f.life <= 0) {
        floaters.splice(i, 1);
        continue;
      }
      f.y += f.vy * dt;
      f.vy *= 0.94;
      const pop = f.life > f.max - 0.1 ? 1 + (f.life - (f.max - 0.1)) * 4 : 1;
      ctx.globalAlpha = Math.min(1, f.life / 0.3);
      ctx.font = `800 ${Math.round(f.size * pop)}px "Jua", "IBM Plex Sans KR", sans-serif`;
      ctx.strokeStyle = 'rgba(20,16,40,0.85)';
      ctx.lineWidth = Math.max(3, f.size * 0.2);
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawCoins(dt: number): void {
    const s = scale();
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      if (c.delay > 0) {
        c.delay -= dt;
        continue;
      }
      c.t += dt * 1.6;
      if (c.t >= 1) {
        coins.splice(i, 1);
        continue;
      }
      // 위로 솟았다가 골드 표시로 빨려 들어간다
      const t = c.t * c.t;
      const midX = (c.x0 + coinTarget.x) / 2;
      const midY = Math.min(c.y0, coinTarget.y) - 80 * s;
      const x = (1 - t) * (1 - t) * c.x0 + 2 * (1 - t) * t * midX + t * t * coinTarget.x;
      const y = (1 - t) * (1 - t) * c.y0 + 2 * (1 - t) * t * midY + t * t * coinTarget.y;
      const wobble = Math.abs(Math.cos(time * 14 + i));
      ctx.fillStyle = '#f5b400';
      ctx.beginPath();
      ctx.ellipse(x, y, 6 * s * wobble + 1, 6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe680';
      ctx.beginPath();
      ctx.ellipse(x, y, 3.5 * s * wobble + 0.5, 3.5 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawOverlays(state: GameState): void {
    if (skillFlash > 0) {
      const s = scale();
      const ex = enemyX();
      ctx.strokeStyle = hexAlpha('#fff7a8', skillFlash);
      ctx.lineWidth = 6 * s * skillFlash;
      ctx.beginPath();
      let y = 0;
      let x = ex;
      ctx.moveTo(x, y);
      while (y < groundY() - 20 * s) {
        y += 24 * s;
        x = ex + (Math.sin(y * 0.37 + time * 40) * 18 * s);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = hexAlpha('#ffffff', skillFlash * 0.35);
      ctx.fillRect(0, 0, width, height);
    }
    if (bossPulse > 0 || state.enemy?.boss) {
      const pulse = state.enemy?.boss ? 0.18 + Math.sin(time * 4) * 0.06 : 0;
      const alpha = Math.max(pulse, bossPulse * 0.4);
      const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.max(width, height) * 0.75);
      g.addColorStop(0, 'rgba(255,40,60,0)');
      g.addColorStop(1, `rgba(255,40,60,${alpha})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }
  }

  function tickTimers(state: GameState, dt: number): void {
    time += dt;
    swing = Math.max(0, swing - dt);
    flash = Math.max(0, flash - dt * 6);
    knock = Math.max(0, knock - dt * 8);
    shake = Math.max(0, shake - dt * 40);
    skillFlash = Math.max(0, skillFlash - dt * 2.5);
    evolveRing = Math.max(0, evolveRing - dt * 1.2);
    bossPulse = Math.max(0, bossPulse - dt * 1.5);
    enterT += dt / 0.3;
    // 적이 없을 때 용사가 걸어가며 배경이 흐른다
    if (!state.enemy) {
      scroll += dt * 160 * scale();
      walk += dt;
    }
  }

  return {
    resize(w, h, ratio) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      dpr = Math.min(2, Math.max(1, ratio));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    },
    draw(state, events, dt) {
      for (const event of events) onEvent(event, state);
      tickTimers(state, dt);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (shake > 0 && !reduced) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      }
      drawBackground(state);
      drawActors(state);
      drawEffects(dt);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!reduced) drawOverlays(state);
    },
    setCoinTarget(x, y) {
      coinTarget = { x, y };
    },
    setReducedMotion(value) {
      reduced = value;
    },
    coinRain(count) {
      for (let i = 0; i < count && coins.length < MAX_COINS; i++) {
        coins.push({ x0: width * (0.2 + Math.random() * 0.6), y0: height * (0.3 + Math.random() * 0.4), t: 0, delay: i * 0.04 });
      }
    },
  };
}
