# game-builder

세 가지 게임에 도전하는 모바일 **플레이룸 챌린지**와 조작감·성장 연출을 비교하는 **쇼룸**입니다.

## 현황

TypeScript + Phaser 3 + Vite로 구현하고 Capacitor로 Android에 패키징하는 프로토타입입니다.

- `/` (`index.html`): 세로 화면 챌린지, 룬 조합, 단계별 도전, 공간 꾸미기, 성취·친구 기록·설정
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

`http://127.0.0.1:5197`에서 모바일 챌린지, `http://127.0.0.1:5197/showroom.html`에서 쇼룸을 엽니다. 다른 프로젝트의 개발 서버와 혼동하지 않도록 5197 포트를 고정합니다. 같은 Wi-Fi의 휴대폰은 터미널에 표시된 Network 주소로 접속할 수 있습니다. 방화벽 설정에 따라 접근이 제한될 수 있습니다.

```sh
npm run check
npm test
npm run build
npm run preview
```

`check`는 TypeScript strict 검사, `test`는 `tests/*.test.mjs` 실행, `build`는 타입 검사 후 두 HTML 엔트리를 `dist/`에 생성합니다. `preview`는 빌드 결과를 제공하며 접속 주소는 터미널에 표시됩니다. 두 엔트리가 Phaser 청크를 공유합니다. Phaser 엔진 자체가 약 1.21MB(압축 전)이므로 Vite의 청크 경고 기준을 1,300kB로 설정했습니다. 이는 다운로드 크기를 줄이는 최적화가 아니라 알려진 엔진 크기를 반영한 경고 기준입니다.

## GitHub Pages

공개 주소: https://hee882.github.io/game-builder/ (쇼룸: https://hee882.github.io/game-builder/showroom.html).

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
index.html          # 모바일 챌린지 엔트리
showroom.html       # 비교 쇼룸 엔트리
vite.config.ts      # 두 엔트리 빌드, Phaser 공유 청크
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
