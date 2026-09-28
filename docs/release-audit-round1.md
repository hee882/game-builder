# 릴리스·배포 감사 — Round 1 (2026-09-14)

대상: 로컬 체크아웃 `D:\workspace\game-builder`, 브랜치 `feat/abyss-outpost` (HEAD `c05b217`).
범위: npm 스크립트, 테스트, 빌드 산출물, GitHub Pages 설정, 경로(라우팅), 브랜치/원격 전제.
이 감사에서는 소스 파일을 고치지 않았습니다. 빌드는 스크래치 디렉터리에만 출력했습니다.

## 1. 요약

| 항목 | 상태 |
|------|------|
| `npm run check` (tsc strict) | ✅ 통과 |
| `npm test` (node --test) | ✅ 123개 통과, 실패·skip 0 |
| Pages용 빌드 (`--base=/game-builder/`) | ✅ 성공, HTML 6개 + assets |
| 로컬 preview에서 HTML·assets 응답 | ✅ 모든 엔트리·자산 200 |
| 워크플로우 `.github/workflows/pages.yml` | ✅ 동작 확인됨 (main 최근 2회 성공) |
| Pages 사이트 설정 | ✅ `build_type: workflow`, 공개, HTTPS 강제 |
| 브랜치 원격 푸시 / PR | ❌ `feat/abyss-outpost`가 원격에 없고 PR도 없음 |
| 브라우저 실행 검증 (콘솔 오류, 수동 인수 기준) | ❌ 안 함 — HEAD 커밋 제목이 "(미검증)" |
| PR 단계 CI | ⚠️ 워크플로우에 `pull_request` 트리거가 없음 |
| `main` 보호 규칙 | ⚠️ 없음 (직접 푸시 가능) |

**결론:** 기계 검증(타입·테스트·빌드·base 경로)은 모두 통과했습니다. 머지를 막는 것은
절차와 품질 확인입니다. 브랜치 푸시·PR이 아직 없고, 브라우저에서 확인한 사람도 없습니다.

## 2. 현재 상태 (확인된 사실)

### 브랜치 / 원격
- `origin` = `https://github.com/hee882/game-builder.git`. `gh` 인증 계정은 `hee882`입니다.
- 로컬 `main` = `origin/main` = `7ac920a`. 차이는 0/0입니다.
- `feat/abyss-outpost`는 main보다 **2커밋 앞서고 뒤처진 커밋은 없습니다**. 그래서 fast-forward나 깔끔한 머지가 가능합니다.
  - `668a81a docs: define reviewed Abyss Outpost strategy game contract`
  - `c05b217 wip: Codex 심해 전초기지 구현 스냅샷 (미검증)`
- 원격 브랜치는 `main`, `feat/playroom-showroom`, `fix/audit-and-mobile-ux` 3개입니다. **`feat/abyss-outpost`는 원격에 없습니다.**
- 기존 PR #1·#2는 모두 머지 완료 상태입니다. 열린 PR은 없습니다.
- `main` 브랜치 보호 규칙이 없습니다 (API 404 "Branch not protected").
- 변경 규모(main...HEAD)는 36개 파일, +14,461 / −643줄입니다. `src/outpost/*`와 테스트 6개, 문서 6개가 추가됐습니다. `index.html`은 교체됐고 `vite.config.ts`도 바뀌었습니다.

### 작업 트리 위생 — 주의
- 저장소 루트 **안에** `auto-game-builder-run-*` 워크트리 26개가 있습니다. 모두 추적되지 않은 디렉터리입니다 (`git worktree list` 28행).
- `.gitignore`에 들어 있지 않습니다. 그래서 `git add -A` / `git add .`을 하면 이 디렉터리들이 **내장 저장소(gitlink)로 스테이징될 위험**이 있습니다. 커밋할 때는 경로를 명시하세요. 로컬에서만 제외하려면 `.git/info/exclude`에 `auto-game-builder-run-*/`를 추가하는 방법이 안전합니다.
- 빌드·테스트에는 영향이 없습니다. `tsconfig` include는 `src`뿐이고, 테스트 glob은 `tests/*.test.mjs`이며, Vite 입력은 명시적으로 지정돼 있습니다.
- `dist/`가 로컬에 있지만 gitignore 대상이라 문제없습니다.

### npm 스크립트
| 스크립트 | 내용 | 비고 |
|----------|------|------|
| `dev` | `vite --host 0.0.0.0 --port 5197 --strictPort` | |
| `build` | `tsc --noEmit && vite build` | CI는 `-- --base=/game-builder/`를 붙여 호출 |
| `check` | `tsc --noEmit` | lint 없음 |
| `test` | `node --test tests/*.test.mjs` | `.ts`를 직접 import하므로 Node 타입 스트리핑이 필요합니다. Node ≥ 22.18 / 23.6이어야 하며, 로컬 v24.11.0과 CI Node 24 모두 조건을 만족합니다. `package.json`에 `engines` 필드는 없습니다. |
| `preview` | `vite preview --host 0.0.0.0` | Pages 경로를 흉내 내려면 `--base=/game-builder/`가 필요합니다 |
| `android:*` | Capacitor | 웹 배포와는 무관합니다 |

패키지 매니저는 npm 하나이고 lock 파일도 `package-lock.json` 하나뿐입니다. 규칙을 지키고 있습니다.

### 빌드 산출물 (base `/game-builder/`)
- 엔트리 4개(`index`, `outpost`, `challenge`, `showroom`)와 `public/` 복사본 2개(`abyss-diver-v2.html`, `guard-the-shop.html`)가 나옵니다.
- 모든 엔트리의 `<script>`와 `<link>`가 `/game-builder/assets/...`로 올바르게 다시 쓰였습니다.
- `index.html`과 `outpost.html`은 같은 번들(`main-*.js`)을 씁니다. 둘 다 심해 전초기지이며 Phaser를 쓰지 않습니다.
- Phaser 청크는 1,208 kB(gzip 332 kB)이고, 설정한 경고 한계 1,300 kB 안에 들어옵니다.
- `public/guard-the-shop.html`은 약 2.5 MB짜리 단일 파일입니다. 내부 템플릿에 절대 경로 `href="/appifact/..."`가 있어서, Pages에서는 해당 링크가 404가 될 가능성이 큽니다. 디자인 캔버스 원본 보관본이라 영향은 낮습니다.

### 라우팅 / 내비게이션
- 여러 HTML을 두는 멀티 페이지 구조이고 SPA가 아닙니다. 그래서 `404.html` 폴백이나 해시 라우팅은 필요 없습니다.
- `upload-pages-artifact` → `deploy-pages` 방식은 Jekyll을 거치지 않으므로 `.nojekyll`도 필요 없습니다.
- 앱 내부 링크는 모두 상대 경로입니다. `src/main.ts`의 `./`, `src/mobile-main.ts`의 `./showroom.html`, `public/abyss-diver-v2.html`의 `./guard-the-shop.html`이 여기에 해당하며, 프로젝트 하위 경로에서도 안전합니다.
- 머지 후 동작이 바뀌는 점이 있습니다. 지금은 `/game-builder/`(루트)가 아비스 다이버 v2를 보여 줍니다. 머지하면 루트가 **심해 전초기지**로 바뀝니다. 쇼룸 헤더의 "플레이룸 홈" 링크(`./`)도 전초기지로 연결됩니다. 이 변화가 의도인지 PR에 적어 두어야 합니다.
- 전초기지 화면에서 쇼룸·챌린지·보관본으로 가는 링크는 없습니다. README의 URL 표만이 목록 역할을 합니다.

### 공개 URL 현재 응답 (`https://hee882.github.io/game-builder/`)
| 경로 | 현재 (main `7ac920a`) | 머지 후 기대값 |
|------|------------------------|----------------|
| `/` | 200 (아비스 다이버 v2) | 200 (심해 전초기지) |
| `/showroom.html` | 200 | 200 |
| `/challenge.html` | 200 | 200 |
| `/guard-the-shop.html` | 200 | 200 |
| `/outpost.html` | **404** | 200 |
| `/abyss-diver-v2.html` | **404** | 200 |

현재 404인 두 경로는 이 브랜치에만 있는 파일입니다. 머지 전이므로 예상한 결과입니다. 그런데 브랜치의 README는 이미 이 URL들을 공개 주소로 안내하고 있습니다.

### 워크플로우 (`pages.yml`)
- 트리거는 `push: main`과 `workflow_dispatch`입니다. build → deploy 순서이고, deploy는 `refs/heads/main`에서만 실행됩니다.
- build 단계는 `npm ci` → `npm test` → `npm run build -- --base=/game-builder/`(tsc 포함) → artifact 업로드 순서입니다.
- 권한은 최소로 잡혀 있습니다. `contents: read`이고, deploy 잡에만 `pages: write`와 `id-token: write`가 있습니다. `concurrency`도 설정돼 있습니다.
- 최근 실행은 `34694165637`과 `34693784245`이며 둘 다 success(약 37초)입니다. `actions/checkout@v6`와 `setup-node@v6` 조합은 실제로 동작합니다.
- **빈틈:** `pull_request` 트리거가 없어서 PR에서 CI가 돌지 않습니다. 실패가 머지된 뒤에야 드러나고, 그때는 배포만 실패하므로 공개 사이트는 이전 버전에 머뭅니다.
- base 경로가 저장소 이름(`/game-builder/`)으로 하드코딩돼 있습니다. 저장소 이름을 바꾸거나 커스텀 도메인을 붙이면 수정해야 합니다.

### 문서 불일치
- `docs/outpost-architecture.md:56`은 Vite 입력이 3개라고 적혀 있지만 실제는 4개입니다(`outpost.html` 추가).
- 같은 문서의 §14.2 인수 기준 22개 항목(수동 브라우저 확인)은 아직 수행 기록이 없습니다.

## 3. 블로커

1. **브라우저 검증 전인 WIP 커밋.** `c05b217` 제목이 "(미검증)"입니다. 자동 테스트는 시뮬레이션·경계·저장 로직만 다룹니다. 렌더링, 입력, HUD, 콘솔 오류는 아직 아무도 확인하지 않았습니다. 최소한 §4의 스모크 테스트를 통과해야 머지할 수 있습니다.
2. **원격 브랜치와 PR이 없습니다.** 저장소 규칙이 "main 직접 푸시 금지, 브랜치 → PR"이므로 먼저 `feat/abyss-outpost`를 푸시해야 합니다.
3. **커밋 제목이 wip입니다.** 머지 방식을 정해야 합니다. squash로 정리할지, 검증을 마친 뒤 제목을 바꾼 커밋을 추가할지 결정이 필요합니다. `--force` 푸시는 사전 확인 없이 하지 않습니다.

권장 사항(블로커는 아님): PR CI 트리거 추가, `main` 보호 규칙, 워크트리 디렉터리 제외, 문서 불일치 수정.

## 4. 머지 전 검증 절차

```bash
# 0) 작업 트리 확인 — auto-game-builder-run-* 외 변경 없어야 함
git status --short | grep -v '^?? auto-game-builder-run-'

# 1) CI와 동일한 순서
npm ci
npm test
npm run build -- --base=/game-builder/
```

Windows Git Bash에서는 `--base=/game-builder/`가 MSYS 경로 변환 때문에 `/Program Files/Git/game-builder/`로 바뀌어 버립니다. 이번 감사 중 실제로 재현했습니다. **PowerShell에서 실행**하거나 `MSYS_NO_PATHCONV=1`을 앞에 붙이세요. CI(ubuntu)에는 영향이 없습니다.

```bash
# 2) Pages 경로 흉내 preview
MSYS_NO_PATHCONV=1 npx vite preview --base=/game-builder/ --port 4173
# http://localhost:4173/game-builder/ 열기
```

브라우저 스모크 체크리스트(최소):
- [ ] `/game-builder/`와 `/game-builder/outpost.html`: 전초기지가 시작되고 콘솔 오류가 없음. 1웨이브 진행, 건설, 새로고침 후 저장 복원 확인
- [ ] 390×844 모바일 뷰포트에서 HUD와 터치 영역이 잘리지 않음
- [ ] `/game-builder/showroom.html`, `/challenge.html`: 이전과 같이 동작하고(회귀 없음) Phaser 로드 정상
- [ ] `/game-builder/abyss-diver-v2.html` → "지키는 가게" 링크 정상
- [ ] 네트워크 탭에서 `/game-builder/` 밖으로 향하는 요청이 Google Fonts뿐인지 확인. 폰트를 차단해도 레이아웃이 유지되는지 확인
- [ ] 가능하면 `docs/outpost-architecture.md` §14.2의 22개 항목도 확인

## 5. main 안전 머지 절차

1. 스모크 결과를 반영합니다. 수정이 필요하면 기능 단위로 작게 커밋합니다.
2. 브랜치를 원격에 올립니다: `git push -u origin feat/abyss-outpost`
3. (권장, 별도 PR) `pages.yml`의 `on:`에 `pull_request: branches: [main]`을 추가합니다. deploy 잡은 이미 `github.ref == 'refs/heads/main'`으로 제한돼 있어서, PR에서는 build(test+tsc+vite)만 돌고 배포는 일어나지 않습니다.
4. PR을 엽니다: `gh pr create --base main --head feat/abyss-outpost`. 본문에는 다음을 적습니다.
   - 루트 `/`가 아비스 다이버 v2에서 심해 전초기지로 바뀌고, v2는 `/abyss-diver-v2.html`로 이동한다는 점
   - 스모크 체크리스트 결과
   - wip 커밋을 어떻게 처리할지(squash 권장)
5. CI 녹색과 리뷰를 확인한 뒤 머지합니다. squash 머지를 쓰면 "wip/미검증" 제목이 main 이력에 남지 않습니다.
6. (권장) `main` 브랜치 보호 규칙을 켭니다. PR 필수, 상태 체크 `build` 필수로 설정합니다.

## 6. GitHub Pages 공개 절차

Pages 설정은 이미 끝나 있어서 추가 설정은 필요 없습니다. `main`에 머지하면 워크플로우가 자동으로 배포합니다.

1. 머지 후 `gh run watch`로 `Deploy GitHub Pages` 실행이 성공하는지 확인합니다. `gh run list --workflow pages.yml -L 1`로도 볼 수 있습니다.
2. 공개 URL을 확인합니다. 모든 경로가 200이어야 합니다.
   ```bash
   for p in "" outpost.html showroom.html challenge.html abyss-diver-v2.html guard-the-shop.html; do
     echo "$p $(curl -s -o /dev/null -w '%{http_code}' https://hee882.github.io/game-builder/$p)"
   done
   ```
3. 실제 브라우저에서 `https://hee882.github.io/game-builder/`를 열어 스모크 첫 항목을 다시 확인합니다. CDN 캐시가 남아 있으면 강력 새로고침하세요.
4. 실패하면 되돌립니다. main에서 머지 커밋을 `git revert`하고 PR로 올리면 자동으로 재배포됩니다. `workflow_dispatch`로 이전 커밋을 다시 배포할 수는 없습니다. 워크플로우는 항상 선택한 브랜치의 HEAD를 빌드하기 때문입니다.

## 7. 감사 중 실행한 명령과 결과

- `npm run check` → exit 0
- `npm test` → tests 123 / pass 123 / fail 0 / skipped 0 (약 1.4초)
- `vite build --base=/game-builder/ --outDir <scratchpad>` → 성공 (7.7초), 청크 경고 없음
- `vite preview --base=/game-builder/` → HTML 6개와 참조된 assets 9개 모두 HTTP 200
- `gh api repos/hee882/game-builder/pages` → `build_type: workflow`, `html_url: https://hee882.github.io/game-builder/`
- `gh run list --workflow pages.yml` → 최근 2회 success
- 공개 URL curl → §2 표 참고
- 하지 않은 것: 실제 브라우저 렌더링과 콘솔 확인, Android 빌드
