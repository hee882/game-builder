# 심해 전초기지(Abyss Outpost) — 1라운드 기술 설계

> ## ⚠️ R3 주의 — 일부 내용은 대체되었습니다
> 2라운드 교차 검토에서 코디네이터가 충돌을 확정했습니다. **구현의 단일 출처는 [docs/outpost-decisions.md](outpost-decisions.md) 와 `src/outpost/contract.ts` 입니다.**
> 이 문서에서 무효가 된 부분: **방어 방향**(§4.1 레이아웃 2종은 코어 위/분출구 아래 — 확정은 **코어 아래(행 10~11)·분출구 위(행 0)**), **§5 계약 본문**(동결된 `contract.ts`로 대체), **§6 경제 수치**(decisions §3으로 대체 — 특히 **유한 인양 리저브** 도입), **§6.6 설계도(blueprint) 재건**(→ `retryWave` 재시도로 대체), **§11 저장 스키마**(→ `contract.ts`의 `MetaSave`/`RunSave`), **모듈 10종 파일명**(→ decisions §6의 동결 경로). 나머지(가중 벽 돌파 Dijkstra, 9×12, Canvas 2D, 8웨이브 2장, 식별자, 테스트·수락 계획)는 그대로 유효합니다.

> **산출물 성격**: 기술 설계 문서 단독. 구현·커밋·git 작업 없음. 이 파일(`docs/outpost-architecture.md`)만 이 작업의 소유입니다.
> **개정 R2**: 코디네이터 지시(범위 축소, 터치 크기, 모듈 수 축소)를 반영했습니다. 변경 내역은 §0.2.

## 0. 요약

### 0.1 한 장 요약

기존 아비스 다이버(반복적·쉬움)를 대체할 **한국어 모바일 전략/방치 하이브리드**의 수직 슬라이스. 세션 목표 12~15분.

```
안전한 건설 단계 → 직접 인양(수동 조작) → 그리드 방어 배치(초크) → 웨이브 방어 → 자동화 위임 → 2장 전환
      ↑                                                                                            │
      └───────────────────── 실패·재건(설계도 + 영구 통찰) ←──────────────────────────────────────────┘
```

| 사용자 요구 | 기술적 대응 | 섹션 |
|---|---|---|
| 빠르고 눈에 보이는 성장 | 10초 첫 건설 · 25초 첫 터렛 · **웨이브는 플레이어가 시작**(조기 시작 +25% 보상) | §6.5 |
| 자동화 편의 | 드론 역할(인양/정비) + 벽 자동 재건. 단 수동 인양이 항상 1.7배 효율 | §7 |
| 숨겨진 해금 | 행동으로만 발견되는 3종 + 달성률 60%에서 암호 같은 암시 | §8.2 |
| 스타크래프트식 초크·기지 배치 | 정수 Dijkstra 흐름장에서 **벽을 통행 비용으로 취급** → 완전 봉쇄 불가, 굴착체가 뚫음 | §4 |
| 직접 조작 | 잠수정 직접 이동 + 액티브 2종(정밀 판정 창) | §9 |
| 반복적이지 않음·쉽지 않음 | 8웨이브 동안 **카운터가 계속 바뀌는** 적 4역할 + 보스, 전략 3종 모두 약점 보유 | §6.4, §13 |

기술 결정: **새 의존성 0, 서버 0, 외부 자산 0**. 순수 TypeScript 시뮬레이션(DOM 미접촉) + Canvas 2D 렌더러 + DOM HUD. 이 엔트리는 Phaser를 쓰지 않습니다(§12 R8).

### 0.2 개정 R2에서 줄인 것 (코디네이터 지시 반영)

| 항목 | R1 초안 | **R2 확정** |
|---|---|---|
| 웨이브 | 10 + 바이옴2 3웨이브 | **8웨이브 · 2장**(1장 1~4, 2장 5~8, 보스 8) |
| 그리드 | 14×20 (360px에서 26px) | **9×12 (360px에서 40px)** + 탭 확정 고스트 + 안전 건설 단계 |
| 건물 | 9종 | **6종**(격벽·수집기·작살·박격포·드론정비고·공명기[숨은해금]) |
| 적 | 6종 + 보스 | **4역할 + 보스**, 2장은 역할별 «정예» 변형으로 카운터를 바꿈 |
| 액티브 | 4종 | **2종**(소나 충격파, 긴급 용접) |
| 자동화 | 6축 | **2축**(드론 역할, 벽 자동 재건) + 터렛 타겟 정책 1줄 |
| 숨은 해금 | 5종 | **3종** |
| 자원 | scrap·biomass·plasma | **scrap·biomass** + 영구 `insight` |
| 모듈 파일 | 20 | **10 + html**(계약/sim/content/path/save · renderer/layout · hud/format/main+css) |

잘라낸 것(차기 후보로만 기록): 전류 코일, 정비 노드, 차폐막, 공명체(EMP), 굴착체(burrower), 견인 작살, 과부하, 자동 강화, 자동 웨이브 호출, 숨은 해금 2종(적응 장갑·고요한 기지), 3장 이후.

## 1. 저장소에서 확인한 제약

직접 확인한 내용만 적습니다.

- `package.json`: npm, ESM. `dev`(포트 5197 고정) · `build`(`tsc --noEmit && vite build`) · `check` · `test`(`node --test tests/*.test.mjs`) · `preview` · `android:sync`.
- 의존성: `phaser@^3.90`, `@capacitor/{android,app,filesystem,haptics,share}`, dev `typescript ~5.9.3` + `vite ^7.1`. **추가 없음.**
- `tsconfig.json`: `strict`, `noEmit`, `moduleResolution: "Bundler"`, `allowImportingTsExtensions`, `include: ["src"]`.
- `vite.config.ts`: 입력 3개(`index.html`·`challenge.html`·`showroom.html`), `manualChunks.phaser`, 경고 한계 1300kB.
- 기존 테스트가 `../src/game-state.ts`를 **TS 그대로 import**합니다(Node의 TS 직접 실행). → 새 시뮬레이션도 추가 빌드 없이 단위 테스트 가능. 단 **테스트가 import하는 모듈은 최상위에서 DOM을 만지면 안 됩니다**(`matchMedia`는 함수/클래스 내부에서만 — 기존 `renderer.ts`도 클래스 필드에서 호출).
- `src/progression.ts`의 `loadProfile`이 이미 **버전 확인 → 필드별 클램프 → 화이트리스트 → try/catch 폴백** 패턴입니다. 새 저장 검증은 이를 계승합니다(§11).
- `src/arcade-run.ts`에 **정밀 판정**(`meter`, `perfectWidth`, `perfects`)이 있습니다. 액티브 설계가 이 감각을 계승합니다.
- `src/renderer.ts`는 코드 드로잉 Canvas 2D 헬퍼만 씁니다(이미지 자산 0). 새 렌더러도 동일.
- `index.html`의 아비스 다이버는 단일 파일 + 검증 없는 `JSON.parse` + 2초 주기 저장. 새 게임은 **모듈 분리 + 스키마 검증**으로 교체합니다.
- `.gitignore`에 `dist/` 포함 → 빌드 산출물 커밋 금지.

## 2. 수직 슬라이스 범위 (Definition of Done)

**포함**

1. 1장 «대륙붕 잔해»(9×12 손작성 레이아웃), 웨이브 1~4.
2. 2장 «열수 분출구»(다른 9×12 레이아웃), 웨이브 5~8, 8웨이브 보스 «리바이어던». 적 4역할에 «정예» 변형(장갑 3 · 속도 +15%) 적용.
3. 건물 6종 + 강화 3단계.
4. 적 4역할 + 보스.
5. 액티브 2종(정밀 판정), 잠수정 직접 조작.
6. 자동화 2축 + 터렛 타겟 정책.
7. 테크 4종, 숨은 해금 3종, 영구 퍼크 3종.
8. 실패·재건: 부분 실패(침수) + 붕괴 후 설계도·통찰 유지.
9. 저장/복원 + 스키마 검증 + 오프라인 수익 상한.
10. 반응형 DOM HUD(360px 세로 ~ 데스크톱), 축소 모션·사운드·30/60fps 토글.

**제외**: 절차적 레이아웃 생성(손작성만), 서버·계정·랭킹·광고·결제, 외부 이미지/오디오 자산, 3장 이상, 유닛 생산, Phaser 통합, Android 신규 작업(기존 `android:sync` 경로로 자동 포함).

**체감 목표**: 첫 붕괴는 보통 웨이브 5~7, 2회차는 같은 지점까지 ≤ 80% 시간.

## 3. 모듈 구조와 소유권 (병렬 구현자 3인)

코디네이터 지시대로 파일 수를 10개 + 엔트리 1개로 묶었습니다.

```
src/outpost/
  contract.ts    [A]  동결된 공용 타입·인터페이스(단일 진실 공급원)
  content.ts     [A]  데이터 테이블: 레이아웃 문자열, 건물·적·웨이브·테크·해금·퍼크
  path.ts        [A]  아키타입별 정수 Dijkstra 흐름장
  save.ts        [A]  버전 직렬화 + 엄격 검증(문자열만 주고받음)
  sim.ts         [A]  상태·고정 스텝·명령·유닛·경제·자동화·진행 (파사드 createSim)
  layout.ts      [B]  순수 카메라·피킹·컬링 수학 (노드 테스트 가능, DOM 미접촉)
  renderer.ts    [B]  Canvas 2D 전 레이어 드로잉 + 지형 오프스크린 캐시
  format.ts      [C]  순수 표시 변환: 한국어 라벨·숫자·거부 메시지·힌트 (노드 테스트 가능)
  hud.ts         [C]  DOM HUD·패널·토스트 (변경분만 DOM에 기록)
  main.ts        [C]  부트스트랩·입력·오디오·rAF 루프·localStorage·자동 저장
  outpost.css    [C]  반응형 레이아웃
outpost.html     [C]  새 Vite 엔트리
tests/
  outpost-sim.test.mjs      [A]  스텝·명령·경제·전투·결정성
  outpost-path.test.mjs     [A]  흐름장·아키타입 분기·타이브레이크
  outpost-save.test.mjs     [A]  왕복·적대적 payload
  outpost-balance.test.mjs  [A]  전략 3종·카운터·페이싱·해금 도달성
  outpost-layout.test.mjs   [B]  fitView·피킹 왕복·DPR·최소 타일 크기
  outpost-format.test.mjs   [C]  라벨 전수·숫자 경계·힌트 규칙
docs/outpost-architecture.md     이 문서
```

### 3.1 배타 소유 (병합 충돌 0 규칙)

| 구현자 | 배타 소유 | 읽기 전용 | 금지 |
|---|---|---|---|
| **A 시뮬레이션** | `contract.ts`, `content.ts`, `path.ts`, `save.ts`, `sim.ts`, `tests/outpost-{sim,path,save,balance}.test.mjs` | — | B·C 파일 수정, DOM·`Math.random`·`Date` 사용 |
| **B 렌더러** | `layout.ts`, `renderer.ts`, `tests/outpost-layout.test.mjs` | `contract.ts`(type-only) | sim 수정, 뷰 객체 변형, DOM 이벤트 등록 |
| **C 셸/HUD** | `format.ts`, `hud.ts`, `main.ts`, `outpost.css`, `outpost.html`, `vite.config.ts`(입력 1줄), `README.md`(문단 1개) | `contract.ts`(type-only), `renderer.ts`의 공개 API | sim·renderer 내부 수정 |

- `contract.ts`는 **A가 M0에서 1회 작성하고 동결**합니다. 변경은 코디네이터 경유로만, A 단독 수정. **필드 추가만 허용**, 기존 필드 제거·의미 변경은 M3 이후.
- 기존 `src/*.ts`(쇼룸·챌린지 3종)는 **아무도 수정하지 않습니다**. 기존 테스트는 그대로 통과해야 합니다(§12 R12).
- 공유 파일 충돌 지점은 `vite.config.ts` 한 줄(`input`에 `outpost: 'outpost.html'`)로만 존재하며 C 전담입니다.

### 3.2 마일스톤과 통합 게이트

| | A | B | C | 게이트 |
|---|---|---|---|---|
| **M0 계약** | `contract.ts` + 컴파일 가능한 sim 스텁(고정 더미 뷰) | — | — | `npm run check` 통과 → B·C 동시 착수 |
| **M1 골격** | 그리드·흐름장·적 이동·코어 피해 | 지형·적 렌더, `fitView` | HUD 껍데기, 입력→명령, rAF | 브라우저에서 적이 초크를 따라 코어로 간다 |
| **M2 루프** | 건설·경제·웨이브·잠수정·액티브 | 건물·투사체·FX·건설 고스트 | 건설 독·액티브 버튼·결과 모달 | 웨이브 1~4(1장) 플레이 가능 |
| **M3 깊이** | 자동화·해금·저장·2장·보스 | 2장 팔레트·보스 연출 | 자동화·테크·발견 패널, 저장 UX, 반응형 마감 | §14 수락 체크리스트 전체 |

### 3.3 레이어 경계 규칙 (CLAUDE.md "로직·렌더 분리" 준수)

1. `sim.ts`·`content.ts`·`path.ts`·`save.ts`는 `window`·`document`·`localStorage`·`performance`·`Date`·`Math.random`을 **참조하지 않습니다**. 시간은 인자로 받은 고정 스텝, 무작위는 시드 PRNG뿐.
2. `localStorage` 호출은 `main.ts`에만 존재합니다. `save.ts`는 문자열만 다룹니다.
3. `renderer.ts`는 뷰를 **읽기만** 합니다. 정렬·변형 금지, 프레임 간 참조 보관 금지(인덱스만).
4. `hud.ts`/`main.ts`는 **오직 `sim.issue(command)`**로만 상태를 바꿉니다.
5. 단방향 의존: `main → hud → format → contract`, `main → renderer → layout → contract`, `main → sim → {content,path,save} → contract`. 역방향 import 금지.

## 4. 그리드와 결정적 경로 탐색

> **R3 대체**: 아래 두 레이아웃은 코어가 위에 있습니다. 확정 방향은 **코어 아래·분출구 위**이며 실제 레이아웃 문자열은 `content.ts`가 소유합니다(decisions §3). 경로 모델(가중 벽 돌파 Dijkstra)과 9×12는 유효합니다.

### 4.1 그리드: 9×12 = 108타일

360px 세로 화면에서 타일 **40 CSS px**(9열). 코디네이터 지시(터치 친화)를 반영한 확정치입니다. HUD 컨트롤은 별도로 48px를 씁니다(§10.3).

레이아웃은 **손작성 문자열 아트**로 `content.ts`에 둡니다. 절차 생성 없음 — 밸런스를 고정하고 디자이너가 문서에서 바로 읽고 고칠 수 있게 합니다.

범례: `.` 물(건설 가능) · `#` 암반(이동·건설 불가) · `C` 코어(2×2) · `V` 분출구(스폰) · `W` 잔해(인양 노드, 건설 불가) · `T` 열수(건설 가능, 터렛 피해 +15%, 공명기 전용 타일)

```
1장 «대륙붕 잔해»  (행 0 = 화면 위 = 기지 쪽)
row  0  .##...##.
row  1  ...CC....
row  2  ...CC....
row  3  ....T....
row  4  W.......W
row  5  .##...##.
row  6  .........
row  7  ..#...#..
row  8  W.......W
row  9  ..T...T..
row 10  .........
row 11  .V.....V.
```

```
2장 «열수 분출구»
row  0  .#.....#.
row  1  ....CC...
row  2  ....CC...
row  3  .T.....T.
row  4  .........
row  5  ...W.W...
row  6  .........
row  7  .#.....#.
row  8  ...T.T...
row  9  W.......W
row 10  .........
row 11  .V..V..V.
```

문서 작성 시 파싱으로 검증한 사실:

| | 1장 | 2장 |
|---|---|---|
| 크기 | 9×12, 허용 문자만 사용 | 9×12, 허용 문자만 사용 |
| 코어 | (3,1)(4,1)(3,2)(4,2) | (4,1)(5,1)(4,2)(5,2) |
| 분출구 | (1,11) (7,11) — 2곳 | (1,11) (4,11) (7,11) — **3곳** |
| 잔해 | (0,4) (8,4) (0,8) (8,8) — 바깥 레인 | (3,5) (5,5) (0,9) (8,9) — **중앙 포함** |
| 열수 | (4,3) (2,9) (6,9) — 3곳 | (1,3) (7,3) (3,8) (5,8) — 4곳 |
| 암반 | 10타일, 5행에서 개방 열 `0 / 3,4,5 / 8` → **천연 3레인** | 4타일, 천연 초크 **없음** |
| 건설 가능 타일 | 88 | 93 |
| 연결성 | 모든 분출구 → 코어 도달 가능 | 모든 분출구 → 코어 도달 가능 |
| 벽 없는 분출구→코어 최단(타일) | 12 / 14 | 13 / **10** / 13 |

설계 의도: **1장은 천연 초크를 "읽는" 법을, 2장은 초크를 "만드는" 법을 가르칩니다.** 2장은 분출구가 3곳이고 중앙이 열려 있어 1장 해법(천연 초크에 박격포 집중)이 통하지 않습니다. 경제 잔해가 중앙으로 옮겨와 "경제를 지키려면 방어선을 넓혀야 하는" 긴장이 생깁니다.

### 4.2 경로: 벽을 "통행 비용"으로 취급하는 정수 Dijkstra 흐름장

핵심 결정입니다. 벽을 통행 불가로 두면 완전 봉쇄로 게임이 끝나고, "경로가 없을 때만 벽을 때린다"는 특수 분기는 구현이 번집니다. 그래서:

> 모든 타일은 통행 가능하다. 벽 타일의 통행 비용이 매우 클 뿐이다.

```
cost(tile, class) =
  암반        → 제외(무한)
  빈 물·열수   → 10
  비벽 구조물  → 10 + 120        (부수고 지나갈 수 있음)
  격벽        → 10 + wallCost(class)
```

`wallCost`(정수, `content.ts`의 유일한 출처): `ground 400`, `breaker 40`, `siege 20`, `flyer`는 §4.4.

결과 두 가지가 **특수 분기 없이** 나옵니다.

1. **완전 봉쇄 불가**: 우회로가 벽 1장보다 비싸지면 적은 가장 싼 벽을 뚫습니다 → 스타크래프트의 "막으면 때려 부순다".
2. **레이아웃 의존적 적 선택**: 같은 레이아웃에서 굴착체(40)는 미로를 무시하고 거의 직진으로 뚫고, 표류체(400)는 긴 우회를 택합니다. 적의 "판단"이 데이터 한 숫자로 표현됩니다.

구현 규약:

- **정수 전용 Dijkstra + 버킷 큐**(비용 10~410 정수 → 부동소수 오차·정렬 불안정 원천 차단). 코어 4타일에서 역방향 전파.
- 출력: `dist: Int32Array(108)` + `flow: Int8Array(108)`(0=상,1=좌,2=우,3=하, -1=없음).
- **타이브레이크 고정**: 같은 `dist`면 방향 인덱스 작은 쪽(상→좌→우→하), 2차로 타일 인덱스(`y*W+x`). 난수·삽입 순서 의존 없음.
- 필드는 클래스 3종(`ground`, `breaker`, `flyer`)만 유지합니다(`siege`는 보스 1기뿐이라 `breaker` 필드를 쓰고 벽 피해량만 다릅니다).
- **재계산**: 레이아웃 변경(건설·판매·파괴·침수)은 `fieldVersion++`와 dirty 플래그만 올리고, 다음 고정 스텝 **시작 시 1회**만 계산합니다. 3필드 × 108타일 ≈ 324 완화 연산 → 무시 가능.
- **진동 방지**: 적은 "현재 목표 타일"을 보관하고 타일 중심 도달 시에만 `flow`를 다시 읽습니다. 동일 비용 대안이 생기면 **현재 진행 방향을 우선**합니다.
- `layout.ts`/`renderer.ts`는 경로를 다시 계산하지 않고, 오버레이용으로 `dist`를 읽기만 합니다(계약에 `pathHint` 제공, §5.3).

### 4.3 브리칭(벽 공격)

다음 이동 대상 타일에 구조물이 있으면 이동 대신 공격합니다.

| 역할 | 벽 피해 | 의미 |
|---|---|---|
| `breacher` 굴착체 | 18 dps | 미로를 정면에서 해체 |
| `leviathan` 보스 | 60 dps | 방어선 재건 속도를 시험 |
| `drifter` 표류체 | 6 dps | 완전 봉쇄는 결국 뚫린다(느리게) |
| `swarm` 군체 | 3 dps | 사실상 우회 선택 |
| `glider` 부유체 | — | 벽을 넘어간다 |

구조물 파괴 시 타일이 비고 `fieldVersion++` → 같은 스텝에 전체 경로가 자연스럽게 재평가됩니다.

### 4.4 비행: 미로의 한계를 설계로 보장

`glider`는 `flyer` 필드를 씁니다. 이 필드는 **암반·격벽·구조물을 모두 비용 10으로** 취급(= 직선 거리)하므로 미로가 완전히 무효입니다. 대응 가능한 건물은 `harpoon`·`resonator`뿐이고 `mortar`는 지상 전용입니다 → **미로 전략은 코어 근처 대공 앵커를 반드시 지어야 합니다.**

### 4.5 결정성 계약

동일 `seed` + 동일 명령 로그(스텝 번호 포함) → 동일 상태. `sim.digest()`로 검증하고 `outpost-sim.test.mjs`가 두 인스턴스를 비교합니다.

금지(코드 리뷰 체크 항목): `Math.random`, `Date.now`, `performance.now`, 가변 dt, `Set`/`Map` 순회 순서 의존 분기, 부동소수 누적 동등 비교, 객체 생성 순서 외 정렬 키 없는 `sort`.

## 5. TypeScript 공개 계약 (`src/outpost/contract.ts`)

> **R3 대체**: 이 절은 초안입니다. 동결된 계약은 실제 파일 `src/outpost/contract.ts`이며, 리저브·해금 진행·장 클리어·재시도 뷰와 `preview()`가 추가되었습니다.

> 이 섹션이 다음 라운드 구현의 **계약 본문**입니다. A는 M0에서 그대로 옮기고 동결합니다. B·C는 `import type`만 사용합니다.

### 5.1 기본 타입

```ts
/** 타일 인덱스 = y * GRID_W + x. 0..107 */
export type TileIndex = number;
/** 고정 스텝 번호. 1 tick = 1/30초 */
export type Tick = number;

export const GRID_W = 9;
export const GRID_H = 12;
export const TILE_COUNT = 108;
export const TICK_SECONDS = 1 / 30;
export const MAX_ENEMIES = 80;          // 동시 개체 상한(성능·폭증 방지)

export type Vec2 = { readonly x: number; readonly y: number };   // 타일 단위 실수 좌표

export type TerrainKind = 'water' | 'rock' | 'core' | 'vent' | 'wreck' | 'thermal';
export type ChapterId = 1 | 2;
export type ResourceId = 'scrap' | 'biomass';
export type Resources = Readonly<Record<ResourceId, number>>;

export type BuildingId =
  | 'bulkhead'    // 격벽: 경로 비용. 공격 없음
  | 'collector'   // 수집기: 잔해 인접 필수. 자동 고철 수입
  | 'harpoon'     // 작살: 단일 타겟. 지상+공중
  | 'mortar'      // 박격포: 폭발. 지상 전용. 최소 사거리 있음
  | 'droneBay'    // 드론 정비고: 자동화(인양/정비)
  | 'resonator';  // 공명기: 열수 타일 전용, 방어 무시 광역 — 숨은 해금

export type EnemyRole = 'drifter' | 'swarm' | 'breacher' | 'glider' | 'leviathan';
export type EnemyVariant = 'base' | 'elite';      // 2장은 elite(장갑 3 · 속도 +15%)
export type PathClass = 'ground' | 'breaker' | 'flyer';
export type AbilityId = 'sonarPulse' | 'weld';
export type TechId = 'piercingHarpoon' | 'wideBlast' | 'reinforcedWalls' | 'droneLogistics';
export type DiscoveryId = 'ventResonance' | 'flawlessPair' | 'deepArchaeology';
export type PerkId = 'startScrap' | 'subSpeed' | 'wallHp';
export type TargetPolicy = 'nearest' | 'leader' | 'air';   // leader = 코어에 가장 가까운 적
/** build = 안전 건설 단계(시간 제한 없음). 플레이어가 웨이브를 시작한다 */
export type Phase = 'build' | 'wave' | 'collapsed' | 'cleared';
```

### 5.2 명령: UI → Sim 의 **유일한** 경로

```ts
export type SimCommand =
  | { readonly kind: 'build'; readonly tile: TileIndex; readonly building: BuildingId }
  | { readonly kind: 'upgrade'; readonly tile: TileIndex }
  | { readonly kind: 'sell'; readonly tile: TileIndex }
  | { readonly kind: 'setPolicy'; readonly tile: TileIndex; readonly policy: TargetPolicy }
  | { readonly kind: 'placeBlueprint' }                    // 재건 가속: 1회, 50% 비용
  | { readonly kind: 'moveSub'; readonly to: Vec2 }
  | { readonly kind: 'ability'; readonly ability: AbilityId; readonly at: Vec2 }
  | { readonly kind: 'startWave' }                         // 안전 건설 단계 종료
  | { readonly kind: 'research'; readonly tech: TechId }
  | { readonly kind: 'setAutomation'; readonly key: AutomationKey; readonly value: number }
  | { readonly kind: 'advanceChapter' }                    // 1장 클리어 후 2장 진입
  | { readonly kind: 'spendInsight'; readonly perk: PerkId };

export type AutomationKey =
  | 'droneRole'          // 0 = 인양, 1 = 정비, 2 = 혼합
  | 'autoRebuildWalls';  // 0 | 1

export type RejectReason =
  | 'notEnoughResources' | 'tileOccupied' | 'tileNotBuildable' | 'outOfBounds'
  | 'buildingLocked' | 'maxLevel' | 'notAdjacentToWreck' | 'thermalOnly'
  | 'onCooldown' | 'wrongPhase' | 'noBlueprint' | 'alreadyResearched'
  | 'chapterLocked' | 'notEnoughInsight' | 'perkMaxed' | 'subDowned';

export type CommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: RejectReason };
```

거부는 **반드시 이유를 반환**하며 상태를 전혀 바꾸지 않습니다. HUD가 한국어 토스트로 변환합니다(`format.ts`의 `rejectMessage`).

### 5.3 뷰: Sim → Renderer / HUD

프레임당 할당 0을 위해 `view()`는 **항상 같은 객체**를 돌려줍니다. 배열도 재사용되며 `*Count`가 유효 길이입니다(풀링). 읽는 쪽은 **동결된 것처럼** 취급합니다.

```ts
export interface EnemyView {
  readonly id: number;
  readonly role: EnemyRole;
  readonly variant: EnemyVariant;
  readonly pos: Vec2;            // 현재 스텝 위치(타일 단위)
  readonly prev: Vec2;           // 직전 스텝 위치 — 렌더러 보간용
  readonly hp: number;
  readonly maxHp: number;
  readonly facing: number;       // 라디안
  readonly slowTicks: number;
  readonly breaching: boolean;   // 구조물 타격 중
}

export interface BuildingView {
  readonly tile: TileIndex;
  readonly id: BuildingId;
  readonly level: number;         // 0..2 (3단계)
  readonly hp: number;
  readonly maxHp: number;
  readonly charge: number;        // 0..1 발사 충전(연출)
  readonly aim: number;           // 라디안
  readonly policy: TargetPolicy;
  readonly onThermal: boolean;    // 피해 +15% 표시용
}

export interface ShotView {
  readonly from: Vec2; readonly to: Vec2;
  readonly kind: 'harpoon' | 'mortar' | 'resonator' | 'pulse';
  readonly life: number;          // 1 → 0
}

export interface DroneView { readonly pos: Vec2; readonly prev: Vec2; readonly role: 'harvest' | 'repair'; readonly carrying: number; }
export interface WreckView { readonly tile: TileIndex; readonly richness: number; }   // 1 → 0.5

export interface AbilityStateView {
  readonly id: AbilityId;
  readonly unlocked: boolean;
  readonly cooldown: number;       // 남은 초
  readonly cooldownMax: number;
  readonly meter: number;          // 0..1 왕복 — 정밀 판정 게이지
  readonly perfectWindow: number;  // 0..1 폭
}

export interface SubView {
  readonly pos: Vec2; readonly prev: Vec2;
  readonly hp: number; readonly maxHp: number;
  readonly downedTicks: number;    // > 0 이면 부활 대기
  readonly harvesting: boolean;
  readonly abilities: readonly AbilityStateView[];   // 길이 2
}

export interface WaveView {
  readonly index: number;          // 1..8
  readonly total: number;          // 8
  readonly phase: Phase;
  readonly buildSeconds: number;   // 건설 단계 경과(증가). 조기 시작 보너스 판정용
  readonly spawnRemaining: number;
  readonly composition: readonly { readonly role: EnemyRole; readonly variant: EnemyVariant; readonly count: number }[];
  readonly earlyBonusActive: boolean;   // buildSeconds <= 10 에서 시작했다
}

export interface SimView {
  readonly tick: Tick;
  readonly chapter: ChapterId;
  readonly terrain: Readonly<Int8Array>;     // TerrainKind 인덱스, 길이 108
  readonly flooded: Readonly<Int8Array>;     // 0 또는 남은 웨이브 수
  readonly pathHint: Readonly<Int32Array>;   // ground 필드 dist — 경로 오버레이용(읽기 전용)
  readonly fieldVersion: number;             // 지형·구조물 변경 카운터(캐시 무효화)
  readonly resources: Resources;
  readonly incomePerSecond: Resources;       // HUD 표시용 추정치
  readonly core: { readonly hp: number; readonly maxHp: number };
  readonly wave: WaveView;
  readonly sub: SubView;
  readonly enemies: readonly EnemyView[];      readonly enemyCount: number;
  readonly buildings: readonly BuildingView[]; readonly buildingCount: number;
  readonly shots: readonly ShotView[];         readonly shotCount: number;
  readonly drones: readonly DroneView[];       readonly droneCount: number;
  readonly wrecks: readonly WreckView[];
  readonly unlockedBuildings: readonly BuildingId[];
  readonly researched: readonly TechId[];
  readonly discovered: readonly DiscoveryId[];
  readonly hints: readonly { readonly id: DiscoveryId; readonly text: string }[];  // 달성률 60%+ 암시
  readonly insight: number;
  readonly perks: Readonly<Record<PerkId, number>>;
  readonly automation: Readonly<Record<AutomationKey, number>>;
  readonly blueprint: readonly { readonly tile: TileIndex; readonly building: BuildingId }[];
  readonly stats: {
    readonly manualSalvage: number; readonly autoSalvage: number;
    readonly kills: number; readonly wallsLost: number;
    readonly perfects: number; readonly abilityUses: number;
    readonly leaks: number; readonly elapsed: number;
  };
}
```

### 5.4 이벤트: 1회성 연출·사운드 신호

```ts
export type SimEvent =
  | { readonly kind: 'built'; readonly tile: TileIndex; readonly building: BuildingId }
  | { readonly kind: 'destroyed'; readonly tile: TileIndex; readonly building: BuildingId }
  | { readonly kind: 'enemyKilled'; readonly at: Vec2; readonly role: EnemyRole; readonly biomass: number }
  | { readonly kind: 'coreHit'; readonly damage: number }
  | { readonly kind: 'gain'; readonly at: Vec2; readonly resource: ResourceId; readonly amount: number }
  | { readonly kind: 'abilityCast'; readonly ability: AbilityId; readonly at: Vec2; readonly perfect: boolean }
  | { readonly kind: 'subDowned'; readonly at: Vec2 }
  | { readonly kind: 'waveStart'; readonly index: number }
  | { readonly kind: 'waveClear'; readonly index: number; readonly flawless: boolean }
  | { readonly kind: 'discovered'; readonly id: DiscoveryId }
  | { readonly kind: 'unlocked'; readonly building: BuildingId }
  | { readonly kind: 'flooded'; readonly tiles: readonly TileIndex[] }
  | { readonly kind: 'chapterEntered'; readonly chapter: ChapterId }
  | { readonly kind: 'collapsed'; readonly wave: number };
```

`drainEvents()`는 큐를 비웁니다. **`main.ts`가 프레임당 1회만 drain 해서 같은 배열을 renderer·hud 양쪽에 전달합니다**(이중 drain 금지 — 계약 사항).

### 5.5 시뮬레이션 파사드

```ts
export interface OutpostSim {
  /** 실제 경과 시간을 누적해 고정 스텝으로 진행. 반환값 = 실행한 스텝 수. 호출당 최대 6스텝. */
  advance(realSeconds: number): number;
  /** 테스트·결정성 검증용. 정확히 1스텝. */
  step(): void;
  issue(command: SimCommand): CommandResult;
  view(): SimView;                        // 항상 같은 객체 참조
  drainEvents(): readonly SimEvent[];
  readonly alpha: number;                 // 마지막 스텝 이후 비율 0..1 (보간용)
  serialize(): string;
  digest(): string;                       // 결정성 테스트용 FNV-1a 해시
}

export interface SimOptions {
  readonly seed: number;
  readonly save?: string | null;           // 있으면 검증 후 복원, 실패 시 새 게임
  readonly offlineSeconds?: number;        // 오프라인 정산 입력. sim은 시간을 직접 조회하지 않는다
}

export declare function createSim(options: SimOptions): OutpostSim;     // sim.ts
```

### 5.6 렌더러 계약

```ts
export interface GhostState {
  readonly tile: TileIndex;
  readonly building: BuildingId;
  readonly valid: boolean;
  readonly sealsPath: boolean;    // 완전 봉쇄 경고 표시(적이 벽을 뚫게 된다)
}

export interface OutpostRenderer {
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  /** 매 rAF 1회. alpha로 적·드론·잠수정을 prev→pos 보간한다. */
  draw(view: SimView, events: readonly SimEvent[], alpha: number): void;
  setGhost(ghost: GhostState | null): void;
  pickTile(cssX: number, cssY: number): TileIndex;   // 캔버스 밖이면 -1
  pickPoint(cssX: number, cssY: number): Vec2;       // 잠수정 이동·액티브 조준
  setReducedMotion(value: boolean): void;
  setFrameSkip(skip: boolean): void;                 // 30fps 설정
  destroy(): void;
}

export declare function createRenderer(canvas: HTMLCanvasElement): OutpostRenderer;
```

- 좌표 수학은 `layout.ts`의 순수 함수(`fitView`, `tileToScreen`, `screenToTile`)에 있고 노드에서 단위 테스트합니다.
- 렌더러는 **DOM 이벤트를 등록하지 않습니다**. 입력은 전부 `main.ts`가 받아 `pickTile`/`pickPoint`로 변환합니다.
- 지형 레이어는 `fieldVersion`·`chapter`·캔버스 크기 변경 시에만 오프스크린 캔버스를 다시 그립니다.

### 5.7 HUD 계약

```ts
export interface OutpostHud {
  sync(view: SimView, events: readonly SimEvent[]): void;   // rAF당 1회, 변경분만 DOM에 기록
  toast(reason: RejectReason): void;
  setBuildSelection(building: BuildingId | null): void;
  destroy(): void;
}

export declare function createHud(
  root: HTMLElement,
  dispatch: (command: SimCommand) => CommandResult,
): OutpostHud;
```

`sync`는 이전 값과 달라진 노드만 `textContent`/`classList`를 수정합니다. **전체 `innerHTML` 재생성 금지**(§12 R2).

### 5.8 순수 표시 계약 (`format.ts`)

```ts
export declare const BUILDING_LABELS: Readonly<Record<BuildingId, { name: string; short: string; hint: string }>>;
export declare const ENEMY_LABELS: Readonly<Record<EnemyRole, { name: string; counter: string }>>;
export declare const ABILITY_LABELS: Readonly<Record<AbilityId, { name: string; hint: string }>>;
export declare const REJECT_MESSAGES: Readonly<Record<RejectReason, string>>;
export declare function formatNumber(value: number): string;          // 1.2천 / 3.4만
export declare function formatRate(perSecond: number): string;        // "+3.2/초"
export declare function rejectMessage(reason: RejectReason): string;
export declare function affordability(view: SimView, building: BuildingId):
  'ok' | 'locked' | 'tooExpensive';
```

`Record<…>` 전체 키 매핑이므로 **라벨이 하나라도 빠지면 타입 에러**가 납니다(한국어 누락 방지 장치).

## 6. 경제·웨이브·페이싱

> **R3 대체**: 확정 수치는 decisions §3, 건설 단계 수입 상한은 decisions §2(유한 인양 리저브)입니다.

모든 수치는 `content.ts`의 단일 테이블 상수입니다. 코드 어디에도 복제하지 않습니다 — 다음 라운드의 디자이너 검토가 **이 테이블만** 고치면 밸런스가 전부 반영됩니다.

### 6.1 자원

| 자원 | 획득 | 용도 | 시작값 |
|---|---|---|---|
| `scrap` 고철 | 잔해 인양(수동/수집기/드론), 구조물 판매 50% 환급 | 모든 건설·강화 | 80 (+`startScrap` 퍼크) |
| `biomass` 생체물질 | 적 처치 | 박격포·드론정비고·공명기, 테크 4종 | 0 |
| `insight` 통찰(영구) | 웨이브 최초 클리어 +1, 숨은 해금 +3, 2장 진입 +8 | 영구 퍼크 3종 | 저장에 누적 |

### 6.2 수입과 «수동 우위» 원칙

| 출처 | 초당 | 비고 |
|---|---|---|
| 잠수정 수동 인양 | **5.5** scrap/s | 잔해에 인접 + 정지 상태 |
| 수집기 lv0 / lv1 / lv2 | 3.2 / 5.0 / 7.7 | 잔해에 직교 인접 필수 |
| 인양 드론 1기 | 3.3 | 수동의 60%. `droneLogistics` 테크로 4.0 |
| 잔해 `richness` | 1.0 → 0.5 | 120초 선형 감쇠, 웨이브 클리어마다 +0.2 회복(상한 1.0) |

수동(5.5) > 수집기 lv0(3.2) > 드론(3.3)의 순서를 **테스트로 고정**합니다(§13.1-7). 자동화는 *편의*이지 *최적*이 아니므로 "방치로도 굴러가지만 손을 쓰면 더 빠르다"가 성립합니다. 강화한 수집기(7.7)가 수동을 넘는 것은 의도된 후반 전환입니다 — 자원을 투자해야 얻는 결과이기 때문입니다.

### 6.3 건물 6종

| 건물 | 비용 | HP | 공격 | 발사 | 사거리 | 대상 | 해금 |
|---|---|---|---|---|---|---|---|
| `bulkhead` 격벽 | 12 고철 | 120 | — | — | — | — | 시작 |
| `collector` 수집기 | 30 고철 | 70 | — | — | 인접 잔해 | — | 시작 |
| `harpoon` 작살 | 45 고철 | 90 | 9 | 1.25/s | 3.0 | 지상+공중 | 시작 |
| `mortar` 박격포 | 80 고철 + 10 생체 | 110 | 22 (폭발 r1.3) | 0.55/s | 4.0 (최소 1.2) | **지상 전용** | 2웨이브 클리어 |
| `droneBay` 드론 정비고 | 100 고철 + 20 생체 | 130 | — | — | — | 드론 1기(+1/강화, 최대 3) | 3웨이브 클리어 |
| `resonator` 공명기 | 110 고철 + 30 생체 | 90 | 14 (r1.8, **방어 무시**) | 0.63/s | 1.8 | 지상+공중 | **숨은 해금** `ventResonance` |

- 강화 3단계(`level 0..2`): 비용 `base × 1.8^level`, 효과 `×1.55`. 격벽은 HP만 `×1.7`.
- 판매는 투입 자원의 50%만 환급 → 왕복 악용 불가(순손실 존재).
- **열수 타일** 위 공격 건물은 피해 +15%. 공명기는 열수 **전용**(다른 타일에서 `thermalOnly` 거부).

### 6.4 적 4역할 + 보스 — 카운터가 바뀌는 구조

기본 스탯(웨이브 n에서 HP `× (1 + 0.2 × (n-1))`):

| 역할 | HP | 속도(타일/s) | 경로 클래스 | 벽 피해 | 코어 피해 | 생체 | 카운터 |
|---|---|---|---|---|---|---|---|
| `drifter` 표류체 | 30 | 1.4 | ground(벽 비용 400) | 6 dps | 6 | 3 | 경로 연장 + 단일 타겟 |
| `swarm` 군체 | 10 | 2.2 | ground | 3 dps | 2 | 1 | **폭발(박격포)** |
| `breacher` 굴착체 | 90 | 0.9 | breaker(40) | 18 dps | 10 | 9 | 2선 방어 + 벽 재건 |
| `glider` 부유체 | 45 | 1.7 | flyer(벽 무시) | — | 6 | 5 | **코어 근처 대공(작살/공명기)** |
| `leviathan` 리바이어던(보스) | 900 | 0.7 | siege(20) | 60 dps | 40 | 60 | 지속 DPS + 재건 + 액티브 타이밍 |

2장에서는 같은 4역할에 **«정예» 변형**이 붙습니다: **장갑 3(피해 정액 감소) · 속도 +15% · HP ×1.35**. 장갑 3은 작살(9→6)과 박격포(22→19)를 깎지만 공명기(방어 무시)와 `piercingHarpoon` 테크는 그대로 들어갑니다 → **2장에서 최적 조합이 1장과 달라집니다.** 새 적 종류를 추가하지 않고 카운터를 바꾸는 방식입니다.

### 6.5 웨이브 8개 · 2장

**안전 건설 단계**: 웨이브 사이에는 `phase: 'build'`이며 **시간 제한이 없습니다**. 적이 없고, 건설·강화·연구·배치 변경이 자유롭습니다. 플레이어가 `startWave`로 시작합니다(모바일 오터치 대비 — 코디네이터 지시).
**조기 시작 보너스**: 건설 단계 경과 10초 이내에 시작하면 해당 웨이브의 고철 보상 +25%. 빠른 성장 욕구에 레버를 주면서, 느린 플레이를 처벌하지는 않습니다.

| # | 장 | 구성 | 새로 요구되는 대응 |
|---|---|---|---|
| 1 | 1장 | 표류체 ×6 | 학습: 작살 1기 + 수집기 |
| 2 | 1장 | 표류체 ×8, 군체 ×10 | 단일 타겟 한계 → **박격포 해금** |
| 3 | 1장 | 굴착체 ×2, 표류체 ×6 | **벽이 뚫린다** → 2선 배치, 드론정비고 해금 |
| 4 | 1장 | 부유체 ×6, 군체 ×12 | **미로 무효** → 코어 근처 대공 앵커 |
| 5 | 2장 | 표류체 정예 ×10, 굴착체 ×3 | **장갑 3** → 관통 테크 또는 공명기 |
| 6 | 2장 | 부유체 정예 ×8, 군체 정예 ×16 | 공중+지상 동시, 경제 규모 요구 |
| 7 | 2장 | 굴착체 정예 ×5, 표류체 정예 ×10, 부유체 ×6 | 3분출구 전방위 — 재건 속도 시험 |
| 8 | 2장 | **리바이어던 ×1** (3초마다 군체 ×2, 총 40 상한) | 지속 DPS + 벽 재건 + 액티브 타이밍 |

1장(웨이브 4) 클리어 시 `advanceChapter`로 2장에 진입합니다(레이아웃·팔레트·적 구성이 동시에 바뀜, `insight +8`).

### 6.6 실패와 재건

- **코어 HP 100.** 누수 1기당 역할별 2~40 피해. 코어 회복은 **액티브 «긴급 용접»만**(+20, 정밀 +30) — 별도 수리 명령 없음. 자원으로 실수를 무한히 덮을 수 없습니다.
- **부분 실패(침수)**: 한 웨이브에서 누수 4회 이상이면 누수 경로의 타일 **4칸이 `flooded`** 가 됩니다. 2웨이브 동안 건설 불가, 그 위 구조물은 파괴 → **레이아웃을 강제로 다시 짜게 만드는 중간 실패**(런을 잃지 않음).
- **붕괴(코어 0)**: `phase: 'collapsed'`. 결과 화면에 통계·획득 통찰·발견을 보여주고
  - 유지: `insight`, 퍼크, 발견 목록, 최고 기록, 설정.
  - 보존: 붕괴 시점 배치 중 최대 **8타일**을 `blueprint`로 저장 → 다음 런에서 `placeBlueprint` 1회로 **50% 비용** 즉시 복원.
  - 초기화: 런 자원·건물·웨이브·테크.
  - 결과: 2회차가 1회차보다 확실히 빠릅니다(목표 ≤ 80% 시간). **벽이 아니라 가속**입니다.

### 6.7 오프라인·백그라운드

- `visibilitychange`에서 타임스탬프를 저장합니다(`main.ts`).
- 복귀 시 `offlineSeconds = min(경과, 7200)`을 `SimOptions.offlineSeconds`로 넘깁니다(sim은 시간을 직접 조회하지 않음).
- **웨이브는 진행하지 않습니다.** 수집기·드론 수입만 **40% 효율**로 정산하고 잔해 감쇠도 함께 적용합니다 → 시계 조작으로 웨이브를 스킵하는 경로가 없습니다.
- 미래·음수 타임스탬프는 0으로 클램프(기기 시간 변경 방어).

### 6.8 페이싱 목표 (테스트로 밴드 고정)

| 시점 | 일어나야 하는 일 |
|---|---|
| 0~10초 | 잠수정이 잔해에 도달해 고철이 오르는 것이 보인다 |
| ~25초 | 첫 작살 + 수집기 1기 |
| 웨이브 2 | 박격포 해금 — 가시적 신규 선택지 |
| 웨이브 3~4 | 드론 가동(자동화 체감) + 대공 필요성 학습 |
| 3~5분 | 1장 클리어 → 2장 전환(레이아웃·색·적이 한꺼번에 바뀜) |
| 9~13분 | 보스 교전 |

웨이브 시작이 플레이어 손에 있으므로 절대 시간은 플레이 성향에 따라 흔들립니다. 그래서 테스트는 **웨이브 단위 순서와 밴드**만 단정합니다(§13.4).

## 7. 자동화 2축 (+ 타겟 정책)

자동화는 "덜 생각하게"가 아니라 **"덜 반복하게"** 가 목표입니다. 둘 다 플레이어가 정책을 정하고 실행만 위임합니다.

| 축 | 플레이어가 정하는 것 | 시뮬레이션이 하는 것 | 해금 |
|---|---|---|---|
| **드론 역할** | 인양 / 정비 / 혼합, 드론 수(정비고 강화) | 인양: `richness` 최대 잔해로 이동해 수집(결정적 argmax: richness 내림 → 거리 → 타일 인덱스). 정비: HP 비율 최저 구조물 수리 6hp/s, 동률이면 코어에 가까운 쪽 | `droneBay` 건설. 역할 분리는 `droneLogistics` 테크 |
| **벽 자동 재건** | on/off | 파괴된 격벽 위치를 기억해 `scrap ≥ 60`이고 해당 타일이 비어 있을 때 1.5초마다 1장 재건 | `reinforcedWalls` 테크 |
| 터렛 타겟 정책 | 터렛별 `nearest`/`leader`/`air` | 해당 규칙의 결정적 argmax(동률 시 적 id 작은 쪽) | 시작부터(1줄 컨트롤) |

`leader`(코어에 가장 가까운 적)는 누수 방지용으로 후반에 사실상 필수이며, `air`는 부유체 웨이브에서 지상 타겟에 낭비되는 발사를 막습니다. 자동화 상태는 저장에 포함되며 0/1 또는 0..2로 클램프합니다.

## 8. 진행·해금

### 8.1 드러난 진행

- **건물 해금**: 박격포(2웨이브 클리어), 드론정비고(3웨이브 클리어) — 나머지는 시작부터.
- **테크 4종(생체물질)**: `piercingHarpoon` 관통 작살 30(작살 방어 무시) · `wideBlast` 광역 확장 40(박격 반경 +0.5) · `reinforcedWalls` 강화 격벽 25(격벽 HP +35%, 벽 자동 재건 해금) · `droneLogistics` 드론 물류 45(역할 분리 + 인양 +20%).
- **영구 퍼크 3종(통찰)**: `startScrap` +20/레벨(비용 5, 최대 3) · `subSpeed` +8%/레벨(8, 3) · `wallHp` +10%/레벨(6, 3).

### 8.2 숨은 해금 3종 — 메뉴에 없고 행동으로만 발견

| ID | 조건 | 보상 | 의도 |
|---|---|---|---|
| `ventResonance` 벤트 공명 | **열수 타일 위에 공격 건물 2기를 동시 보유** | **공명기** 해금(방어 무시 광역) | "열수 타일에 뭔가 있다"는 관찰을 보상. 2장 정예(장갑)의 해답이 된다 |
| `flawlessPair` 무손실 | 코어 피해 0으로 **2웨이브 연속** 클리어 | 패시브 «정밀 사격»(터렛 치명타 8%, 피해 ×2) | 잘하는 플레이에 보상 |
| `deepArchaeology` 심해 고고학 | **수동 인양 누적 400 고철** | 잠수정 이동 +20%, 액티브 쿨다운 −15% | 직접 조작 선호를 보상 |

- 판정은 `progress.ts`가 아니라 `sim.ts` 안에서 **웨이브 경계와 건설·인양 시점에만** 수행합니다(매 틱 전수 검사 금지 — 성능·결정성).
- 중복 지급 불가: `discovered` 화이트리스트 + 이벤트 1회.
- **암시 힌트**: 달성률 60% 이상이면 발견 슬롯에 `???` 대신 암호 같은 한 줄이 나옵니다(예: 「뜨거운 바닥 위에서 두 개가 함께 울린다」). 문구는 `content.ts`, 달성률 계산은 `sim.ts`, 노출 규칙은 `format.ts`가 검증합니다. 이것이 "숨겨져 있지만 찾을 수 있다"의 기술 장치입니다.

## 9. 직접 조작과 스킬

### 9.1 잠수정

- HP 60, 이동 3.2타일/s(`subSpeed` 퍼크·`deepArchaeology`로 상향). 적과 접촉 시 초당 피해(역할별 2~8).
- HP 0 → `downed` 6초 후 코어에서 부활. **런 실패가 아닙니다**(좌절 최소화). 다운 중 `ability`는 `subDowned` 거부.
- 탭/드래그로 목표 이동(`moveSub`), 잔해에 인접하면 자동 인양. 데스크톱 검증용으로 WASD/화살표도 `main.ts`에서 같은 명령으로 변환합니다.

### 9.2 액티브 2종 — 기존 「정밀 판정」 계승

각 액티브는 0↔1을 왕복하는 게이지를 가지며, 1 근처 폭 `perfectWindow` 안에서 누르면 **정밀**이 됩니다(`src/arcade-run.ts`의 `meter`/`perfectWidth` 개념과 동일).

| 액티브 | 쿨다운 | 기본 | 정밀 |
|---|---|---|---|
| `sonarPulse` 소나 충격파 | 8s | 반경 2.5, 18 피해 + 둔화 35%/2s | 27 피해 + 둔화 3s |
| `weld` 긴급 용접 | 12s | 구조물 +60 HP (코어 +20) | +90 HP (코어 +30) |

- `perfectWindow = max(0.05, 0.12 - 0.008 × wave)` → 후반 난도가 **기술로** 올라갑니다.
- 쿨다운 중 입력은 `onCooldown` 거부이며 통계·보상이 증가하지 않습니다(스팸 무보상 — 기존 테스트가 검증하는 원칙과 동일).

## 10. 렌더러와 HUD

### 10.1 Canvas 2D 레이어

프레임 예산 16.6ms 중 드로잉 8ms 목표.

| 레이어 | 갱신 조건 | 내용 |
|---|---|---|
| L0 지형(오프스크린 캐시) | `fieldVersion`·`chapter`·리사이즈 시에만 | 물 그라데이션, 암반, 열수, 분출구, 잔해, 격자, 코어 토대 |
| L1 구조물 | 매 프레임(≤ 40기) | 본체·체력 바·조준각·열수 발광 |
| L2 유닛 | 매 프레임(적 ≤ 80) | 적·잠수정·드론, `prev→pos` 선형 보간 |
| L3 투사체·FX | 매 프레임 | 투사체, 파티클(≤ 160), 플로팅 텍스트 |
| L4 오버레이 | 입력 시 | 건설 고스트, 사거리 원, `pathHint` 경로 화살표, **완전 봉쇄 경고** |

- 캔버스 1장 + 오프스크린 1장. `devicePixelRatio`는 **2 상한**(저가 안드로이드 보호).
- 축소 모션: 파티클 0, 화면 흔들림 0, 보간은 유지.
- 30fps 설정은 `setFrameSkip(true)`로 그리기만 절반 — 시뮬레이션은 고정 1/30이라 판정이 바뀌지 않습니다.
- 기존 `src/renderer.ts`와 같이 **외부 이미지 자산 없이 코드 드로잉만** 사용합니다.

### 10.2 카메라

- **고정 줌**: 9×12 그리드가 항상 화면에 전부 들어갑니다. 핀치 줌·팬 없음 → "어디 있는지 모름"과 제스처 충돌을 동시에 제거합니다.
- `layout.ts`의 순수 함수 `fitView(cssW, cssH, insets) → { tileSize, originX, originY }`. HUD가 차지하는 영역을 인셋으로 받아 캔버스가 HUD에 가려지지 않게 합니다.

### 10.3 터치 규격 (코디네이터·UI 담당 요구의 실무 합의안)

| 대상 | 확정치 | 근거 |
|---|---|---|
| 그리드 타일 | **≥ 40 CSS px**(360px 폭에서 정확히 40) | 9열 고정. 손가락 중심 오차 허용 |
| HUD 버튼·건설 칩·액티브 버튼 | **≥ 48 CSS px**(터치 영역은 패딩 포함 48, 시각 요소는 더 작아도 됨) | UI·아트 담당 요구 수용 |
| 건설 확정 | **탭으로 건물 선택 → 타일 탭(고스트) → 확정 탭** 2단계 | 오터치 취소 가능 |
| 드래그 판정 | 10px 임계값 이상이면 잠수정 이동, 이하면 탭 | 이동/건설 혼동 제거 |
| 액티브 조준 | 버튼 탭 후 타일 탭(2단), 또는 버튼에서 드래그-릴리스 | 급할 때 1제스처 가능 |

교차 검토 항목: 타일 40px과 버튼 48px의 동시 충족은 세로 640px 화면에서 캔버스 480px + HUD 160px로 계산상 가능합니다. 세로 여유가 더 필요하면 **격자 9×11로 1행 축소**가 다음 후보입니다(레이아웃 문자열만 교체되므로 비용이 낮음).

### 10.4 반응형 DOM HUD

| 구간 | 레이아웃 |
|---|---|
| ≤ 480px (기본 세로) | 상단 고정 바(고철·생체·코어 HP·웨이브/단계) / 중앙 캔버스 / 하단 독(건설 칩 + 액티브 2 + 웨이브 시작) / 패널은 전체화면 시트 |
| 481~899px | 좌측 캔버스 + 우측 240px 레일(건설·자동화·테크), 액티브는 하단 유지 |
| ≥ 900px | 캔버스 최대 560px 중앙(타일 상한 있음), 우측 320px 레일, 패널은 모달 |

- 본문 ≥ 13px, 숫자는 `tabular-nums`(값 흔들림 방지), `env(safe-area-inset-*)` 적용(`viewport-fit=cover`).
- 「웨이브 시작」 버튼은 건설 단계에서 **항상 보이고**, 조기 보너스 남은 시간을 같이 표시합니다.
- 폰트는 기존 엔트리와 같은 Google Fonts 링크 + **차단 시 시스템 폰트 폴백**(README 기존 방침).

### 10.5 한국어 표시 규칙 (`format.ts`, 순수 함수)

- `formatNumber`: 1,000 미만 정수 / 1,000~9,999 → `1.2천` / 10,000 이상 → `3.4만`.
- `formatRate`: `+3.2/초`.
- `rejectMessage`: 16종 전부 한국어 한 줄(예: `notAdjacentToWreck` → 「잔해에 붙여야 합니다」, `thermalOnly` → 「열수 분출구 위에만 세울 수 있습니다」).
- 라벨은 `Record<전체 키, …>` 매핑이라 누락 시 타입 에러가 납니다.

## 11. 저장과 검증 (`save.ts`)

> **R3 대체**: 저장 타입은 `contract.ts`의 `MetaSave`/`RunSave`(웨이브 시작 스냅샷 포함)가 기준입니다. 검증 규칙 1~9는 그대로 유효합니다.

`src/progression.ts`의 `loadProfile` 패턴(버전 확인 → 필드별 클램프 → 화이트리스트 → try/catch 폴백)을 계승하되, 진행 중 런까지 복원해야 하므로 **메타/런 2분할**합니다. 런이 깨져도 영구 진행은 살아남습니다.

```ts
export const OUTPOST_SAVE_VERSION = 1;

export interface MetaSave {                  // 영구 — 붕괴해도 유지
  readonly version: 1;
  readonly insight: number;                  // 0..1e6
  readonly perks: Record<PerkId, number>;    // 각 0..3
  readonly discovered: readonly DiscoveryId[];
  readonly blueprint: readonly { readonly tile: TileIndex; readonly building: BuildingId }[];  // ≤ 8
  readonly best: { readonly wave: number; readonly chapter: ChapterId; readonly elapsed: number };
  readonly settings: {
    readonly sound: boolean; readonly haptics: boolean;
    readonly reducedMotion: boolean; readonly fps: 30 | 60; readonly volume: number;
  };
}

export interface RunSave {                   // 진행 중 런 — 붕괴 시 폐기
  readonly version: 1;
  readonly seed: number;
  readonly chapter: ChapterId;
  readonly tick: Tick;
  readonly phase: Phase;
  readonly wave: number;                     // 1..8
  readonly resources: Resources;
  readonly coreHp: number;
  readonly buildings: readonly { readonly tile: TileIndex; readonly id: BuildingId; readonly level: number; readonly hp: number; readonly policy: TargetPolicy }[];
  readonly researched: readonly TechId[];
  readonly automation: Record<AutomationKey, number>;
  readonly wreckRichness: readonly number[];
  readonly flooded: readonly number[];       // 길이 108
  readonly stats: SimView['stats'];
  readonly savedAtMs: number;                // 오프라인 정산용. main.ts가 기록
}

export declare function serializeSave(meta: MetaSave, run: RunSave | null): string;
export declare function parseSave(raw: string | null): { meta: MetaSave; run: RunSave | null };
```

검증 규칙(전부 §13.3에서 테스트):

1. `JSON.parse` 실패 / 객체 아님 / `version !== 1` → **기본값 전체 반환**. 예외를 던지지 않습니다.
2. 모든 숫자는 `Number.isFinite` 확인 후 `[min,max]` 클램프. 정수 필드는 `Math.floor`. `NaN`·`Infinity`·음수는 허용 범위로 정규화.
3. 모든 ID는 콘텐츠 테이블 키 화이트리스트(`Object.hasOwn(BUILDINGS, id)`). 모르는 ID는 **그 항목만 버립니다**(게임을 막지 않음).
4. `tile`은 `0 ≤ tile < 108`이고 해당 타일이 건설 가능해야 함. 아니면 버림. **같은 타일 중복은 첫 항목만** 채택.
5. 배열 길이 상한: `buildings ≤ 108`, `blueprint ≤ 8`, `discovered ≤ 16`, `researched ≤ 8`, `flooded = 108`로 정규화. 초과는 절단.
6. `__proto__`·`constructor`·`prototype` 키는 무시. 복원은 항상 **새 객체에 필드를 복사**하며, 파싱 결과를 그대로 상태로 쓰지 않습니다.
7. `savedAtMs`가 미래이거나 음수면 `offlineSeconds = 0`.
8. **런만 손상된 경우 메타만 복원하고 런은 새로 시작**합니다.
9. `localStorage` 접근 실패(프라이빗 모드·용량 초과)는 삼켜서 메모리 플레이를 계속하고 HUD에 1회 안내합니다.

저장 시점: 웨이브 경계, 건설·강화·연구 후 2초 디바운스, `visibilitychange`, 붕괴. 키: `outpost-meta-v1`, `outpost-run-v1`(기존 키와 충돌 없음).

## 12. 기술 리스크와 완화

| ID | 리스크 | 영향 | 완화 | 조기 경보 |
|---|---|---|---|---|
| R1 | 결정성 붕괴(가변 dt·부동소수·순회 순서) | 저장 복원·밸런스 테스트가 모두 흔들림 | 고정 1/30 스텝, 정수 Dijkstra, 시드 PRNG, `digest()` 동등성 테스트, §4.5 금지 목록 리뷰 | 2-인스턴스 digest 비교(§13.1-1) |
| R2 | 모바일 성능(적 80 + DOM HUD 매 프레임) | 저가 안드로이드 20fps | 지형 오프스크린 캐시, DPR ≤ 2, 뷰 풀링(프레임당 할당 0), HUD 변경분만 기록, 파티클 상한, 30fps 옵션 | M1에서 CPU 4× 스로틀 + 적 80 스트레스 측정 |
| R3 | 흐름장 재계산·경로 진동 | 프레임 스파이크, 적이 제자리 떨림 | dirty 플래그 스텝당 1회 병합, 필드 3종만, 타일 중심 도달 시에만 재조회 + 현재 방향 우선 | 재계산 카운터 테스트(건설 5연속 → 1회) |
| R4 | 벽 비용 밸런스 취약성 | "벽이 무의미" 또는 "벽이 전능" | `wallCost`를 테이블의 한 숫자로 노출, 경로 테스트가 **기대 레인**을 단정, 디자이너 라운드에서 조정 | §13.2-2,4 |
| R5 | 터치 크기와 화면 높이 상충(타일 40 + 버튼 48) | 작은 기기에서 캔버스 압축 | 고정 줌 + 2단 확정 건설 + 하단 독 스크롤. 여유 부족 시 **9×11로 1행 축소**(문자열만 교체) | §14.1의 360×640 실측 |
| R6 | 3인 병렬 충돌 | 재작업 | 배타 파일 소유(§3.1), M0 계약 동결 + 스텁, 공유 파일은 `vite.config.ts` 1줄 | M0 게이트 `npm run check` |
| R7 | 계약 변경 압력 | 같은 파일 동시 수정 | 코디네이터 경유 A 단독 수정, **추가만 허용** | 변경 요청 건수 |
| R8 | Phaser 미사용 결정 | 저장소 기술 일관성 | 이 엔트리는 Canvas 2D + DOM만 사용. Phaser는 기존 2엔트리에 남고 `manualChunks`로 분리되어 **새 엔트리는 1.21MB 엔진을 받지 않습니다**. 결정적 고정 스텝을 직접 제어해야 하고 물리·스프라이트가 불필요해 엔진 이득이 없으며, 신규 의존성도 없습니다 | 새 엔트리 번들 ≤ 80KB gzip 목표 |
| R9 | 밸런스 테스트 취약성 | 튜닝마다 테스트 깨짐 | 정확값 금지, **부등식·밴드만** 단정, 전략 스크립트 헬퍼로 의도 표현 | CI 실패 빈도 |
| R10 | 보스 웨이브 개체 폭증 | 프레임 드랍 | 동시 상한 `MAX_ENEMIES = 80`, 보스 생성 총량 40 상한, 초과 시 생성 스킵 | 스트레스 테스트(§13.1-10) |
| R11 | 오프라인 수익 악용(시계 조작) | 경제 붕괴 | 2시간 상한 + 40% 효율 + 웨이브 진행 없음 + 미래 타임스탬프 0 | §13.3-8 |
| R12 | 기존 게임 회귀 | 쇼룸·챌린지 손상 | 기존 `src/*.ts` 무수정, 기존 테스트 통과 필수, 엔트리만 추가 | `npm test` 전체 |
| R13 | 접근성·오디오 정책 | 첫 터치까지 무음, 모션 민감 사용자 | `AudioContext`는 첫 제스처에 생성(기존 `main.ts` 패턴), 축소 모션 분기, 사운드 기본 off | §14.2-16 |

## 13. 테스트 계획

기존 방식(`node --test tests/*.test.mjs`, `../src/**/*.ts` 직접 import) 그대로 — 새 러너·의존성 없음. 순수 모듈만 테스트하고 드로잉·DOM은 §14 브라우저 수락으로 덮습니다.

### 13.1 `outpost-sim.test.mjs` (A) — 스텝·명령·경제·전투
1. **결정성**: 같은 seed + 같은 명령 로그(스텝 번호 포함) 두 인스턴스 → 3,000스텝 후 `digest()` 동일.
2. `advance(10)`은 6스텝을 넘지 않는다(탭 복귀 폭주 방지).
3. 거부 경로: 자원 부족·점유 타일·범위 밖·쿨다운·잘못된 페이즈·잔해 비인접·열수 아님이 각각 정확한 `RejectReason`이며 **`digest()`가 변하지 않는다**(상태 불변).
4. 뷰 안정성: `view()`가 항상 같은 객체 참조이고 100스텝 동안 배열이 재할당되지 않는다(길이만 변함).
5. 적이 코어에 닿으면 코어 HP가 줄고 `coreHit` 이벤트가 정확히 1회 발생한다.
6. 코어 0 → `phase === 'collapsed'`, 이후 `build`는 `wrongPhase`.
7. 수입 순서: 수동(5.5) > 드론(3.3) ≈ 수집기 lv0(3.2), 그리고 수집기 lv2(7.7) > 수동.
8. 자원은 어떤 명령 난사(시드 난수 2,000회)에도 음수가 되지 않는다.
9. 판매는 투입의 50%만 환급 → 건설·판매 왕복 후 **순손실**.
10. 동시 적 수가 80을 넘지 않는다(보스 웨이브 포함).
11. 침수: 누수 4회 → `flooded` 4타일 + 그 위 구조물 파괴 + `fieldVersion` 증가.
12. 액티브: 쿨다운 중 재시도는 무보상, 정밀 창 안에서 효과 강화, `perfects` 통계가 1회만 증가, 다운 중에는 `subDowned`.
13. `drainEvents()` 2회 연속 호출 시 두 번째는 빈 배열.
14. 2장 «정예»: 장갑 3이 작살 피해를 9→6으로 깎고, 공명기 14는 그대로 들어간다.

### 13.2 `outpost-path.test.mjs` (A) — 흐름장
1. `dist`가 코어에서 단조 증가하고 모든 물 타일이 도달 가능하다.
2. 1장에서 중앙 레인을 격벽으로 막으면 `ground` 경로가 **바깥 레인으로 실제로 바뀐다**(기대 타일 집합 단정).
3. 세 레인을 모두 막으면 `ground` 경로가 벽 타일을 포함한다(= 뚫고 들어온다).
4. **아키타입 분기**: 같은 레이아웃에서 `breaker` 경로 비용 < `ground` 경로 비용이고, `breaker` 경로는 벽을 포함한다.
5. `flyer` 필드는 암반·벽을 무시하므로 코어까지의 맨해튼/직선 하한과 일치한다.
6. 타이브레이크 결정성: 대칭 레이아웃에서 `flow`가 항상 상→좌→우→하 순서를 고른다.
7. 재계산 병합: 한 스텝에 건설 5회 → 필드 계산 1회(계산 카운터 노출).
8. 2장 레이아웃은 천연 초크가 없어, 벽 없이 `ground` 최단 비용이 1장보다 작다(= 더 위험하다).

### 13.3 `outpost-save.test.mjs` (A)
1. 왕복: 복잡한 상태 저장 → 파싱 → 복원 후 `digest()` 동일.
2. `'{bad'`, `''`, `'null'`, `'[]'`, `version: 2` → 기본 메타 + 런 없음(예외 없음).
3. 적대적 payload: `insight: NaN`, `perks: {subSpeed: -5}`, `tile: 9999`, `buildings` 1,000개, 모르는 `BuildingId`, `__proto__` 오염 시도 → 모두 플레이 가능한 상태로 수렴하고 `Object.prototype`이 오염되지 않는다.
4. 런만 손상 → 메타(통찰·퍼크·발견·설정) 보존.
5. `blueprint` 9개 → 8개 절단. 중복 타일 건물 → 1개만 채택.
6. 설정: `fps`는 30/60만, `volume`은 0..1 클램프.
7. 건설 불가 타일(암반·잔해) 위 구조물은 복원에서 탈락.
8. 오프라인: 7,200초 상한, 40% 효율, 웨이브·틱 진행 없음, 미래 타임스탬프 → 0.

### 13.4 `outpost-balance.test.mjs` (A) — 전략 3종과 카운터

헬퍼 `playStrategy(name, seed)`가 결정적 스크립트 봇으로 진행합니다. 단정은 **전부 부등식/밴드**입니다(R9).

세 전략 정의:
- **`maze` 초크 미로**: 격벽으로 경로를 최대화하고 초크에 박격포. 코어 근처 작살 최소.
- **`turtle` 요새 코어**: 벽 최소, 코어 주변 3타일에 작살·박격포 밀집 + 잠수정 방어 지원.
- **`economy` 경제 러시**: 수집기·드론 우선, 터렛 최소, 플레이어가 액티브와 잠수정으로 직접 방어.

1. **세 전략 모두 8웨이브 클리어 가능**(코어 HP > 0).
2. **아무 명령도 없으면** 웨이브 3 이전에 붕괴한다.
3. **미로 단독은 공중에 진다**: 대공 0기 + 미로만 → 웨이브 4에서 코어 피해 ≥ 40.
4. **요새 단독은 굴착에 약하다**: 벽 0장 + 밀집 → 웨이브 7에서 구조물 손실 ≥ 5.
5. **경제 단독은 보스에 진다**: 터렛 ≤ 2 → 웨이브 8 실패.
6. **장갑 전환 검증**: 2장에서 공명기/관통 테크 없이 작살만으로는 웨이브 6 클리어 시간이 1.5배 이상 길어진다.
7. **페이싱 밴드**: `maze` 기준 1장 클리어(웨이브 4) 실제 플레이 시간 150~400초, 보스 교전 진입 500~900초.
8. **재건 가속**: 붕괴 후 `blueprint` + 통찰로 2회차 웨이브 4 도달 시간 ≤ 1회차의 80%.
9. **숨은 해금 3종 전부 도달 가능**: 각 조건 스크립트가 해당 `discovered` 이벤트를 정확히 1회 발생시킨다.
10. **난이도 단조성**: 웨이브 n+1의 적 총 유효 HP가 웨이브 n보다 크다(장갑 반영).
11. **조기 시작 보너스**: 10초 내 시작 시 해당 웨이브 고철 수입이 +25% 밴드 안.

### 13.5 `outpost-layout.test.mjs` (B)
1. `fitView`가 어떤 `(cssW, cssH, insets)`에서도 그리드를 화면 안에 넣고 `tileSize > 0`.
2. `screenToTile(tileToScreen(t))` 왕복 일치(타일 중심 기준, 전 108타일).
3. 캔버스 밖 좌표 → `-1`.
4. DPR 2 상한, 소수 DPR(1.5 / 2.625)에서 정수 픽셀 정렬.
5. 컬링: 화면 밖 타일은 드로잉 목록에서 제외.
6. **360×640 세로에서 `tileSize ≥ 40`**, 768 태블릿·1440 데스크톱에서도 ≥ 40.

### 13.6 `outpost-format.test.mjs` (C)
1. 모든 `BuildingId`·`EnemyRole`·`AbilityId`·`RejectReason`에 한국어 라벨 존재(키 누락 0).
2. `formatNumber` 경계값(999 / 1,000 / 9,999 / 10,000 / 999,999).
3. `affordability`가 자원 부족·해금 전·최대 레벨을 서로 다른 상태로 구분한다.
4. 숨은 해금 힌트는 달성률 60% 미만에서 노출되지 않는다.
5. 라벨에 영문 ID가 그대로 노출되지 않는다(정규식 단정).

### 13.7 품질 게이트
`npm run check` → `npm test`(기존 2 + 신규 6) → `npm run build`. CLAUDE.md 워크플로우대로 커밋 전 `/check`를 통과해야 하며 **기존 `game-state`/`progression` 테스트가 함께 통과**해야 합니다(R12).

## 14. 브라우저 수락 계획 (수동 검증, 도구 추가 없음)

`npm run dev` → `http://127.0.0.1:5197/outpost.html`(같은 Wi-Fi 기기는 터미널의 Network 주소).

### 14.1 뷰포트·기기 매트릭스

| 대상 | 확인 |
|---|---|
| 360×640 | 타일 ≥ 40px, 버튼 터치 영역 ≥ 48px, 하단 독 스크롤, 텍스트 잘림 0 |
| 390×844 | safe-area 여백, 주소창 표시/숨김 전환 시 캔버스 재계산 |
| 412×915 | 기본 목표 해상도 |
| 768×1024 (세로/가로) | 481~899 구간 레일 레이아웃 |
| 1440×900 | 캔버스 중앙 정렬(타일 상한), 키보드 조작 |
| 실기기 또는 DevTools CPU 4× 스로틀 | 웨이브 6(정예 24기 + 공중)과 웨이브 8 보스에서 체감 끊김 없음 |

### 14.2 기능 체크리스트 — 각 항목은 "보이는 것"으로 판정

1. 10초 안에 잠수정으로 잔해에 도달해 고철이 오르는 것이 보인다.
2. 건설 2단 탭으로 의도한 타일에 정확히 짓는다(20회 시도 중 오터치 0).
3. 건설 단계에 시간 압박이 없고 「웨이브 시작」을 누를 때까지 적이 오지 않는다.
4. 조기 시작(10초 내) 시 보너스 표시가 켜지고 보상 차이가 수치로 보인다.
5. 격벽으로 중앙 레인을 막으면 **적 경로가 눈에 보이게 바뀐다**(경로 오버레이 + 실제 이동).
6. 세 레인을 모두 막으면 적이 벽을 때려 부수고 통과한다(스타크래프트 체감) + 고스트에 봉쇄 경고가 떴다.
7. 웨이브 3에서 굴착체가 미로를 무시하고 최단선으로 벽을 뚫는다.
8. 웨이브 4에서 부유체가 벽 위를 지나가며, 박격포는 쏘지 못하고 작살만 반응한다.
9. 2장 정예 적에게 작살 피해가 줄어드는 것이 수치로 보이고, 공명기/관통 테크로 회복된다.
10. 액티브 정밀 판정이 성공/실패로 다르게 보이고(이펙트·수치) 쿨다운 중 입력은 토스트로 거부된다.
11. 드론 1기 가동 후 손을 떼도 고철이 오르고(자동화 체감), 수동이 더 빠른 것도 수치로 보인다.
12. 벽 자동 재건을 켜면 굴착체에 부서진 격벽이 스스로 돌아온다.
13. 숨은 해금 1종 이상을 **안내 없이** 달성 → 발견 연출 + 패널 기록. 달성률 60%에서 암시 한 줄이 보인다.
14. 누수 4회 후 침수 타일이 생기고 그 위 구조물이 사라져 재배치가 강제된다.
15. 코어 파괴 → 결과 화면 → 재시작 시 설계도 1회 배치로 빠르게 복구된다.
16. 1장 클리어 후 2장 진입에서 레이아웃·색·적 구성이 동시에 바뀐다.
17. 새로고침 후 진행이 복원된다. 탭을 2분 이상 떠났다 오면 수집 수입만 가산되고 웨이브는 그대로다.
18. `localStorage`에 잘못된 JSON을 수동 주입해도 게임이 시작되고 안내가 1회 뜬다.
19. 사운드 기본 off → 첫 탭 후 on 가능. 축소 모션 on에서 파티클·흔들림이 사라지고 조작은 동일.
20. 30fps 설정에서 정밀 판정 난이도가 변하지 않는다(고정 스텝 확인).
21. 기존 `/`, `/challenge.html`, `/showroom.html`이 그대로 동작한다(회귀).
22. `npm run build` → `npm run preview`에서 동일 동작, 콘솔 오류 0. Google Fonts 차단 시에도 레이아웃 유지.

### 14.3 성능 계측
- DevTools Performance로 웨이브 6·8에서 5초 녹화 → `draw` 자체 시간, 프레임 드랍, GC 빈도. 목표: CPU 4× 스로틀에서 평균 ≥ 45fps, 주기적 GC 스파이크 없음(프레임당 할당 0 원칙 확인).
- 힙 스냅샷 2회 비교로 5분 플레이 후 누수 없음 확인(쇼룸에서 텍스처 누수를 수정한 이력이 있어 동일 점검을 포함합니다).

## 15. 다음 라운드(게임 디자이너 교차 검토) 질문

기술적으로는 어느 쪽도 구현 가능하며, 설계 판단이 필요한 지점만 남깁니다.

1. **안전 건설 단계(무제한) + 조기 시작 보너스**가 "빠른 성장" 욕구에 맞는 레버인지, 아니면 시간 제한 있는 준비 단계가 긴장감에 더 좋은지.
2. **수동 1.7배 우위**가 방치 편의와 직접 조작 사이의 옳은 비율인지(1.3배면 방치 쪽, 2.5배면 조작 강제). 강화한 수집기가 수동을 넘어서는 전환 시점(lv2)이 적절한지.
3. **침수(부분 실패)** 가 재미있는 압박인지 단순 징벌인지. 대안: 침수 대신 해당 웨이브 보상 50% 삭감.
4. 숨은 해금 3종으로 "숨겨진 재미"가 충분한지, **암시 노출 기준 60%** 가 적절한지(완전 무단서가 발견의 쾌감을 키우는지).
5. 2장 «정예»(장갑 3 · 속도 +15%)로 카운터를 바꾸는 방식이 **새 적 종류 추가보다 충분히 신선한지**.
6. 8웨이브 중 보스 1종이면 충분한지, 웨이브 4(1장 마지막)를 중간 보스로 교체할지 — 현재는 부유체 충격으로 대체.
7. 적 4역할 + 보스의 **한국어 네이밍**과 톤(표류체·군체·굴착체·부유체·리바이어던).
8. 영구 퍼크 3종이 재도전 동기로 충분한지(현재 의도: 2회차 ≤ 80% 시간).
9. 터치 합의안(타일 40px / 버튼 48px)을 유지할지, 세로 여유를 위해 **9×11 격자**로 1행을 줄일지.

## 16. 구현 착수 요약 (3인 배포용)

- 새 의존성 0, 서버 0, 외부 자산 0. 기존 `src/*.ts` 무수정. `dist/` 커밋 금지.
- A는 M0에서 `contract.ts`(§5 그대로) + sim 스텁을 내고 **동결**합니다. 이후 계약 변경은 코디네이터 경유 A 단독, **추가만 허용**.
- B·C는 `import type`만으로 계약에 의존하고 sim 내부 구조를 가정하지 않습니다.
- `sim.ts`/`content.ts`/`path.ts`/`save.ts`에서 `Math.random`·`Date`·`performance`·DOM 전역 사용 금지. 테스트가 import하는 모듈(`layout.ts`·`format.ts` 포함)은 **최상위에서 DOM 접근 금지**.
- 렌더러는 뷰를 변형하지 않고, UI는 `issue()` 외의 경로로 상태를 바꾸지 않습니다. 이벤트 drain은 `main.ts`가 프레임당 1회.
- 커밋은 기능 단위 소단위, 커밋 전 `npm run check && npm test && npm run build`, `main` 직접 푸시 금지(브랜치 → PR) — CLAUDE.md 워크플로우 준수.
