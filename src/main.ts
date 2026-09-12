import Phaser from "phaser";
import { GameState, type Mode } from "./game-state";
import { WorldRenderer } from "./renderer";
import "./style.css";

const descriptions = {
  defense: {
    title: "작은 성채",
    en: "GREENKEEP",
    genre: "타워디펜스",
    tag: "배치하고, 막아내고, 진화시키기",
    description:
      "구불구불한 길 끝에 작은 성채가 있습니다. 세 종류의 타워를 배치하고, 마지막 웨이브까지 지켜보세요.",
    color: "#aaca93",
    controls:
      "빛나는 터를 클릭해 건설합니다. 설치한 타워를 다시 누르면 강화됩니다.",
    feel: ["배치하는 전략", "쏟아지는 타격감", "웨이브를 넘는 성취"],
    steps: ["첫 타워 건설", "타워 강화·조합", "5웨이브 방어"],
    scope: "길 1개 · 타워 3종 · 적 3종",
    complexity: "경로 이동 · 사거리 · 광역 공격 · 웨이브 밸런스",
  },
  hunt: {
    title: "유물 사냥꾼",
    en: "RELIC RUN",
    genre: "수집·사냥",
    tag: "움직이고, 모으고, 강해지기",
    description:
      "잠든 숲에서 보석을 모으세요. 새로운 능력을 선택하고, 동료 정령과 함께 유적 수호자를 상대합니다.",
    color: "#9bcbd4",
    controls:
      "바닥 클릭·드래그 또는 WASD / 방향키로 이동합니다. 공격은 자동입니다.",
    feel: ["직접 움직이는 손맛", "보석을 모으는 쾌감", "능력을 조합하는 재미"],
    steps: ["이동·첫 사냥", "보석 수집·능력 선택", "Lv.5 수호자 도전"],
    scope: "맵 1개 · 능력 3종 · 수호자 1종",
    complexity: "이동 · 추적 · 피격 · 전리품 · 능력 조합",
  },
  landlord: {
    title: "골목상회",
    en: "CORNER & CO.",
    genre: "건물주·경영",
    tag: "응대하고, 맡기고, 확장하기",
    description:
      "작은 커피 가게에서 시작합니다. 손님을 응대하고 직원을 고용해, 네 층짜리 빌딩을 완성하세요.",
    color: "#e0bd8e",
    controls:
      "가게 안을 클릭해 기다리는 손님을 응대합니다. 직원은 자동으로 응대합니다.",
    feel: ["북적이는 공간 구경", "일을 맡기는 자동화", "건물이 커지는 만족"],
    steps: ["손님 직접 응대", "첫 직원 고용", "4층 빌딩 완성"],
    scope: "가게 4종 · 직원 · 증축 · 홍보",
    complexity: "손님 상태 · 자동 응대 · 수입 · 증축 밸런스",
  },
};
let mode: Mode = "defense";
const states: Record<Mode, GameState> = {
  defense: new GameState("defense"),
  hunt: new GameState("hunt"),
  landlord: new GameState("landlord"),
};
let paused = false,
  soundOn = false,
  audioContext: AudioContext | undefined,
  lastSound = 0;
const votes: Record<string, number> = {};
try {
  const saved = JSON.parse(
    localStorage.getItem("playroom-votes-v1") || "{}",
  ) as Record<string, unknown>;
  for (const [k, v] of Object.entries(saved))
    if (typeof v === "number" && v >= 1 && v <= 5) votes[k] = v;
} catch {
  /* Private browsing can disable storage. */
}
function tone(kind: "coin" | "hit" | "upgrade") {
  if (!soundOn) return;
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") void audioContext.resume();
  const now = audioContext.currentTime;
  if (now - lastSound < 0.055) return;
  lastSound = now;
  const osc = audioContext.createOscillator(),
    gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.type = kind === "hit" ? "triangle" : "sine";
  osc.frequency.setValueAtTime(
    kind === "coin" ? 880 : kind === "upgrade" ? 480 : 160,
    now,
  );
  osc.frequency.exponentialRampToValueAtTime(
    kind === "upgrade" ? 960 : kind === "coin" ? 1300 : 60,
    now + 0.12,
  );
  gain.gain.setValueAtTime(0.035, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
  osc.start(now);
  osc.stop(now + 0.18);
}
for (const s of Object.values(states)) s.sound = tone;
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <header class="site-header"><a class="brand" href="/" aria-label="플레이룸 홈"><span class="brand-mark"><i></i><i></i><i></i><i></i></span>플레이룸<span class="brand-caption">SMALL WORLDS, BIG IDEAS</span></a><span class="edition"><span class="live-dot"></span> 직접 해보는 게임 비교실 <span class="mono">VOL. 01</span></span></header>
  <main>
    <section class="intro"><div><p class="eyebrow">THREE WORLDS. YOUR KIND OF FUN.</p><h1>어떤 세계를 <span>만들고 싶나요?</span></h1><p class="intro-copy">직접 플레이하고, 성장한 모습을 보고, 마음이 가는 재미를 찾아보세요.</p></div><div class="intro-note"><span class="note-number">3</span><p>개의 작은 게임<br><strong>하나씩, 가볍게 플레이</strong></p></div></section>
    <nav class="game-tabs" aria-label="게임 선택"><button class="game-tab active" data-mode="defense" aria-pressed="true"><span class="tab-symbol">♜</span><span><small>전략 · 방어</small><strong>작은 성채</strong></span><span class="tab-arrow">↗</span></button><button class="game-tab" data-mode="hunt" aria-pressed="false"><span class="tab-symbol">✧</span><span><small>액션 · 수집</small><strong>유물 사냥꾼</strong></span><span class="tab-arrow">↗</span></button><button class="game-tab" data-mode="landlord" aria-pressed="false"><span class="tab-symbol">▥</span><span><small>경영 · 성장</small><strong>골목상회</strong></span><span class="tab-arrow">↗</span></button></nav>
    <section class="showroom" aria-label="플레이 공간"><div class="game-column"><div class="game-toolbar"><div><span class="live-dot"></span><strong id="world-name">GREENKEEP</strong><span class="toolbar-divider">/</span><span id="world-mode">직접 플레이</span></div><div class="utility-controls"><button id="sound" aria-pressed="false" title="효과음 켜기">소리 꺼짐</button><button id="pause" aria-pressed="false">일시정지</button><button id="fullscreen" title="게임 전체화면">확대 ↗</button></div></div>
      <div id="stage-wrap"><div id="game" tabindex="0" role="application" aria-label="작은 성채 게임. 아래 조작 안내를 확인하세요."></div><div id="paused-overlay" hidden><strong>잠시 쉬어가기</strong><button id="resume">계속 플레이 →</button></div></div>
      <div class="stat-strip"><div><small id="stat-a-label">보유 골드</small><strong id="stat-a">140<span>G</span></strong></div><div><small id="stat-b-label">성채 체력</small><strong id="stat-b">20 / 20</strong></div><div><small id="stat-c-label">방어 기록</small><strong id="stat-c">0 처치</strong></div><div class="session-time"><small>플레이 시간</small><strong id="stat-time">00:00</strong></div></div>
      <div class="action-area"><div class="action-heading"><span id="action-title">어떤 타워를 세울까요?</span><span id="action-hint">타워 선택 → 빛나는 터 클릭</span></div><div id="actions" class="actions"></div><p id="game-status" role="status">빛나는 터를 눌러 첫 타워를 세워보세요.</p></div>
    </div><aside class="field-notes"><p class="eyebrow">ON THE PLAY TABLE</p><span id="genre" class="genre-label">타워디펜스</span><h2 id="game-title">작은 성채</h2><p id="game-tag" class="game-tag"></p><p id="description" class="description"></p><div class="aside-rule"></div><p class="section-caption">플레이 흐름</p><ol id="steps" class="play-steps"></ol><div class="control-note"><span>조작 안내</span><p id="instructions"></p></div><button id="grow" class="primary-button">성장한 모습 보기 <span>↗</span></button><button id="reset" class="reset-button">이 게임 처음부터 ↺</button><p class="save-note">장르를 바꿔도 이번 방문의 진행은 유지됩니다.</p><div class="scope-note"><span>이번 샘플의 범위</span><p id="scope"></p><small>광고·결제 없이 플레이 감각을 비교하는 샘플입니다.</small></div></aside></section>
    <section class="reflection"><div class="reflection-intro"><p class="eyebrow">YOUR TASTE, NOT A SCORE</p><h2>다시 하고 싶은 건<br>어떤 쪽인가요?</h2><p>개발 실력을 채점하는 도구가 아닙니다.<br>어떤 재미를 만들고 싶은지 기록해보세요.</p><button id="export" class="text-button">비교 기록 내려받기 ↓</button></div><div class="rating-panel"><div class="rating-top"><h3><span id="rating-title">작은 성채</span> 플레이 메모</h3><span>1 낮음 — 5 높음</span></div><div id="ratings"></div><label class="memo-label" for="memo">더 넣고 싶은 요소 / 아쉬운 점</label><textarea id="memo" rows="2" placeholder="예: 타워가 합쳐지거나 진화하면 더 재미있겠어요."></textarea><p id="save-status" class="save-note">평가와 메모는 이 브라우저에 저장됩니다.</p></div></section>
    <details class="comparison"><summary>세 샘플의 개발 구성 비교 <span>+</span></summary><div class="table-scroll"><table><thead><tr><th>게임</th><th>구현한 핵심</th><th>다음에 확장할 부분</th></tr></thead><tbody><tr><th>작은 성채</th><td>경로 · 사거리 · 광역 공격 · 둔화</td><td>맵 다양화, 타워 진화, 적 조합</td></tr><tr><th>유물 사냥꾼</th><td>이동 · 추적 · 피격 · 수집 · 능력 선택</td><td>장비 외형, 공격 모션, 탐험 지역</td></tr><tr><th>골목상회</th><td>손님 상태 · 자동 응대 · 임대료 · 증축</td><td>가게 개성, 직원 동선, 경제 밸런스</td></tr></tbody></table></div><p>공통: TypeScript + Phaser + Vite · 코드로 그린 2D 그래픽 · 합성 효과음. 출시용 아트·콘텐츠 제작량과 기기별 성능 검증은 별도입니다.</p></details>
  </main><footer><span class="brand-mini">플레이룸</span><span>작은 샘플에서 시작하는, 당신의 다음 게임.</span><span class="mono">PROTOTYPE COLLECTION / 001</span></footer>
`;
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
function setText(id: string, text: string) {
  if (el(id).textContent !== text) el(id).textContent = text;
}
function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    setText(
      "save-status",
      "브라우저 저장이 제한되어 있습니다. 비교 기록을 내려받아 보관하세요.",
    );
  }
}
function readMemo(m: Mode) {
  try {
    return localStorage.getItem(`playroom-memo-${m}`) || "";
  } catch {
    return "";
  }
}
const ratingLabels = [
  "다시 플레이하고 싶다",
  "성장하는 모습이 좋다",
  "이런 게임을 만들고 싶다",
];
function renderRatings() {
  el("ratings").innerHTML = ratingLabels
    .map(
      (label, index) =>
        `<div class="rating-row"><span>${label}</span><div class="rating-buttons" role="group" aria-label="${label}">${[1, 2, 3, 4, 5].map((n) => `<button data-rating="${index}" data-value="${n}" aria-label="${label} ${n}점" aria-pressed="${votes[`${mode}-${index}`] === n}" class="${votes[`${mode}-${index}`] === n ? "chosen" : ""}">${n}</button>`).join("")}</div></div>`,
    )
    .join("");
  el("ratings")
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          votes[`${mode}-${b.dataset.rating}`] = Number(b.dataset.value);
          persist("playroom-votes-v1", JSON.stringify(votes));
          renderRatings();
        }),
    );
}
let actionSignature = "";
function renderActions() {
  const s = states[mode];
  let labels: string[], sub: string[], disabled: boolean[];
  if (mode === "defense") {
    labels = ["화살탑", "포격탑", "서리탑", "다음 웨이브"];
    sub = [
      "55 G · 빠른 공격",
      "80 G · 광역 피해",
      "70 G · 이동 둔화",
      s.wave >= 5
        ? "마지막 웨이브"
        : s.remaining || s.enemies.length
          ? "방어 진행 중"
          : "준비되면 시작",
    ];
    disabled = [
      false,
      false,
      false,
      !!s.remaining || !!s.enemies.length || s.wave >= 5 || s.health <= 0,
    ];
  } else if (mode === "hunt") {
    labels = ["공격력 강화", "공격 속도", "체력 회복"];
    sub = ["공격력 +60%p", "속도 +22%p", "체력 +8"];
    disabled = [!s.choices, !s.choices, !s.choices];
  } else {
    labels = ["직원 고용", "한 층 증축", "가게 업그레이드", "15초 홍보"];
    sub = [
      s.staff >= 4 ? "고용 완료" : `${90 + s.staff * 110} G · 자동 응대`,
      s.floors >= 4 ? "최대 4층 완성" : `${s.floors * 150} G · 새 가게`,
      s.shopLevel >= 4 ? "최고 레벨" : `${s.shopLevel * 120} G · 단가 증가`,
      s.eventActive ? "홍보 진행 중" : "50 G · 매출 2배",
    ];
    disabled = [
      s.staff >= 4 || s.money < 90 + s.staff * 110,
      s.floors >= 4 || s.money < s.floors * 150,
      s.shopLevel >= 4 || s.money < s.shopLevel * 120,
      s.eventActive || s.money < 50,
    ];
  }
  const signature = JSON.stringify([
    mode,
    labels,
    sub,
    disabled,
    s.selectedKind,
  ]);
  if (signature === actionSignature) return;
  actionSignature = signature;
  el("actions").innerHTML = labels
    .map(
      (label, i) =>
        `<button class="action-button ${mode === "defense" && s.selectedKind === i ? "selected" : ""}" data-action="${i}" ${disabled[i] ? "disabled" : ""} ${mode === "defense" && i < 3 ? `aria-pressed="${s.selectedKind === i}"` : ""}><span class="action-icon">${(mode === "defense" ? ["↟", "◉", "❄", "→"] : mode === "hunt" ? ["✧", "»", "+"] : ["♙", "▥", "↑", "↗"])[i]}</span><span><strong>${label}</strong><small>${sub[i]}</small></span></button>`,
    )
    .join("");
  el("actions")
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          states[mode].action(Number(b.dataset.action));
          sync();
        }),
    );
}
function switchMode(next: Mode) {
  mode = next;
  const d = descriptions[mode];
  document.documentElement.style.setProperty("--world-accent", d.color);
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
    b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  });
  setText("world-name", d.en);
  setText("genre", d.genre);
  setText("game-title", d.title);
  setText("game-tag", d.tag);
  setText("description", d.description);
  setText("instructions", d.controls);
  setText("scope", d.scope);
  setText("rating-title", d.title);
  el("steps").innerHTML = d.steps.map((t) => `<li>${t}</li>`).join("");
  el<HTMLTextAreaElement>("memo").value = readMemo(mode);
  el("game").setAttribute("aria-label", `${d.title} 게임. ${d.controls}`);
  setText(
    "action-title",
    mode === "defense"
      ? "어떤 타워를 세울까요?"
      : mode === "hunt"
        ? "레벨이 오르면 능력을 선택하세요"
        : "직접 하던 일을, 조금씩 맡겨보세요",
  );
  setText(
    "action-hint",
    mode === "defense"
      ? "타워 선택 → 빛나는 터 클릭"
      : mode === "hunt"
        ? "보석 수집 → 레벨 업 → 능력 선택"
        : "응대 → 직원 → 증축",
  );
  renderRatings();
  sync();
}
function sync() {
  const s = states[mode];
  setText("stat-a", `${Math.floor(s.money).toLocaleString()} G`);
  setText("stat-a-label", mode === "landlord" ? "보유 자금" : "보유 골드");
  setText(
    "stat-b-label",
    mode === "defense"
      ? "성채 체력"
      : mode === "hunt"
        ? "탐험가 체력"
        : "건물 규모",
  );
  setText(
    "stat-b",
    mode === "landlord"
      ? `${s.floors}층 · 직원 ${s.staff}`
      : `${s.health} / 20`,
  );
  setText(
    "stat-c-label",
    mode === "defense"
      ? "방어 기록"
      : mode === "hunt"
        ? "사냥 기록"
        : "누적 매출",
  );
  setText(
    "stat-c",
    mode === "landlord" ? `${s.earned.toLocaleString()} G` : `${s.kills} 처치`,
  );
  setText(
    "stat-time",
    `${String(Math.floor(s.time / 60)).padStart(2, "0")}:${String(Math.floor(s.time % 60)).padStart(2, "0")}`,
  );
  setText("game-status", s.status);
  setText("world-mode", s.grown ? "성장 미리보기" : "직접 플레이");
  renderActions();
}
function pause(next: boolean) {
  paused = next;
  el("paused-overlay").hidden = !next;
  setText("pause", next ? "계속하기" : "일시정지");
  el("pause").setAttribute("aria-pressed", String(next));
}
document
  .querySelectorAll<HTMLButtonElement>("[data-mode]")
  .forEach((b) => (b.onclick = () => switchMode(b.dataset.mode as Mode)));
el("pause").onclick = () => pause(!paused);
el("resume").onclick = () => pause(false);
el("sound").onclick = () => {
  soundOn = !soundOn;
  setText("sound", soundOn ? "소리 켜짐" : "소리 꺼짐");
  el("sound").setAttribute("aria-pressed", String(soundOn));
  tone("upgrade");
};
el("grow").onclick = () => {
  states[mode].grow();
  pause(false);
  sync();
};
el("reset").onclick = () => {
  states[mode] = new GameState(mode);
  states[mode].sound = tone;
  pause(false);
  sync();
};
el("fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else
      await document
        .querySelector<HTMLElement>(".game-column")!
        .requestFullscreen();
  } catch {
    setText("game-status", "이 브라우저에서는 전체화면을 지원하지 않습니다.");
  }
};
el<HTMLTextAreaElement>("memo").oninput = () =>
  persist(`playroom-memo-${mode}`, el<HTMLTextAreaElement>("memo").value);
el("export").onclick = () => {
  const report = Object.entries(descriptions).map(([key, d]) => {
    const m = key as Mode;
    return {
      게임: d.title,
      평가: Object.fromEntries(
        ratingLabels.map((label, i) => [label, votes[`${m}-${i}`] ?? "미평가"]),
      ),
      메모: readMemo(m),
      플레이시간초: Math.floor(states[m].time),
      성장미리보기사용: states[m].grown,
    };
  });
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "playroom-comparison.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause(true);
});
switchMode("defense");

class ShowroomScene extends Phaser.Scene {
  worldRenderer!: WorldRenderer;
  surface!: Phaser.Textures.CanvasTexture;
  keys = new Set<string>();
  uiTimer = 0;
  constructor() {
    super("showroom");
  }
  create() {
    this.keys.clear();
    this.uiTimer = 0;
    this.surface = this.textures.createCanvas("world", 960, 660)!;
    this.worldRenderer = new WorldRenderer(this.surface.canvas);
    this.add.image(0, 0, "world").setOrigin(0);
    const listeners = new AbortController();
    const cleanup = () => {
      listeners.abort();
      this.keys.clear();
      this.textures.remove("world");
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (!paused) {
        el("game").focus({ preventScroll: true });
        states[mode].click({ x: p.x, y: p.y });
        sync();
      }
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!paused && mode === "hunt" && p.isDown)
        states[mode].target = {
          x: Phaser.Math.Clamp(p.x, 45, 915),
          y: Phaser.Math.Clamp(p.y, 100, 570),
        };
    });
    window.addEventListener("keydown", (e) => {
      if (
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "INPUT"
      )
        return;
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "w",
          "a",
          "s",
          "d",
        ].includes(e.key)
      ) {
        if (mode === "hunt" && document.activeElement === el("game"))
          e.preventDefault();
        this.keys.add(e.key.toLowerCase());
      }
    }, { signal: listeners.signal });
    window.addEventListener("keyup", (e) =>
      this.keys.delete(e.key.toLowerCase()),
      { signal: listeners.signal },
    );
    window.addEventListener("blur", () => this.keys.clear(), {
      signal: listeners.signal,
    });
  }
  update(_time: number, delta: number) {
    const dt = Math.min(delta / 1000, 0.05);
    if (!paused && !document.hidden) {
      const typing = document.activeElement?.tagName === "TEXTAREA";
      const x = typing
        ? 0
        : Number(this.keys.has("d") || this.keys.has("arrowright")) -
          Number(this.keys.has("a") || this.keys.has("arrowleft"));
      const y = typing
        ? 0
        : Number(this.keys.has("s") || this.keys.has("arrowdown")) -
          Number(this.keys.has("w") || this.keys.has("arrowup"));
      states[mode].update(dt, { x, y });
    }
    this.worldRenderer.render(states[mode]);
    this.surface.refresh();
    this.uiTimer += dt;
    if (this.uiTimer > 0.15) {
      sync();
      this.uiTimer = 0;
    }
  }
}
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 960,
  height: 660,
  backgroundColor: "#233b44",
  scene: ShowroomScene,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true },
  audio: { noAudio: true },
  banner: false,
});
