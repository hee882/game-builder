export type Mode = "defense" | "hunt" | "landlord";
export type Point = { x: number; y: number };
export type Particle = Point & {
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
};
export type FloatText = Point & { text: string; color: string; life: number };
export type Enemy = Point & {
  id: number;
  hp: number;
  maxHp: number;
  progress: number;
  speed: number;
  kind: number;
  flash: number;
  chilledUntil?: number;
  slowedUntil?: number;
};
export type Tower = Point & {
  kind: number;
  level: number;
  cooldown: number;
  angle: number;
};
export type Shot = {
  from: Point;
  to: Point;
  life: number;
  color: string;
  kind: number;
};
export type Person = Point & {
  target: number;
  phase: number;
  timer: number;
  color: string;
  variant: number;
};
export const towerTypes = [
  {id:'arrow',kind:0,action:0,name:'화살탑',symbol:'➶',color:'#ffe6a4',description:'빠른 단일 공격',cost:55,damage:16,cooldown:.6},
  {id:'cannon',kind:1,action:1,name:'포격탑',symbol:'●',color:'#ffae78',description:'주변 65 거리의 적에게 피해 70%',cost:80,damage:30,cooldown:1.4},
  {id:'frost',kind:2,action:2,name:'서리탑',symbol:'❄',color:'#9bebf0',description:'적 이동 속도 감소 · 빙결 파쇄 연계',cost:70,damage:11,cooldown:.85},
  {id:'tremor',kind:3,action:4,name:'진동 말뚝',symbol:'≋',color:'#d3bc86',description:'90 거리 광역 타격 · 2초 동안 이동 속도 35% 감소',cost:95,damage:14,cooldown:1.6},
  {id:'mirror',kind:4,action:5,name:'거울 첨탑',symbol:'◇',color:'#bda8f0',description:'투사체를 굴절해 140 거리의 다른 적 둘에게 피해 70%',cost:110,damage:20,cooldown:1.1}
] as const;
export const road: Point[] = [
  { x: -45, y: 225 },
  { x: 170, y: 225 },
  { x: 270, y: 330 },
  { x: 440, y: 330 },
  { x: 540, y: 200 },
  { x: 695, y: 200 },
  { x: 780, y: 380 },
  { x: 970, y: 380 },
];
export const slots: Point[] = [
  { x: 150, y: 325 },
  { x: 290, y: 220 },
  { x: 390, y: 430 },
  { x: 510, y: 315 },
  { x: 635, y: 305 },
  { x: 755, y: 180 },
];
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v: number, a: number, b: number) =>
  Math.min(b, Math.max(a, v));
export function onRoad(progress: number): Point {
  for (let i = 1; i < road.length; i++) {
    const a = road[i - 1],
      b = road[i],
      len = distance(a, b);
    if (progress <= len)
      return {
        x: a.x + ((b.x - a.x) * progress) / len,
        y: a.y + ((b.y - a.y) * progress) / len,
      };
    progress -= len;
  }
  return { ...road[road.length - 1] };
}
export const roadLength = road
  .slice(1)
  .reduce((n, p, i) => n + distance(road[i], p), 0);

export class GameState {
  mode: Mode;
  time = 0;
  money = 140;
  earned = 0;
  upgrades = 0;
  interactions = 0;
  particles: Particle[] = [];
  texts: FloatText[] = [];
  shots: Shot[] = [];
  enemies: Enemy[] = [];
  towers: Tower[] = [];
  selectedKind = 0;
  selectedSlot = -1;
  wave = 0;
  remaining = 0;
  spawnTimer = 0;
  health = 20;
  kills = 0;
  intermission = 2;
  player: Point = { x: 460, y: 335 };
  target: Point = { x: 460, y: 335 };
  attackTimer = 0;
  xp = 0;
  level = 1;
  power = 1;
  attackSpeed = 1;
  choices = false;
  gems: Point[] = [];
  bossDefeated = false;
  floors = 1;
  staff = 0;
  shopLevel = 1;
  customers: Person[] = [];
  rentTimer = 0;
  combo = 0;
  eventTimer = 0;
  eventActive = false;
  campaign = false;
  damageMultiplier = 1;
  attackRateMultiplier = 1;
  mobilityMultiplier = 1;
  elementalCombo = false;
  enemyHealthMultiplier = 1;
  enemySpeedMultiplier = 1;
  chainDamage = 0;
  healOnKill = 0;
  status = "";
  sound: (kind: "coin" | "hit" | "upgrade") => void = () => {};
  nextId = 0;
  grown = false;
  constructor(mode: Mode) {
    this.mode = mode;
    this.status =
      mode === "defense"
        ? "빛나는 터를 눌러 첫 타워를 세워보세요."
        : mode === "hunt"
          ? "바닥을 누르거나 WASD로 이동하세요. 공격은 자동입니다."
          : "가게를 눌러 손님을 응대하세요. 첫 직원은 90원입니다.";
    if (mode === "hunt") this.money = 0;
    if (mode === "landlord") this.money = 40;
  }
  burst(p: Point, color: string, count = 12) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2,
        s = 30 + Math.random() * 100;
      this.particles.push({
        ...p,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 30,
        life: 0.5 + Math.random() * 0.4,
        max: 0.9,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }
  float(p: Point, text: string, color = "#ffe298") {
    this.texts.push({ ...p, text, color, life: 1.2 });
  }
  gain(amount: number, p: Point) {
    this.money += amount;
    this.earned += amount;
    this.float(p, `+${amount}`);
    this.burst(p, "#f8ce70", 7);
    this.sound("coin");
  }
  spend(cost: number) {
    if (!Number.isFinite(cost) || cost < 0) return false;
    if (this.money < cost) {
      this.status = `${cost - this.money}원이 더 필요해요.`;
      return false;
    }
    this.money -= cost;
    this.upgrades++;
    this.sound("upgrade");
    return true;
  }
  selectTower(kind: number) {
    const tower = towerTypes.find(t => t.kind === kind);
    if (this.mode !== 'defense' || !tower) return false;
    this.selectedKind = kind;
    this.status = `${tower.name} · ${tower.description} · ${tower.cost}원`;
    return true;
  }
  damageEnemy(enemy: Enemy, amount: number, chain = true) {
    if (enemy.hp <= 0) return;
    enemy.hp -= amount;
    enemy.flash = .15;
    if (!chain || this.chainDamage <= 0) return;
    const next = this.enemies.find(other => other !== enemy && other.hp > 0 && distance(enemy, other) <= 110);
    if (next) {
      this.damageEnemy(next, amount * this.chainDamage, false);
      this.shots.push({from:{x:enemy.x,y:enemy.y},to:{x:next.x,y:next.y},life:.18,color:'#91bfff',kind:0});
    }
  }
  recoverOnKill() {
    if (this.health > 0 && this.healOnKill > 0) this.health = Math.min(20, this.health + this.healOnKill);
  }
  protected takeDamage(amount: number) {
    this.health = Math.max(0, this.health - amount);
  }
  click(p: Point) {
    this.interactions++;
    if (this.mode === "defense") {
      const index = slots.findIndex((s) => distance(s, p) < 48);
      if (index < 0) return;
      this.selectedSlot = index;
      const tower = this.towers.find((t) => distance(t, slots[index]) < 5);
      if (tower) {
        const cost = tower.level * 65;
        if (tower.level >= 3) {
          this.status = "최고 레벨 타워입니다. 다른 터도 활용해보세요.";
          return;
        }
        if (this.spend(cost)) {
          tower.level++;
          this.burst(tower, "#fff0a0", 25);
          this.status = `타워 Lv.${tower.level} — 공격력과 사거리 증가!`;
        }
      } else {
        const type = towerTypes.find(t => t.kind === this.selectedKind);
        if (!type) return;
        const cost = type.cost;
        if (this.spend(cost)) {
          this.towers.push({
            ...slots[index],
            kind: this.selectedKind,
            level: 1,
            cooldown: 0,
            angle: 0,
          });
          this.burst(slots[index], "#a7edbc");
          this.status =
            "타워를 다시 누르면 강화합니다. 다음 웨이브를 준비하세요.";
        }
      }
    } else if (this.mode === "hunt") {
      this.target = { x: clamp(p.x, 45, 915), y: clamp(p.y, 100, 570) };
      this.burst(p, "#7ce8e0", 5);
    } else {
      if (p.x < 245 || p.x > 715 || p.y < 130 || p.y > 535) {
        this.status = "가운데 건물의 가게를 눌러 손님을 응대하세요.";
        return;
      }
      const floor = clamp(Math.floor((535 - p.y) / 88), 0, this.floors - 1);
      const customer = this.customers.find(
        (c) => c.phase === 1 && c.target === floor,
      );
      if (customer) {
        this.serve(customer, true);
      } else {
        this.float(p, "손님이 오는 중", "#f8edc9");
      }
    }
  }
  serve(c: Person, manual = false) {
    if (c.phase !== 1) return;
    c.phase = 2;
    c.timer = 0;
    const value =
      (8 + c.target * 5) * this.shopLevel * (this.eventActive ? 2 : 1);
    this.gain(value, { x: c.x, y: c.y - 25 });
    if (manual) this.combo++;
  }
  grow() {
    this.grown = true;
    this.money = 700;
    if (this.mode === "defense") {
      this.towers = slots.map((p, i) => ({
        ...p,
        kind: i % 3,
        level: 3,
        cooldown: 0,
        angle: 0,
      }));
      this.wave = 3;
      this.enemies = [];
      this.remaining = 0;
      this.intermission = 0.4;
      this.health = 20;
    }
    if (this.mode === "hunt") {
      this.level = 6;
      this.power = 3;
      this.attackSpeed = 1.7;
      this.health = 20;
      this.choices = false;
      this.xp = 0;
      this.enemies = [];
      this.spawnTimer = 0;
    }
    if (this.mode === "landlord") {
      this.floors = 4;
      this.staff = 3;
      this.shopLevel = 2;
    }
    this.status =
      "성장 미리보기 상태입니다. 처음부터 버튼으로 새로 시작할 수 있어요.";
    this.burst({ x: 480, y: 300 }, "#f8dd8a", 40);
  }
  action(index: number) {
    this.interactions++;
    if (this.mode === "defense") {
      const type = towerTypes.find(t => t.action === index);
      if (type) {
        this.selectTower(type.kind);
      } else if (
        index === 3 &&
        !this.enemies.length &&
        !this.remaining &&
        this.wave < 5 &&
        this.health > 0
      )
        this.intermission = 0;
    } else if (this.mode === "hunt") {
      if (!this.choices) {
        this.status = "적을 쓰러뜨리고 보석을 모으면 능력을 고를 수 있어요.";
        return;
      }
      if (index === 0) this.power += 0.6;
      if (index === 1) this.attackSpeed += 0.22;
      if (index === 2) this.health = Math.min(20, this.health + 8);
      this.choices = false;
      this.upgrades++;
      this.sound("upgrade");
      this.burst(this.player, "#a3fbe0", 28);
      this.status = [
        "공격력이 올랐어요. 더 강한 적을 찾아보세요.",
        "공격 속도가 올랐어요.",
        "체력을 회복했어요.",
      ][index];
    } else {
      if (index === 0 && this.staff < 4 && this.spend(90 + this.staff * 110)) {
        this.staff++;
        this.status = "직원이 손님을 자동으로 응대합니다.";
      }
      if (index === 1 && this.floors < 4 && this.spend(this.floors * 150)) {
        this.floors++;
        this.status = "새 가게가 문을 열었습니다! 손님과 수입이 늘어납니다.";
        this.burst({ x: 475, y: 540 - this.floors * 88 }, "#f7c36e", 35);
      }
      if (
        index === 2 &&
        this.shopLevel < 4 &&
        this.spend(this.shopLevel * 120)
      ) {
        this.shopLevel++;
        this.status = "가게 단가와 임대 수입이 올랐습니다.";
      }
      if (index === 3 && !this.eventActive && this.money >= 50) {
        this.money -= 50;
        this.eventActive = true;
        this.eventTimer = 15;
        this.status = "15초 동안 손님 증가 · 매출 2배!";
      }
    }
  }
  update(dt: number, keys: Point = { x: 0, y: 0 }) {
    this.time += dt;
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 90 * dt;
    }
    this.texts = this.texts.filter((p) => (p.life -= dt) > 0);
    for (const p of this.texts) p.y -= 27 * dt;
    this.shots = this.shots.filter((s) => (s.life -= dt) > 0);
    if (this.mode === "defense") this.updateDefense(dt);
    if (this.mode === "hunt") this.updateHunt(dt, keys);
    if (this.mode === "landlord") this.updateLandlord(dt);
  }
  updateDefense(dt: number) {
    if (this.health <= 0) return;
    const wasActive = this.remaining > 0 || this.enemies.length > 0;
    if (!this.remaining && !this.enemies.length) {
      if (this.wave >= 5) {
        this.status = "성채를 지켰습니다! 다섯 웨이브 방어 성공.";
        return;
      }
      if (!this.towers.length) return;
      this.intermission -= dt;
      if (this.intermission <= 0) {
        this.wave++;
        this.remaining = 7 + this.wave * 3;
        this.spawnTimer = 0;
        this.status = `웨이브 ${this.wave} 시작! ${this.wave === 5 ? "대장 몬스터가 접근합니다." : ""}`;
      }
    }
    this.spawnTimer -= dt;
    if (this.remaining > 0 && this.spawnTimer <= 0) {
      const boss = this.wave === 5 && this.remaining === 1;
      const hp = (boss ? 550 : 26 + this.wave * 16) * this.enemyHealthMultiplier;
      this.enemies.push({
        x: 0,
        y: 0,
        id: this.nextId++,
        hp,
        maxHp: hp,
        progress: 0,
        speed: (boss ? 32 : 40 + this.wave * 5) * this.enemySpeedMultiplier,
        kind: boss ? 2 : this.remaining % 2,
        flash: 0,
      });
      this.remaining--;
      this.spawnTimer = 0.8;
    }
    for (const t of this.towers) {
      const type = towerTypes.find(type => type.kind === t.kind);
      if (!type) continue;
      t.cooldown -= dt;
      const e = this.enemies.find(
        (e) => distance(t, e) < 130 + t.level * 18 && e.hp > 0,
      );
      if (!e) continue;
      t.angle = Math.atan2(e.y - t.y, e.x - t.x);
      if (t.cooldown > 0) continue;
      t.cooldown = type.cooldown / ((1 + t.level * 0.15) * this.attackRateMultiplier);
      const shatter = this.elementalCombo && t.kind === 1 && (e.chilledUntil ?? 0) > this.time;
      const damage = type.damage * t.level * this.damageMultiplier * (shatter ? 1.5 : 1);
      this.damageEnemy(e, damage);
      e.flash = 0.15;
      if (t.kind === 1) {
        for (const other of this.enemies)
          if (other !== e && distance(other, e) < 65) this.damageEnemy(other, damage * 0.7);
        this.burst(e, "#ffb368", 8);
      }
      if (t.kind === 2) { e.speed = Math.max(20, e.speed * 0.86); e.chilledUntil = this.time + 3; }
      if (t.kind === 3) {
        for (const other of this.enemies) if (distance(other, e) <= 90) {
          if (other !== e) this.damageEnemy(other, damage);
          other.slowedUntil = this.time + 2;
        }
      }
      if (t.kind === 4) {
        for (const other of this.enemies.filter(other => other !== e && other.hp > 0 && distance(other,e) <= 140).slice(0,2)) {
          this.damageEnemy(other, damage * .7);
          this.shots.push({from:{x:e.x,y:e.y},to:{x:other.x,y:other.y},life:.18,color:type.color,kind:4});
        }
      }
      if (shatter) this.float(e, "빙결 파쇄 ×1.5", "#b6f3ed");
      this.shots.push({
        from: { x: t.x, y: t.y - 38 },
        to: { ...e },
        life: 0.18,
        color: type.color,
        kind: t.kind,
      });
      this.sound("hit");
    }
    for (const e of this.enemies) {
      e.flash -= dt;
      e.progress += e.speed * dt * ((e.slowedUntil ?? 0) > this.time ? .65 : 1);
      Object.assign(e, onRoad(e.progress));
      if (e.hp <= 0) {
        this.kills++;
        this.recoverOnKill();
        this.gain(e.kind === 2 ? 100 : 12, e);
      } else if (e.progress >= roadLength) {
        this.takeDamage(e.kind === 2 ? 5 : 1);
        this.burst({ x: 875, y: 370 }, "#f58279");
      }
    }
    this.enemies = this.enemies.filter(
      (e) => e.hp > 0 && e.progress < roadLength,
    );
    if (wasActive && !this.remaining && !this.enemies.length)
      this.intermission = 3;
    if (this.health <= 0)
      this.status = "성채가 무너졌어요. 처음부터 다시 배치해보세요.";
  }
  updateHunt(dt: number, keys: Point) {
    if (this.health <= 0 || this.choices || this.bossDefeated) return;
    if (keys.x || keys.y) {
      const norm = Math.hypot(keys.x, keys.y);
      this.target = {
        x: clamp(this.player.x + (keys.x / norm) * 180 * this.mobilityMultiplier * dt, 45, 915),
        y: clamp(this.player.y + (keys.y / norm) * 180 * this.mobilityMultiplier * dt, 100, 570),
      };
    }
    const d = distance(this.player, this.target);
    if (d > 2) {
      const speed = Math.min(d, 180 * this.mobilityMultiplier * dt);
      this.player.x += ((this.target.x - this.player.x) / d) * speed;
      this.player.y += ((this.target.y - this.player.y) / d) * speed;
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.length < 22) {
      const a = Math.random() * Math.PI * 2;
      const boss = this.level >= 5 && !this.enemies.some((e) => e.kind === 2);
      const hp = (boss ? 700 : 22 + this.level * 10) * this.enemyHealthMultiplier;
      this.enemies.push({
        id: this.nextId++,
        x: clamp(this.player.x + Math.cos(a) * 380, 20, 940),
        y: clamp(this.player.y + Math.sin(a) * 300, 90, 575),
        hp,
        maxHp: hp,
        progress: 0,
        speed: (boss ? 22 : 27 + Math.random() * 18) * this.enemySpeedMultiplier,
        kind: boss ? 2 : this.nextId % 2,
        flash: 0,
      });
      this.spawnTimer = boss ? 2 : Math.max(0.45, 1.1 - this.level * 0.07);
    }
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      e.flash -= dt;
      const n = distance(e, this.player) || 1;
      e.x += ((this.player.x - e.x) / n) * e.speed * dt;
      e.y += ((this.player.y - e.y) / n) * e.speed * dt;
      e.progress -= dt;
      if (n < (e.kind === 2 ? 40 : 23) && e.progress <= 0) {
        this.takeDamage(e.kind === 2 ? 3 : 1);
        e.progress = 1;
        this.float(this.player, "−1", "#ff968e");
        this.burst(this.player, "#ef9b98", 5);
      }
    }
    this.attackTimer -= dt;
    const targets = this.enemies
      .filter((e) => e.hp > 0 && distance(e, this.player) < 220)
      .sort((a, b) => distance(a, this.player) - distance(b, this.player));
    if (this.attackTimer <= 0 && targets.length) {
      for (const e of targets.slice(0, this.level >= 4 ? 3 : 1)) {
        this.damageEnemy(e, 23 * this.power * this.damageMultiplier);
        e.flash = 0.18;
        this.shots.push({
          from: { x: this.player.x, y: this.player.y - 20 },
          to: { x: e.x, y: e.y - 15 },
          life: 0.2,
          color: "#a6f6e4",
          kind: 2,
        });
        this.burst(e, "#95e3d4", 4);
      }
      this.attackTimer = 0.7 / (this.attackSpeed * this.attackRateMultiplier);
      this.sound("hit");
    }
    for (const e of this.enemies)
      if (e.hp <= 0) {
        this.kills++;
        this.recoverOnKill();
        this.gems.push({ x: e.x, y: e.y });
        this.burst(e, e.kind === 2 ? "#ffd775" : "#9dc5ff", 15);
        if (e.kind === 2) {
          this.bossDefeated = true;
          this.status = "유적 수호자 격파! 수집과 성장의 첫 여정을 마쳤습니다.";
          this.gain(300, e);
        }
      }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.gems = this.gems.filter((g) => {
      const n = distance(g, this.player);
      if (n < 120) {
        g.x += (this.player.x - g.x) * dt * 7;
        g.y += (this.player.y - g.y) * dt * 7;
      }
      if (n < 20) {
        this.xp++;
        this.gain(5, this.player);
        if (this.xp >= 4 + this.level * 2) {
          this.xp = 0;
          this.level++;
          this.choices = true;
          this.status = "레벨 업! 아래에서 이번 탐험의 능력을 선택하세요.";
        }
        return false;
      }
      return true;
    });
    if (this.health <= 0)
      this.status = "탐험이 끝났습니다. 처음부터 다시 도전해보세요.";
  }
  updateLandlord(dt: number) {
    this.spawnTimer -= dt;
    this.rentTimer += dt;
    if (this.eventActive) {
      this.eventTimer -= dt;
      if (this.eventTimer <= 0) this.eventActive = false;
    }
    if (this.spawnTimer <= 0 && this.customers.length < 24) {
      const target = Math.floor(Math.random() * this.floors);
      this.customers.push({
        x: 110,
        y: 565,
        target,
        phase: 0,
        timer: 0,
        color: ["#dc8774", "#e2bc63", "#7ab8b3", "#a8a0d7"][this.nextId++ % 4],
        variant: this.nextId % 3,
      });
      this.spawnTimer =
        (this.eventActive ? 0.65 : 1.8) / Math.sqrt(this.floors);
    }
    for (const c of this.customers) {
      c.timer += dt;
      if (c.phase === 0) {
        const dest = {
          x:
            335 +
            this.customers.filter(
              (o) => o !== c && o.phase === 1 && o.target === c.target,
            ).length *
              22,
          y: 514 - c.target * 88,
        };
        const n = distance(c, dest);
        c.x += (dest.x - c.x) * Math.min(1, dt * 2);
        c.y += (dest.y - c.y) * Math.min(1, dt * 2);
        if (n < 8) {
          c.phase = 1;
          c.timer = 0;
        }
      } else if (
        c.phase === 1 &&
        this.staff > 0 &&
        c.timer > Math.max(0.8, 4 / this.staff)
      ) {
        this.serve(c);
      } else if (c.phase === 2) {
        c.x += 90 * dt;
        c.y += (565 - c.y) * dt * 2;
      }
    }
    this.customers = this.customers.filter((c) => c.x < 920);
    if (this.rentTimer >= 5) {
      this.rentTimer = 0;
      this.gain(this.floors * 4 * this.shopLevel, { x: 660, y: 490 });
    }
  }
}
