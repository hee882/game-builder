# game-builder

## 현재 첫 화면: 심해 전초기지

해구에 전초기지를 세우고 좁은 길목을 설계해 **8웨이브(2장)** 를 막아내는 한국어 모바일 우선 전략 방어 게임입니다. 기존 아비스 다이버를 대체합니다.

| 경로 | 내용 |
|---|---|
| `/` (`index.html`) | **심해 전초기지** — 새 첫 화면 |
| `/outpost.html` | 같은 게임의 별도 경로(첫 화면과 동일) |
| `/arctic.html` | **북극 사냥 식당** — 아이소메트릭 타이쿤 시제품(곰 사냥 → 화로 → 카운터 판매 → 확장 칸·직원 고용) |
| `/idle.html` | **꼬마 용사 키우기** — 방치형 키우기 시제품(자동 전투·강화·무기 진화·환생·방치 보상) |
| `/abyss-diver-v2.html` | 이전 첫 화면이던 아비스 다이버 v2 보관본 |
| `/guard-the-shop.html` | 지키는 가게 디자인 캔버스 원본 |
| `/challenge.html` | 플레이룸 챌린지 |
| `/showroom.html` | 3종 비교 쇼룸 |

### 무엇을 하는 게임인가

- **안전한 건설 단계**에는 시간 제한이 없습니다. 대신 웨이브마다 **유한한 잔해 리저브**가 배정되어, 기다린다고 무한히 성장할 수 없습니다. 남은 양은 상단 리본의 막대로 항상 보입니다.
- 잠수정을 직접 몰아 인양·교전할 수 있고, **소나 충격파**와 **긴급 용접** 두 액티브에는 정밀 판정 게이지가 있습니다. 조작은 선택이지 강제가 아닙니다.
- 건설은 **칩 선택 → 타일 탭(고스트) → 확정** 2단계입니다. 확정 전에는 자원이 줄지 않고, 사거리·비용·봉쇄 경고를 먼저 봅니다.
- 실패해도 캠페인을 처음부터 하지 않습니다. **같은 웨이브를 재시도**하며 발견·연구·통찰은 유지됩니다.
- 드론 역할과 격벽 자동 재건으로 풀린 잡무를 위임하고, 숨은 해금 3종은 메뉴가 아니라 행동으로 찾습니다.

진행은 브라우저 `localStorage`에 저장됩니다(키: `outpost-run-v1`, `outpost-settings-v1`, `outpost-saved-at-v1`). 저장 형식이 깨져 있으면 새 캠페인으로 시작하고 플레이를 막지 않습니다. 서버·계정·광고·결제는 없습니다.

## 이전 현황(챌린지·쇼룸)


TypeScript + Phaser 3 + Vite로 구현하고 Capacitor로 Android에 패키징하는 프로토타입입니다.

- `/challenge.html`: 세로 화면 챌린지, 룬 조합, 단계별 도전, 공간 꾸미기, 성취·친구 기록·설정
- `/showroom.html`: 아래 세 게임의 기본 조작과 성장 모습을 비교하는 쇼룸

- **작은 성채**: 타워 3종, 강화, 광역 공격·둔화, 5웨이브 방어
- **유물 사냥꾼**: 클릭·드래그 / WASD 이동, 자동 공격, 보석 수집, 능력 선택, 보스
- **골목상회**: 손님 응대, 직원 자동화, 가게 업그레이드, 4층 증축, 홍보

쇼룸에서는 상단에서 게임을 전환하거나 **성장한 모습 보기**로 후반 모습을 비교합니다. 각 게임 진행은 페이지를 열어둔 동안 유지됩니다. 평가·메모만 브라우저에 저장되며 JSON으로 내려받을 수 있습니다. 처음부터 버튼은 선택한 게임만 초기화합니다.

모바일 챌린지는 성장·조합·공간·도전 결과를 기기에 저장합니다. 진행 중인 도전은 결과 정산 시 저장하며, 설정에서 기록을 백업할 수 있습니다. 친구 도전 코드는 기기에 저장한 비교 기록이며 서버가 검증하는 순위는 아닙니다.

## 실행

Node.js 22.18 이상 또는 24 권장 (테스트는 Node의 TypeScript 직접 실행 사용).

```sh
npm ci
npm run dev
```

`http://127.0.0.1:5197`에서 심해 전초기지, `/outpost.html`·`/challenge.html`·`/showroom.html`에서 나머지 경로를 엽니다. 다른 프로젝트의 개발 서버와 혼동하지 않도록 5197 포트를 고정합니다. 같은 Wi-Fi의 휴대폰은 터미널에 표시된 Network 주소로 접속할 수 있습니다. 방화벽 설정에 따라 접근이 제한될 수 있습니다.

```sh
npm run check
npm test
npm run build
npm run preview
```

`check`는 TypeScript strict 검사, `test`는 `tests/*.test.mjs` 실행, `build`는 타입 검사 후 네 HTML 엔트리(`index`·`outpost`·`challenge`·`showroom`)를 `dist/`에 생성합니다. `preview`는 빌드 결과를 제공하며 접속 주소는 터미널에 표시됩니다. 챌린지와 쇼룸 두 엔트리가 Phaser 청크를 공유합니다. 심해 전초기지는 Phaser를 쓰지 않고 순수 Canvas 2D로 그립니다. Phaser 엔진 자체가 약 1.21MB(압축 전)이므로 Vite의 청크 경고 기준을 1,300kB로 설정했습니다. 이는 다운로드 크기를 줄이는 최적화가 아니라 알려진 엔진 크기를 반영한 경고 기준입니다.

## GitHub Pages

공개 주소: https://hee882.github.io/game-builder/ (쇼룸: https://hee882.github.io/game-builder/showroom.html, 보관본: https://hee882.github.io/game-builder/abyss-diver-v2.html).

`main`에 push하면 `.github/workflows/pages.yml`이 Node.js 24에서 의존성 설치, 테스트, 타입 검사와 빌드 후 GitHub Pages로 배포합니다. GitHub Actions에서 수동 실행할 수도 있습니다.

Pages 빌드는 `npm run build -- --base=/game-builder/`로 프로젝트 경로를 적용합니다. 기본 `npm run build`와 Android 빌드는 기존 루트 경로를 사용합니다.

## Android

Android 프로젝트는 `android/`에 포함되어 있습니다. 네이티브 빌드에는 JDK 21과 프로젝트의 `compileSdkVersion`에 맞는 Android SDK Platform 36 및 Build Tools가 필요합니다. Android Studio에서 SDK를 설치하고 `JAVA_HOME`, `ANDROID_HOME` 또는 로컬 `android/local.properties`로 경로를 설정합니다.

```sh
npm run android:sync
npm run android:open
```

`android:sync`는 웹 빌드 후 `cap sync android`를 실행합니다. 이미 최신 웹 빌드가 있다면 `npx cap sync android`로 동기화만 할 수 있습니다. App·Filesystem·Haptics·Share 플러그인을 동기화하며 `android:open`은 Android Studio를 엽니다.

환경을 준비한 뒤 PowerShell에서 디버그 APK를 만들 수 있습니다.

```powershell
cd android
.\gradlew.bat assembleDebug
```

APK는 `android/app/build/outputs/apk/debug/`에 생성됩니다. 웹 동기화 성공과 APK 빌드 성공은 별도로 확인해야 합니다. `dist/`, Android 빌드 결과, 복사된 `android/app/src/main/assets/public/`, 생성된 Capacitor 설정 및 `android/local.properties`는 Git에서 제외됩니다. `local.properties`는 커밋하지 않습니다.

## 샘플의 범위

게임 그래픽은 코드로 그린 2D 일러스트이며 효과음은 Web Audio로 합성합니다. 게임용 외부 이미지 자산, 광고, 결제, 서버, 계정은 사용하지 않습니다. Google Fonts가 차단되면 시스템 글꼴로 표시됩니다. 쇼룸의 게임 진행과 모바일 챌린지의 진행 중인 도전은 새로고침하면 초기화되며, 기기에 저장된 프로필·평가·메모는 유지됩니다.

이 샘플은 재미와 시각적 방향을 비교하기 위한 것이며, 출시용 콘텐츠 분량·경제 밸런스·모바일 성능 검증은 별도입니다. 현재 게임 장면은 매 프레임 Canvas에 그린 뒤 Phaser 텍스처에 반영합니다. 대규모 객체가 필요한 출시 버전에서는 개별 스프라이트·배칭으로 옮겨 최적화할 수 있습니다.

## 구조

```
index.html          # 심해 전초기지 엔트리(첫 화면)
outpost.html        # 심해 전초기지 별도 경로
challenge.html      # 모바일 챌린지 엔트리
showroom.html       # 비교 쇼룸 엔트리
src/outpost/        # 심해 전초기지 — Phaser 미사용, 순수 Canvas 2D
  contract.ts        # 동결된 타입 계약(명령·뷰·이벤트)
  content.ts         # 건물·적·웨이브·경제 테이블
  sim.ts / path.ts / save.ts   # 순수 시뮬레이션
  renderer.ts / layout.ts      # Canvas 2D 렌더러
  hud.ts / format.ts / main.ts / outpost.css  # DOM 셸
vite.config.ts      # 네 엔트리 빌드, Phaser 공유 청크(챌린지·쇼룸만)
capacitor.config.ts # 앱 ID, 이름, 웹 빌드 경로(dist)
src/
  mobile-main.ts     # 챌린지 UI·입력·Capacitor 연동
  mobile-renderer.ts # 모바일 장면 렌더링
  mobile.css         # 세로 화면 레이아웃
  arcade-run.ts      # 챌린지 진행·판정
  progression.ts     # 프로필·룬·보상·성취·도전 코드
  interior.ts        # 가구 배치·연결·매출 효과
  game-state.ts      # 기본 시뮬레이션, 경제, 전투
  renderer.ts        # 월드·캐릭터·효과 렌더링
  main.ts            # Phaser 루프, 입력, 쇼룸 UI
  style.css          # 쇼룸 반응형 레이아웃
tests/
  game-state.test.mjs
  progression.test.mjs
android/            # Capacitor Android 네이티브 프로젝트
dist/               # 웹 빌드 결과 (Git 제외)
```
# 게임 빌더 기본 구조와 콘텐츠 방향

- 작성: 2026-09-29
- 상태: 기본 원칙

## 저장소 경계

`game-builder`는 게임 레포가 공통 기반으로 가져오는 베이스 레포다. 각 게임은 자신의 레포와 `main` 브랜치를 소유하며, 베이스 레포를 `vendor/game-builder` 서브모듈로 고정한다. 베이스 레포는 게임 레포를 서브모듈로 다시 넣지 않는다. 양방향 서브모듈은 복제와 Vercel 빌드를 순환시키기 때문이다.

```text
game-builder/                   # 공개 공통 기반 레포
├── docs/                       # 공통 구조·제품 방향·운영 문서
├── packages/                   # 게임 중립적인 재사용 코드만 추가
├── src/, *.html                # 기존 쇼룸·샘플 (호환용)
└── services/                   # 로컬 게임 체크아웃 자리, Git에는 포함하지 않음

penguin-gourmet-club/           # 독립 게임 레포 (운영 주체)
└── vendor/game-builder/        # game-builder의 고정 커밋을 가리키는 서브모듈
```

게임 레포는 자체 규칙, 상태, 렌더러, 테스트, 저장 형식, 개발 포트를 가진다. 게임 레포 안에서 베이스 서브모듈의 파일을 직접 수정하지 않고, 공통 변경은 베이스 레포의 PR로 만든 뒤 게임이 서브모듈 커밋을 올린다. Vercel은 각 게임 레포에 직접 연결하고 게임 레포의 `main`을 Production Branch로 사용한다.

## 공유 모듈 기준

게임 규칙과 밸런스는 공유하지 않는다. 공유가 필요할 때도 안정된 계약이 먼저이며, 다음처럼 게임에 종속되지 않는 코드만 `packages/`로 올린다.

- 저장 파일 다운로드·가져오기 검증 같은 일반 유틸
- 공통 UI 토큰과 접근성 기본 컴포넌트
- 오디오 스케줄링처럼 순수한 런타임 유틸
- 테스트 헬퍼와 타입 도구

동물 AI, 전투, 경제, 월드 상태, 게임별 렌더링과 저장 스키마는 각 서비스 안에 둔다. 공유를 위해 게임 규칙을 억지로 일반화하지 않는다.

## 개발 순서

1. 게임 레포 안에서 짧은 설계와 수락 기준을 만든다.
2. 파일 소유권을 나눠 구현하고 타입 검사·테스트·빌드를 통과시킨다.
3. 브라우저에서 모바일 화면과 실제 플레이 흐름을 확인한다.
4. 게임 레포에 커밋·푸시하고 `main`으로 PR을 병합한다.
5. 공통 변경이 필요하면 `game-builder`에서 별도 PR을 만들고, 병합된 커밋을 게임 레포의 `vendor/game-builder`에서 갱신한다.
6. 여러 게임을 한눈에 보여줄 때는 별도 허브나 URL 매니페스트를 사용한다. 베이스 레포에 게임 레포를 다시 서브모듈로 넣지 않는다.
7. 큰 방향을 바꿀 때는 이 문서와 게임 레포의 `docs/HANDOFF.md`를 함께 갱신한다.

## 북극 사냥 식당의 장기 방향

### Act 1 — 북극 마을

사냥하고, 굽고, 손님에게 판매해 식당과 땅을 확장한다. 식탁은 손님 처리량과 팁, 콤보 연출을 제공하고 계산대는 플레이어 또는 직원이 지키는 역할을 갖는다. 생선은 낚시 시간과 위험을 반영해 구운 생선의 보상이 높아야 한다.

### Act 2 — 사막

오아시스와 모래 폭풍을 새 위험으로 사용한다. 전갈, 사막여우, 낙타 계열 동물과 새로운 사냥 패턴·재료·보상을 추가한다.

### Act 3 — 밀림·정글

덩굴과 습지로 이동 선택을 만든다. 원숭이, 앵무새, 재규어 계열 동물은 매복·도주·무리 공격처럼 Act 1과 다른 패턴을 사용한다.

### Act 4 — 우주

외계 생물과 괴물, 좀비풍 적을 사용한다. 중력·텔레포트·감염 같은 규칙은 기존 아이소메트릭 이동과 충돌하지 않는 작은 프로토타입부터 검증한다.

각 Act는 새 배경만 입히는 방식이 아니라 새 행동, 위험, 보상, 해금 선택을 제공해야 한다. Act 1 저장과 호환되는 진행 버전을 설계하고, 대규모 콘텐츠는 작은 플레이 가능한 세로 조각으로 먼저 검증한다.

## 귀여움과 수익화 원칙

손님과 장식은 성별·연령·의상 변형으로 다양화한다. 여성 펭귄은 핑크 리본처럼 즉시 알아볼 수 있는 장식을 사용하고, 아기·노인 손님은 행동 속도와 애니메이션으로 구분한다. 배경음악은 귀엽고 잔잔한 합성 음악을 우선한다.

광고는 실제 SDK를 붙이기 전에 샘플 보상형 지점으로만 검증한다. 광고 버튼은 선택 사항이며, 짧은 보상과 명확한 빈도 제한을 갖고 핵심 플레이를 막지 않는다. 서버·계정·결제·광고 연동은 별도 승인을 받은 뒤 구현한다.

