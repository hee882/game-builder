import { GameState, road, slots, type Point } from "./game-state";

const W = 960,
  H = 660;
export class WorldRenderer {
  c: CanvasRenderingContext2D;
  reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  constructor(canvas: HTMLCanvasElement) {
    this.c = canvas.getContext("2d")!;
  }
  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    color: CanvasRenderingContext2D["fillStyle"],
    r = 0,
  ) {
    const c = this.c;
    c.fillStyle = color;
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fill();
  }
  ellipse(x: number, y: number, rx: number, ry: number, color: string) {
    const c = this.c;
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
  }
  line(points: Point[], color: string, width = 2) {
    const c = this.c;
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.stroke();
  }
  polygon(points: Point[], color: string) {
    const c = this.c;
    c.fillStyle = color;
    c.beginPath();
    points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.fill();
  }
  text(
    text: string,
    x: number,
    y: number,
    size = 14,
    color = "#fff",
    align: CanvasTextAlign = "left",
    bold = false,
  ) {
    const c = this.c;
    c.font = `${bold ? "700" : "500"} ${size}px "IBM Plex Sans KR", sans-serif`;
    c.fillStyle = color;
    c.textAlign = align;
    c.fillText(text, x, y);
  }
  diamond(x: number, y: number, size: number, color: string) {
    this.polygon(
      [
        { x, y: y - size },
        { x: x + size * 0.7, y },
        { x, y: y + size },
        { x: x - size * 0.7, y },
      ],
      color,
    );
  }
  person(
    x: number,
    y: number,
    color: string,
    t: number,
    variant = 0,
    scale = 1,
  ) {
    const c = this.c;
    c.save();
    c.translate(x, y);
    c.scale(scale, scale);
    const step = this.reduced ? 0 : Math.sin(t * 9) * 3;
    this.ellipse(0, 1, 12, 4, "#152b3438");
    this.line(
      [
        { x: -4, y: -10 },
        { x: -5 + step, y: 0 },
      ],
      "#23343e",
      4,
    );
    this.line(
      [
        { x: 4, y: -10 },
        { x: 5 - step, y: 0 },
      ],
      "#23343e",
      4,
    );
    this.rect(-8, -26, 16, 18, color, 5);
    this.line(
      [
        { x: -9, y: -23 },
        { x: -11 - step, y: -13 },
      ],
      "#e7bb93",
      4,
    );
    this.line(
      [
        { x: 9, y: -23 },
        { x: 11 + step, y: -13 },
      ],
      "#e7bb93",
      4,
    );
    this.ellipse(0, -33, 7, 8, "#f0c49c");
    this.rect(-7, -41, 14, 7, variant === 1 ? "#bf865b" : "#343b41", 3);
    if (variant === 2) this.rect(-9, -39, 19, 4, color, 2);
    c.restore();
  }
  tree(x: number, y: number, s = 1, night = false) {
    const c = this.c;
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    this.ellipse(0, 0, 30, 10, "#153b3536");
    this.rect(-5, -40, 10, 39, night ? "#394850" : "#6e634b", 3);
    for (let i = 0; i < 3; i++)
      this.polygon(
        [
          { x: 0, y: -98 + i * 22 },
          { x: -(26 + i * 4), y: -38 + i * 20 },
          { x: 26 + i * 4, y: -38 + i * 20 },
        ],
        night
          ? ["#345a66", "#2b4c5a", "#234451"][i]
          : ["#638c64", "#507956", "#426b4a"][i],
      );
    c.restore();
  }
  render(s: GameState) {
    const c = this.c;
    c.clearRect(0, 0, W, H);
    c.save();
    if (s.mode === "defense") this.defense(s);
    if (s.mode === "hunt") this.hunt(s);
    if (s.mode === "landlord") this.landlord(s);
    for (const shot of s.shots) {
      c.globalAlpha = Math.min(1, shot.life * 7);
      this.line([shot.from, shot.to], shot.color, shot.kind === 2 ? 4 : 3);
      this.ellipse(
        shot.to.x,
        shot.to.y,
        shot.kind === 1 ? 15 : 6,
        shot.kind === 1 ? 15 : 6,
        shot.color,
      );
    }
    c.globalAlpha = 1;
    if (!this.reduced)
      for (const p of s.particles) {
        c.globalAlpha = Math.max(0, p.life / p.max);
        this.rect(p.x, p.y, p.size, p.size, p.color, 1);
      }
    c.globalAlpha = 1;
    for (const p of s.texts) {
      c.globalAlpha = Math.min(1, p.life * 3);
      this.text(p.text, p.x, p.y, 17, p.color, "center", true);
    }
    c.globalAlpha = 1;
    this.bottom(s);
    if (
      (s.mode !== "landlord" && s.health <= 0) ||
      (s.mode === "defense" &&
        s.wave === 5 &&
        !s.remaining &&
        !s.enemies.length) ||
      (s.mode === "hunt" && s.bossDefeated)
    )
      this.finish(s);
    if (s.mode === "hunt" && s.choices) {
      this.rect(230, 230, 500, 130, "#132936ee", 18);
      this.text(
        "새로운 힘을 선택하세요",
        480,
        283,
        27,
        "#f8e6ad",
        "center",
        true,
      );
      this.text(
        "아래 능력 버튼을 누르면 탐험이 이어집니다",
        480,
        320,
        16,
        "#c1d3d8",
        "center",
      );
    }
    c.restore();
  }
  defense(s: GameState) {
    const c = this.c;
    this.rect(0, 0, W, H, "#91ad87");
    const sky = c.createLinearGradient(0, 0, 0, 180);
    sky.addColorStop(0, "#d0e0cb");
    sky.addColorStop(1, "#a9c09d");
    this.rect(0, 0, W, 190, sky);
    this.polygon(
      [
        { x: 0, y: 170 },
        { x: 130, y: 45 },
        { x: 300, y: 150 },
        { x: 420, y: 60 },
        { x: 660, y: 180 },
        { x: 790, y: 65 },
        { x: 960, y: 135 },
        { x: 960, y: 230 },
        { x: 0, y: 230 },
      ],
      "#94ae96",
    );
    this.polygon(
      [
        { x: 0, y: 155 },
        { x: 140, y: 110 },
        { x: 290, y: 180 },
        { x: 510, y: 100 },
        { x: 700, y: 178 },
        { x: 870, y: 115 },
        { x: 960, y: 160 },
        { x: 960, y: 240 },
        { x: 0, y: 240 },
      ],
      "#789a7d",
    );
    for (let i = 0; i < 90; i++) {
      const x = (i * 173 + 35) % 960,
        y = 190 + ((i * 87) % 390);
      this.line(
        [
          { x, y },
          { x: x + 3, y: y - 5 },
          { x: x + 5, y },
        ],
        i % 2 ? "#829f75" : "#adc291",
        1.5,
      );
    }
    this.line(road, "#74856c", 64);
    this.line(road, "#c4b491", 53);
    this.line(road, "#d3c39e", 36);
    for (let i = 0; i < 38; i++) {
      const x = (i * 97) % 920,
        y = 205 + ((i * 43) % 200);
      if (i % 2 === 0) this.ellipse(x, y, 3, 2, "#a99c7b");
    }
    this.ellipse(61, 465, 98, 32, "#779e99");
    this.ellipse(61, 463, 89, 24, "#90bec0");
    for (let i = 0; i < 4; i++)
      this.line(
        [
          { x: 8 + i * 23, y: 459 + (i % 2) * 8 },
          { x: 33 + i * 23, y: 459 + (i % 2) * 8 },
        ],
        "#b6d7cd",
        2,
      );
    for (const [x, y, k] of [
      [40, 197, 1],
      [105, 167, 0.8],
      [370, 145, 0.85],
      [580, 135, 0.7],
      [840, 160, 1],
      [912, 210, 0.9],
      [55, 400, 0.8],
      [80, 583, 1.1],
      [197, 542, 0.9],
      [570, 534, 1.1],
      [672, 559, 0.85],
      [820, 520, 0.9],
      [910, 535, 1.1],
    ])
      this.tree(x, y, k);
    this.castle(862, 370, s.time);
    for (let i = 0; i < slots.length; i++) {
      const p = slots[i];
      if (s.towers.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < 5)) continue;
      this.ellipse(p.x, p.y + 8, 33, 14, "#405e494a");
      this.ellipse(p.x, p.y, 32, 15, "#c1cba3");
      this.ellipse(p.x, p.y - 3, 27, 13, "#e1e2b8");
      c.setLineDash([4, 5]);
      c.strokeStyle = "#657e58";
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(p.x, p.y - 3, 31, 16, 0, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      this.text("+", p.x, p.y + 2, 28, "#536d4a", "center", true);
    }
    const objects = [
      ...s.towers.map((t) => ({ y: t.y, draw: () => this.tower(t, s) })),
      ...s.enemies.map((e) => ({
        y: e.y,
        draw: () =>
          this.monster(
            e.x,
            e.y,
            e.kind,
            s.time,
            e.hp / e.maxHp,
            e.flash > 0,
            false,
          ),
      })),
    ];
    objects.sort((a, b) => a.y - b.y).forEach((o) => o.draw());
    this.tag("GREENKEEP", 28, 38, "#2e4c3d", "#d8e7ca");
    this.text("초록 능선의 마지막 성채", 28, 79, 21, "#29483c", "left", true);
    this.tag(`WAVE ${s.wave} / 5`, 782, 38, "#2e4c3d", "#d8e7ca");
  }
  castle(x: number, y: number, t: number) {
    this.ellipse(x + 10, y + 15, 76, 21, "#35544244");
    this.rect(x - 46, y - 102, 92, 111, "#909b8c", 5);
    this.rect(x - 40, y - 93, 80, 100, "#d1d3b8", 4);
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 3; i++)
        this.rect(
          x - 38 + i * 27 + (j % 2) * 7,
          y - 83 + j * 23,
          23,
          19,
          "#bdc5ad",
          2,
        );
    for (const off of [-49, 39]) {
      this.rect(x + off, y - 127, 27, 136, "#bac3ad", 3);
      this.rect(x + off - 3, y - 134, 33, 15, "#dde0c3", 2);
      for (let i = 0; i < 3; i++)
        this.rect(x + off - 3 + i * 12, y - 146, 9, 19, "#dce1c3", 1);
      this.rect(x + off + 8, y - 109, 10, 20, "#536860", 5);
    }
    this.rect(x - 11, y - 35, 28, 44, "#4c6255", 14);
    this.rect(x - 6, y - 25, 18, 34, "#88694d", 3);
    this.line(
      [
        { x: x + 3, y: y - 140 },
        { x: x + 3, y: y - 188 },
      ],
      "#53685b",
      3,
    );
    this.polygon(
      [
        { x: x + 5, y: y - 187 },
        { x: x + 39, y: y - 180 + Math.sin(t * 3) * 3 },
        { x: x + 5, y: y - 165 },
      ],
      "#b8604c",
    );
  }
  tower(
    t: { x: number; y: number; kind: number; level: number; angle: number },
    s: GameState,
  ) {
    const c = this.c,
      { x, y } = t;
    const colors = ["#b98f56", "#956f69", "#70a4ae"];
    this.ellipse(x, y + 8, 30, 13, "#2b493c55");
    this.rect(x - 22, y - 24, 44, 30, "#8d9988", 5);
    this.ellipse(x, y - 24, 22, 10, "#d4d7b9");
    this.rect(
      x - 16,
      y - 58 - t.level * 5,
      32,
      37 + t.level * 5,
      colors[t.kind],
      4,
    );
    this.rect(x - 20, y - 64 - t.level * 5, 40, 12, "#e0d5ad", 3);
    if (t.kind === 0) {
      this.polygon(
        [
          { x: x - 26, y: y - 65 - t.level * 5 },
          { x, y: y - 95 - t.level * 5 },
          { x: x + 26, y: y - 65 - t.level * 5 },
        ],
        "#386c62",
      );
      c.save();
      c.translate(x, y - 53);
      c.rotate(t.angle);
      this.rect(-2, -4, 30, 8, "#584a3e", 2);
      this.line(
        [
          { x: 10, y: -14 },
          { x: 20, y: 0 },
          { x: 10, y: 14 },
        ],
        "#e1cf90",
        3,
      );
      c.restore();
    }
    if (t.kind === 1) {
      this.ellipse(x, y - 64 - t.level * 5, 18, 13, "#5b6770");
      c.save();
      c.translate(x, y - 65 - t.level * 5);
      c.rotate(t.angle);
      this.rect(0, -8, 32, 16, "#374b53", 4);
      this.rect(27, -10, 8, 20, "#71818a", 3);
      c.restore();
    }
    if (t.kind === 2) {
      this.ellipse(x, y - 77 - t.level * 5, 18, 8, "#9af7e332");
      this.diamond(
        x,
        y - 80 - t.level * 5 + (this.reduced ? 0 : Math.sin(s.time * 3) * 3),
        18,
        "#b6f0e8",
      );
      this.diamond(x - 3, y - 83 - t.level * 5, 9, "#e6fff0");
    }
    for (let i = 0; i < t.level; i++)
      this.diamond(x - 9 + i * 9, y - 14, 3, "#ffe294");
  }
  monster(
    x: number,
    y: number,
    kind: number,
    t: number,
    hp: number,
    flash: boolean,
    night: boolean,
  ) {
    const c = this.c;
    c.save();
    c.translate(x, y);
    const scale = kind === 2 ? 1.8 : 1;
    c.scale(scale, scale);
    const bob = this.reduced ? 0 : Math.sin(t * 7 + x) * 2;
    this.ellipse(0, 3, 15, 5, "#132c394d");
    if (kind === 0) {
      this.ellipse(
        0,
        -11 + bob,
        15,
        13,
        flash ? "#fffbe5" : night ? "#84a9c9" : "#98ac66",
      );
      this.ellipse(-4, -17 + bob, 5, 3, flash ? "#fff" : "#b6d4a3");
      this.ellipse(-5, -11 + bob, 2, 3, "#233c42");
      this.ellipse(5, -11 + bob, 2, 3, "#233c42");
    } else {
      this.rect(
        -12,
        -28 + bob,
        24,
        29,
        flash
          ? "#fffbe5"
          : kind === 2
            ? "#96769b"
            : night
              ? "#69799b"
              : "#aa8266",
        7,
      );
      this.polygon(
        [
          { x: -10, y: -24 + bob },
          { x: -19, y: -36 + bob },
          { x: -2, y: -28 + bob },
        ],
        "#d5c5ad",
      );
      this.polygon(
        [
          { x: 10, y: -24 + bob },
          { x: 19, y: -36 + bob },
          { x: 2, y: -28 + bob },
        ],
        "#d5c5ad",
      );
      this.rect(-8, -19 + bob, 5, 4, "#ffdfa1", 2);
      this.rect(3, -19 + bob, 5, 4, "#ffdfa1", 2);
      this.line(
        [
          { x: -6, y: -2 },
          { x: -8, y: 4 + Math.sin(t * 8) * 2 },
        ],
        "#39414e",
        5,
      );
      this.line(
        [
          { x: 6, y: -2 },
          { x: 8, y: 4 - Math.sin(t * 8) * 2 },
        ],
        "#39414e",
        5,
      );
    }
    if (hp < 1) {
      this.rect(-16, -44, 32, 4, "#253b45", 2);
      this.rect(-16, -44, 32 * Math.max(0, hp), 4, "#efb982", 2);
    }
    c.restore();
  }
  hunt(s: GameState) {
    const c = this.c;
    this.rect(0, 0, W, H, "#243b4c");
    const glow = c.createRadialGradient(470, 340, 20, 470, 340, 490);
    glow.addColorStop(0, "#426273");
    glow.addColorStop(1, "#223746");
    this.rect(0, 0, W, H, glow);
    for (let i = 0; i < 95; i++) {
      const x = (i * 151 + 21) % 960,
        y = 90 + ((i * 61) % 500);
      this.rect(x, y, 18 + (i % 4) * 8, 5, "#49627240", 2);
      if (i % 3 === 0) {
        this.line(
          [
            { x, y },
            { x: x + 4, y: y - 8 },
            { x: x + 7, y: y - 2 },
          ],
          "#668084",
          1,
        );
      }
    }
    this.ellipse(475, 345, 150, 78, "#8fafab15");
    c.strokeStyle = "#86b0b044";
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(475, 345, 150, 78, 0, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.ellipse(475, 345, 117, 60, 0, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      this.diamond(
        475 + Math.cos(a) * 133,
        345 + Math.sin(a) * 68,
        6,
        "#93b9b15c",
      );
    }
    for (const [x, y] of [
      [120, 190],
      [785, 200],
      [165, 490],
      [805, 510],
    ]) {
      this.ellipse(x, y, 30, 10, "#142b3655");
      this.rect(x - 17, y - 65, 34, 65, "#506677", 4);
      this.rect(x - 22, y - 72, 44, 13, "#78908e", 3);
      this.rect(x - 21, y - 10, 42, 14, "#607886", 3);
      this.rect(x - 4, y - 52, 8, 28, "#a4d5ca", 3);
      this.ellipse(x, y - 37, 19, 28, "#93efd00c");
    }
    for (const [x, y, k] of [
      [20, 225, 1.4],
      [60, 380, 0.8],
      [905, 320, 1.3],
      [875, 150, 1.1],
      [45, 590, 1.2],
      [190, 105, 0.9],
      [450, 120, 0.85],
      [670, 105, 0.95],
      [890, 595, 1.3],
    ])
      this.tree(x, y, k, true);
    for (let i = 0; i < 16; i++) {
      const x = (i * 131 + 52) % 910,
        y = 125 + ((i * 59) % 420);
      this.ellipse(x, y, 9, 3, "#142b3555");
      this.diamond(x, y - 8, 10, i % 2 ? "#7da6bf" : "#82bdb2");
    }
    if (!this.reduced)
      for (let i = 0; i < 22; i++) {
        const x = (i * 173 + s.time * (3 + (i % 3))) % 960,
          y = 120 + ((i * 73) % 430) + Math.sin(s.time + i) * 12;
        c.globalAlpha = 0.25 + Math.sin(s.time * 2 + i) * 0.2;
        this.ellipse(x, y, 2, 2, "#bdeee0");
      }
    c.globalAlpha = 1;
    for (const g of s.gems) {
      this.ellipse(g.x, g.y + 4, 8, 3, "#142b3566");
      this.diamond(
        g.x,
        g.y - 5 + (this.reduced ? 0 : Math.sin(s.time * 4) * 2),
        8,
        "#97efdc",
      );
      this.diamond(g.x - 1, g.y - 7, 3, "#e4fff0");
    }
    c.strokeStyle = "#add7cf66";
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(s.target.x, s.target.y, 12, 5, 0, 0, Math.PI * 2);
    c.stroke();
    const objs = [
      ...s.enemies.map((e) => ({
        y: e.y,
        draw: () =>
          this.monster(
            e.x,
            e.y,
            e.kind,
            s.time,
            e.hp / e.maxHp,
            e.flash > 0,
            true,
          ),
      })),
      {
        y: s.player.y,
        draw: () => {
          const p = s.player;
          this.ellipse(p.x, p.y, 24, 9, "#9ddfc222");
          this.person(
            p.x,
            p.y,
            "#e7c17c",
            Math.hypot(p.x - s.target.x, p.y - s.target.y) > 4 ? s.time : 0,
            1,
            1.3,
          );
          this.polygon(
            [
              { x: p.x - 12, y: p.y - 32 },
              { x: p.x - 22, y: p.y - 4 },
              { x: p.x - 5, y: p.y - 9 },
            ],
            "#c5685f",
          );
          this.line(
            [
              { x: p.x + 16, y: p.y - 5 },
              { x: p.x + 22, y: p.y - 44 },
            ],
            "#ac8d72",
            4,
          );
          this.diamond(p.x + 22, p.y - 47, 7, "#b9f3de");
          if (s.level >= 4)
            for (let i = 0; i < 2; i++) {
              const a = s.time * 1.4 + i * Math.PI;
              const x = p.x + Math.cos(a) * 48,
                y = p.y - 20 + Math.sin(a) * 25;
              this.ellipse(x, y, 12, 6, "#95f3e222");
              this.diamond(x, y, 8, "#bcf6de");
            }
        },
      },
    ];
    objs.sort((a, b) => a.y - b.y).forEach((o) => o.draw());
    this.tag("RELIC RUN", 28, 38, "#d2ece3", "#476875");
    this.text("잠든 숲의 유물 사냥꾼", 28, 79, 21, "#e0e9df", "left", true);
    this.tag(
      s.level >= 5 ? "BOSS AWAKENED" : `EXPLORER LV.${s.level}`,
      744,
      38,
      "#dfdfb6",
      "#465e65",
    );
    this.rect(315, 548, 330, 7, "#192e3c", 4);
    this.rect(315, 548, (330 * s.xp) / (4 + s.level * 2), 7, "#8fd6c3", 4);
    this.text(
      `다음 능력까지 보석 ${s.xp} / ${4 + s.level * 2}`,
      480,
      578,
      13,
      "#bfdbd6",
      "center",
    );
  }
  landlord(s: GameState) {
    const c = this.c;
    const sky = c.createLinearGradient(0, 0, 0, 550);
    sky.addColorStop(0, "#a9c7cc");
    sky.addColorStop(0.8, "#e2d6b6");
    sky.addColorStop(1, "#d7c5a9");
    this.rect(0, 0, W, H, sky);
    this.ellipse(780, 119, 39, 39, "#f6e7b5");
    for (let i = 0; i < 11; i++) {
      const x = i * 96 - 22,
        top = 200 + ((i * 47) % 115);
      this.rect(x, top, 79, 300, "#819e9e36", 3);
      for (let j = 0; j < 4; j++)
        this.rect(x + 12 + j * 15, top + 15, 7, 90, "#e1dfc449", 1);
    }
    this.rect(0, 535, W, 125, "#a8aaa0");
    this.rect(0, 540, W, 26, "#d6d0b7");
    this.rect(0, 566, W, 8, "#8d968c");
    this.rect(0, 574, W, 86, "#74898a");
    for (let i = 0; i < 9; i++)
      this.rect(i * 127 + 20, 614, 60, 4, "#d4d2b4", 2);
    const top = 535 - s.floors * 88;
    this.ellipse(486, 541, 270, 19, "#4858553b");
    this.rect(258, top - 18, 448, 553 - top, "#796e61", 3);
    this.polygon(
      [
        { x: 706, y: top - 18 },
        { x: 737, y: top - 36 },
        { x: 737, y: 519 },
        { x: 706, y: 535 },
      ],
      "#887c68",
    );
    const names = [
      "모퉁이 커피",
      "초록 책방",
      "노을 레스토랑",
      "루프탑 라운지",
    ];
    const wall = ["#dfc3a0", "#b3c2a1", "#c7a995", "#b4b7bc"];
    for (let f = 0; f < s.floors; f++) {
      const y = 535 - f * 88;
      this.rect(273, y - 82, 418, 76, wall[f], 2);
      this.rect(280, y - 29, 409, 23, "#ae987e", 1);
      for (let i = 0; i < 9; i++)
        this.line(
          [
            { x: 285 + i * 46, y: y - 28 },
            { x: 277 + i * 46, y: y - 6 },
          ],
          "#97866e",
          1,
        );
      for (let j = 0; j < 3; j++) {
        this.rect(300 + j * 104, y - 69, 71, 39, "#536f71", 4);
        this.rect(
          304 + j * 104,
          y - 65,
          63,
          31,
          f % 2 ? "#c0d4c0" : "#d7d9bb",
          2,
        );
        this.line(
          [
            { x: 335 + j * 104, y: y - 67 },
            { x: 335 + j * 104, y: y - 32 },
          ],
          "#8b9c8b",
          3,
        );
        this.line(
          [
            { x: 304 + j * 104, y: y - 49 },
            { x: 367 + j * 104, y: y - 49 },
          ],
          "#ffffff25",
          2,
        );
      }
      this.rect(582, y - 62, 84, 44, "#89634e", 3);
      this.rect(578, y - 65, 91, 9, "#ecdbb2", 2);
      this.rect(590, y - 49, 66, 4, "#bc9472", 1);
      if (f === 0) {
        for (let j = 0; j < 3; j++) {
          this.rect(590 + j * 20, y - 78, 11, 13, "#ede1c4", 2);
          this.rect(592 + j * 20, y - 81, 7, 4, "#4b4e40", 1);
        }
      }
      if (f === 1)
        for (let j = 0; j < 10; j++)
          this.rect(
            585 + j * 8,
            y - 82,
            6,
            17,
            ["#9b6452", "#e0c172", "#637e72"][j % 3],
            1,
          );
      if (f === 2) {
        this.ellipse(611, y - 70, 16, 4, "#f7e8c9");
        this.ellipse(638, y - 70, 12, 4, "#f7e8c9");
      }
      if (f === 3) {
        this.rect(590, y - 79, 8, 14, "#637f67", 2);
        this.rect(608, y - 80, 8, 15, "#d9bd7c", 2);
      }
      for (let j = 0; j < 3; j++) {
        this.line(
          [
            { x: 327 + j * 105, y: y - 81 },
            { x: 327 + j * 105, y: y - 73 },
          ],
          "#756b59",
          2,
        );
        this.ellipse(327 + j * 105, y - 71, 11, 4, "#fff0b3");
        if (!this.reduced) {
          c.globalAlpha = 0.08;
          this.polygon(
            [
              { x: 327 + j * 105, y: y - 71 },
              { x: 304 + j * 105, y: y - 27 },
              { x: 350 + j * 105, y: y - 27 },
            ],
            "#fffbd6",
          );
          c.globalAlpha = 1;
        }
      }
      if (s.staff > 0)
        this.person(
          560 + Math.sin(s.time * 1.8 + f) * 9,
          y - 12,
          "#f4e5c4",
          s.time,
          2,
          0.82,
        );
      this.rect(259, y - 7, 448, 8, "#766e60", 1);
      this.rect(262, y - 5, 440, 3, "#d8c5a2", 1);
      this.rect(273, y - 81, 105, 17, "#3b5757", 2);
      this.text(names[f], 325, y - 68, 11, "#f7e5b9", "center", true);
    }
    this.rect(258, top - 22, 451, 10, "#efe0ba", 2);
    this.rect(277, top - 44, 131, 24, "#3d5958", 3);
    this.text("골목상회", 342, top - 27, 15, "#f8e7ba", "center", true);
    this.rect(436, top - 42, 50, 20, "#9fada1", 3);
    this.line(
      [
        { x: 440, y: top - 36 },
        { x: 481, y: top - 36 },
      ],
      "#6e827a",
      2,
    );
    for (let i = 0; i < 2; i++) {
      const x = 650 + i * 27;
      this.rect(x, top - 41, 16, 19, "#b78864", 2);
      this.ellipse(x + 8, top - 45, 13, 11, "#718e65");
    }
    if (s.floors < 4) {
      c.setLineDash([5, 7]);
      c.strokeStyle = "#57737066";
      c.lineWidth = 2;
      c.strokeRect(280, top - 116, 407, 57);
      c.setLineDash([]);
      this.text(
        "다음 층에는 어떤 가게가 생길까요?",
        483,
        top - 82,
        14,
        "#55716b",
        "center",
      );
    }
    this.rect(682, top - 11, 15, 537 - top, "#435e5d", 1);
    const elevatorY =
      518 -
      (s.floors > 1
        ? (Math.sin(s.time * 0.5) * 0.5 + 0.5) * (s.floors - 1) * 88
        : 0);
    this.rect(683, elevatorY - 35, 13, 33, "#d6c5a0", 2);
    this.line(
      [
        { x: 689, y: top },
        { x: 689, y: elevatorY - 35 },
      ],
      "#a4b1a0",
      1,
    );
    [...s.customers]
      .sort((a, b) => a.y - b.y)
      .forEach((p) => {
        this.person(
          p.x,
          p.y,
          p.color,
          p.phase === 1 ? 0 : s.time,
          p.variant,
          0.85,
        );
        if (p.phase === 1) {
          this.rect(p.x - 11, p.y - 51, 22, 16, "#fff0c9", 5);
          this.text("…", p.x, p.y - 40, 13, "#71624a", "center", true);
        }
      });
    this.tree(125, 534, 0.9);
    this.tree(837, 537, 0.9);
    this.rect(174, 520, 45, 8, "#8a7862", 2);
    this.rect(179, 528, 4, 14, "#4c635e");
    this.rect(208, 528, 4, 14, "#4c635e");
    const carX = ((s.time * 65) % 1150) - 150;
    this.ellipse(carX + 30, 622, 48, 8, "#354f5344");
    this.rect(carX, 598, 80, 22, "#b46e58", 6);
    this.polygon(
      [
        { x: carX + 14, y: 598 },
        { x: carX + 24, y: 583 },
        { x: carX + 58, y: 583 },
        { x: carX + 70, y: 598 },
      ],
      "#bf7b61",
    );
    this.rect(carX + 27, 586, 28, 10, "#b2cfcd", 2);
    this.ellipse(carX + 16, 619, 8, 8, "#34494b");
    this.ellipse(carX + 64, 619, 8, 8, "#34494b");
    this.tag("CORNER & CO.", 28, 38, "#334e50", "#e2e8d1");
    this.text(
      "작은 가게에서, 나의 빌딩으로",
      28,
      79,
      21,
      "#334e50",
      "left",
      true,
    );
    this.tag(
      s.eventActive
        ? `매출 2배 · ${Math.ceil(s.eventTimer)}초`
        : `${s.floors} FLOORS OPEN`,
      746,
      38,
      "#334e50",
      "#e2e8d1",
    );
  }
  tag(text: string, x: number, y: number, fg: string, bg: string) {
    this.rect(x, y - 19, Math.max(115, text.length * 8.5 + 25), 29, bg, 5);
    this.text(text, x + 12, y, 12, fg, "left", true);
  }
  bottom(s: GameState) {
    this.rect(20, 603, 920, 41, "#182e37e8", 8);
    const tip =
      s.mode === "defense"
        ? "빛나는 터: 건설   /   타워: 강화"
        : s.mode === "hunt"
          ? "클릭·드래그 또는 WASD 이동   /   가까운 적 자동 공격"
          : "가게 클릭: 손님 응대   /   직원 고용: 자동화";
    this.text(tip, 38, 629, 14, "#e1e8db");
    this.text(
      s.grown ? "성장 미리보기" : "PLAYABLE DEMO",
      920,
      629,
      11,
      "#e9cd87",
      "right",
    );
  }
  finish(s: GameState) {
    this.rect(225, 220, 510, 170, "#172d38ed", 20);
    const win = s.health > 0;
    this.text(
      win ? "멋진 첫 여정이었어요" : "한 번 더 도전해볼까요?",
      480,
      280,
      29,
      "#f1db9f",
      "center",
      true,
    );
    this.text(
      win
        ? "다른 장르에서는 어떤 성장이 기다릴까요?"
        : "처음부터 버튼으로 새로 시작할 수 있어요.",
      480,
      320,
      17,
      "#d0ddd9",
      "center",
    );
    this.text(
      `처치 ${s.kills}  ·  획득 ${s.earned}  ·  강화 ${s.upgrades}`,
      480,
      355,
      14,
      "#a6c4c4",
      "center",
    );
  }
}
