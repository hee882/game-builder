/**
 * 경계가 있는 이펙트 시스템 — 파티클 · 플로팅 수치 · 링 · 화면 흔들림.
 *
 * 전부 고정 크기 풀이다. 프레임당 할당 0을 지키려고 타입 배열 + 링 버퍼를 쓰고,
 * 상한을 넘으면 가장 오래된 것을 덮어쓴다(성장하지 않는다).
 * 축소 모션에서는 장식 파티클과 흔들림이 0이 되고, 타격 피드백은 «짧은 링»으로만 남는다.
 */

import { PALETTE, alpha, glow, ring, roundedRect } from './render-palette.ts';

export const PARTICLE_CAP = 220;
const TEXT_CAP = 18;
const RING_CAP = 16;

const KIND_SPARK = 0;
const KIND_BUBBLE = 1;
const KIND_CHUNK = 2;
const KIND_SNOW = 3;

export class EffectField {
  private readonly px = new Float32Array(PARTICLE_CAP);
  private readonly py = new Float32Array(PARTICLE_CAP);
  private readonly pvx = new Float32Array(PARTICLE_CAP);
  private readonly pvy = new Float32Array(PARTICLE_CAP);
  private readonly plife = new Float32Array(PARTICLE_CAP);
  private readonly pmax = new Float32Array(PARTICLE_CAP);
  private readonly psize = new Float32Array(PARTICLE_CAP);
  private readonly pkind = new Uint8Array(PARTICLE_CAP);
  private readonly pcolor: string[] = new Array(PARTICLE_CAP).fill(PALETTE.hullHi);
  private pnext = 0;

  private readonly tx = new Float32Array(TEXT_CAP);
  private readonly ty = new Float32Array(TEXT_CAP);
  private readonly tlife = new Float32Array(TEXT_CAP);
  private readonly tmax = new Float32Array(TEXT_CAP);
  private readonly tlabel: string[] = new Array(TEXT_CAP).fill('');
  private readonly tcolor: string[] = new Array(TEXT_CAP).fill(PALETTE.oreGold);
  private tnext = 0;

  private readonly rx = new Float32Array(RING_CAP);
  private readonly ry = new Float32Array(RING_CAP);
  private readonly rlife = new Float32Array(RING_CAP);
  private readonly rmax = new Float32Array(RING_CAP);
  private readonly rfrom = new Float32Array(RING_CAP);
  private readonly rto = new Float32Array(RING_CAP);
  private readonly rwidth = new Float32Array(RING_CAP);
  private readonly rcolor: string[] = new Array(RING_CAP).fill(PALETTE.energyCyan);
  private rnext = 0;

  private shake = 0;
  private shakeSeed = 0;
  reduced = false;

  clear(): void {
    this.plife.fill(0);
    this.tlife.fill(0);
    this.rlife.fill(0);
    this.shake = 0;
  }

  /* ── 스폰 ── */

  private spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
    kind: number,
  ): void {
    const i = this.pnext;
    this.pnext = (this.pnext + 1) % PARTICLE_CAP;
    this.px[i] = x;
    this.py[i] = y;
    this.pvx[i] = vx;
    this.pvy[i] = vy;
    this.plife[i] = life;
    this.pmax[i] = life;
    this.psize[i] = size;
    this.pcolor[i] = color;
    this.pkind[i] = kind;
  }

  /** 폭발 — 파편 + 스파크. 축소 모션에서는 링 하나로 대체된다 */
  burst(x: number, y: number, scale: number, color: string, count = 12): void {
    this.pushRing(x, y, scale * 0.3, scale * 1.5, 0.35, color, Math.max(2, scale * 0.09));
    if (this.reduced) return;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (i % 3) * 0.4;
      const speed = scale * (1.4 + (i % 5) * 0.35);
      this.spawn(
        x,
        y,
        Math.cos(a) * speed,
        Math.sin(a) * speed - scale * 0.3,
        0.35 + (i % 4) * 0.12,
        scale * (0.07 + (i % 3) * 0.03),
        color,
        i % 3 === 0 ? KIND_CHUNK : KIND_SPARK,
      );
    }
  }

  /** 피격 스파크 — 방향이 있는 짧은 튐 */
  sparks(x: number, y: number, scale: number, dirX: number, dirY: number, color: string, count = 6): void {
    if (this.reduced) {
      this.pushRing(x, y, scale * 0.15, scale * 0.6, 0.18, color, Math.max(1.5, scale * 0.06));
      return;
    }
    for (let i = 0; i < count; i++) {
      const spread = (i / count - 0.5) * 1.6;
      const cos = Math.cos(spread);
      const sin = Math.sin(spread);
      const vx = (dirX * cos - dirY * sin) * scale * 2.2;
      const vy = (dirX * sin + dirY * cos) * scale * 2.2;
      this.spawn(x, y, vx, vy, 0.2 + (i % 3) * 0.06, scale * 0.05, color, KIND_SPARK);
    }
  }

  bubbles(x: number, y: number, scale: number, count = 3): void {
    if (this.reduced) return;
    for (let i = 0; i < count; i++) {
      this.spawn(
        x + (i - count / 2) * scale * 0.12,
        y,
        (i % 2 === 0 ? 1 : -1) * scale * 0.12,
        -scale * (0.5 + (i % 3) * 0.2),
        0.9 + (i % 3) * 0.3,
        scale * (0.035 + (i % 3) * 0.015),
        PALETTE.hullHi,
        KIND_BUBBLE,
      );
    }
  }

  /** 마린 스노우 — 배경 밴드를 «살아 있는 물»로 만든다 */
  seedSnow(width: number, height: number, scale: number, count: number): void {
    if (this.reduced) return;
    for (let i = 0; i < count; i++) {
      const r1 = ((i * 2654435761) >>> 0) / 4294967296;
      const r2 = ((i * 40503 + 7919) % 9973) / 9973;
      this.spawn(
        r1 * width,
        r2 * height,
        (r2 - 0.5) * scale * 0.06,
        scale * (0.05 + r1 * 0.07),
        18 + r2 * 12,
        scale * (0.018 + r1 * 0.022),
        PALETTE.hullHi,
        KIND_SNOW,
      );
    }
  }

  float(x: number, y: number, label: string, color: string, life = 1.1): void {
    const i = this.tnext;
    this.tnext = (this.tnext + 1) % TEXT_CAP;
    this.tx[i] = x;
    this.ty[i] = y;
    this.tlabel[i] = label;
    this.tcolor[i] = color;
    this.tlife[i] = life;
    this.tmax[i] = life;
  }

  pushRing(x: number, y: number, from: number, to: number, life: number, color: string, width = 2): void {
    const i = this.rnext;
    this.rnext = (this.rnext + 1) % RING_CAP;
    this.rx[i] = x;
    this.ry[i] = y;
    this.rfrom[i] = from;
    this.rto[i] = to;
    this.rlife[i] = life;
    this.rmax[i] = life;
    this.rcolor[i] = color;
    this.rwidth[i] = width;
  }

  addShake(amount: number): void {
    if (this.reduced) return;
    this.shake = Math.min(1, this.shake + amount);
  }

  /** 화면 흔들림 오프셋. 축소 모션이면 항상 0 */
  shakeOffset(time: number): { x: number; y: number } {
    if (this.shake <= 0.001) return ZERO;
    const s = this.shake * this.shake;
    return {
      x: Math.sin(time * 47 + this.shakeSeed) * s * 6,
      y: Math.cos(time * 61 + this.shakeSeed * 1.7) * s * 5,
    };
  }

  /* ── 갱신·그리기 ── */

  update(dt: number, boundsW: number, boundsH: number): void {
    const step = Math.min(0.05, dt);
    for (let i = 0; i < PARTICLE_CAP; i++) {
      if (this.plife[i] <= 0) continue;
      this.plife[i] -= step;
      if (this.plife[i] <= 0) continue;
      this.px[i] += this.pvx[i] * step;
      this.py[i] += this.pvy[i] * step;
      const kind = this.pkind[i];
      if (kind === KIND_CHUNK) this.pvy[i] += 220 * step; // 파편은 가라앉는다
      else if (kind === KIND_SPARK) {
        this.pvx[i] *= 0.9;
        this.pvy[i] *= 0.9;
      } else if (kind === KIND_BUBBLE) this.pvy[i] -= 30 * step;
      else if (kind === KIND_SNOW) {
        // 화면을 벗어나면 위로 되돌려 순환시킨다(재스폰 없음 = 할당 0)
        if (this.py[i] > boundsH + 4) {
          this.py[i] = -4;
          this.plife[i] = this.pmax[i];
        }
        if (this.px[i] < -4) this.px[i] = boundsW + 4;
        else if (this.px[i] > boundsW + 4) this.px[i] = -4;
      }
    }
    for (let i = 0; i < TEXT_CAP; i++) if (this.tlife[i] > 0) this.tlife[i] -= step;
    for (let i = 0; i < RING_CAP; i++) if (this.rlife[i] > 0) this.rlife[i] -= step;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - step * 2.6);
      this.shakeSeed += step;
    }
  }

  drawParticles(c: CanvasRenderingContext2D): void {
    const prev = c.globalCompositeOperation;
    for (let i = 0; i < PARTICLE_CAP; i++) {
      const life = this.plife[i];
      if (life <= 0) continue;
      const t = life / this.pmax[i];
      const kind = this.pkind[i];
      if (kind === KIND_SPARK) {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = alpha(this.pcolor[i], Math.min(1, t) * 0.85);
      } else {
        c.globalCompositeOperation = prev;
        const base = kind === KIND_SNOW ? 0.28 : 0.6;
        c.fillStyle = alpha(this.pcolor[i], Math.min(1, t) * base);
      }
      c.beginPath();
      c.arc(this.px[i], this.py[i], this.psize[i] * (kind === KIND_SPARK ? t : 1), 0, Math.PI * 2);
      c.fill();
    }
    c.globalCompositeOperation = prev;
  }

  drawRings(c: CanvasRenderingContext2D): void {
    for (let i = 0; i < RING_CAP; i++) {
      const life = this.rlife[i];
      if (life <= 0) continue;
      const t = 1 - life / this.rmax[i];
      const r = this.rfrom[i] + (this.rto[i] - this.rfrom[i]) * t;
      ring(c, this.rx[i], this.ry[i], r, this.rwidth[i] * (1 - t * 0.6), this.rcolor[i], (1 - t) * 0.85);
    }
  }

  drawTexts(c: CanvasRenderingContext2D, fontSize: number): void {
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `700 ${Math.max(11, fontSize)}px "IBM Plex Sans KR", system-ui, sans-serif`;
    for (let i = 0; i < TEXT_CAP; i++) {
      const life = this.tlife[i];
      if (life <= 0) continue;
      const t = life / this.tmax[i];
      const rise = (1 - t) * fontSize * 1.9;
      const a = t > 0.75 ? (1 - t) * 4 : t / 0.75;
      c.lineWidth = 3;
      c.strokeStyle = alpha(PALETTE.abyss, a * 0.85);
      c.strokeText(this.tlabel[i], this.tx[i], this.ty[i] - rise);
      c.fillStyle = alpha(this.tcolor[i], a);
      c.fillText(this.tlabel[i], this.tx[i], this.ty[i] - rise);
    }
  }

  /** 살아 있는 파티클 수(테스트·계측용) */
  liveCount(): number {
    let n = 0;
    for (let i = 0; i < PARTICLE_CAP; i++) if (this.plife[i] > 0) n++;
    return n;
  }
}

const ZERO = { x: 0, y: 0 };

/* ─────────────────────────── 발견 연출 ─────────────────────────── */

/** 해금·발견은 4.2초가 아니라 화면을 멈추지 않는 1.6초 축약판으로 그린다(고정 카메라) */
export class RevealBanner {
  private life = 0;
  private max = 1.6;
  private x = 0;
  private y = 0;
  private label = '';
  private tint: string = PALETTE.arcaneViolet;

  fire(x: number, y: number, label: string, tint: string, field: EffectField): void {
    this.x = x;
    this.y = y;
    this.label = label;
    this.tint = tint;
    this.life = this.max;
    field.pushRing(x, y, 0, 90, 0.75, tint, 4);
    field.pushRing(x, y, 0, 54, 0.5, PALETTE.hullHi, 2);
    field.burst(x, y, 26, tint, 14);
  }

  update(dt: number): void {
    if (this.life > 0) this.life = Math.max(0, this.life - dt);
  }

  active(): boolean {
    return this.life > 0;
  }

  draw(c: CanvasRenderingContext2D, scale: number): void {
    if (this.life <= 0) return;
    const t = 1 - this.life / this.max;
    const appear = Math.min(1, t / 0.18);
    const fade = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
    const a = appear * fade;
    const size = Math.max(13, scale * 0.34);

    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `700 ${size}px "IBM Plex Sans KR", system-ui, sans-serif`;
    const width = c.measureText(this.label).width + size * 1.6;
    const y = this.y - scale * 0.9;
    c.fillStyle = alpha(PALETTE.abyss, 0.82 * a);
    roundedRect(c, this.x - width / 2, y - size * 0.9, width, size * 1.8, size * 0.35);
    c.fill();
    c.strokeStyle = alpha(this.tint, 0.8 * a);
    c.lineWidth = 1.5;
    c.stroke();
    glow(c, this.x, y, size * 0.5, this.tint, 0.4 * a);
    c.fillStyle = alpha(PALETTE.hullHi, a);
    c.fillText(this.label, this.x, y);
    c.restore();
  }
}
