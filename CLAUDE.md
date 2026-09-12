# game-builder

세 가지 게임의 조작감과 성장 연출을 비교하는 브라우저 쇼룸. 현재 구현은 `README.md` 참고.

## 스택

> 비교 쇼룸의 스택입니다. 최종 출시 게임의 플랫폼은 별도로 결정합니다.

| 항목 | 값 |
|------|-----|
| 언어 | TypeScript (확정) |
| 런타임/프레임워크 | Phaser 3 + Vite, 브라우저 |
| 패키지 매니저 | npm (`package-lock.json`) |

게임 로직은 `src/game-state.ts`, 렌더링은 `src/renderer.ts`, UI와 Phaser 연결은 `src/main.ts`에 있습니다.

## 명령어

```bash
npm ci
npm run dev
npm run build
npm test
npm run check # TypeScript 검사. 별도 lint 명령은 없음.
```

## 개발 워크플로우

1. 작업 전 `git status`로 작업 트리가 깨끗한지 확인
2. 기능 단위로 작은 커밋 — 한 커밋에 한 가지 변경
3. 커밋 전 빌드/테스트 통과 확인 (`/check`)
4. `main`에 직접 푸시하지 말고 브랜치 → PR

## 코딩 컨벤션

- TypeScript `strict: true` 유지, `any` 대신 `unknown` + 좁히기
- 파일명: 컴포넌트 `PascalCase`, 그 외 `kebab-case`
- 함수는 한 가지 일만 — 40줄 넘으면 분리 검토
- 주석은 "왜"를 적는다. "무엇"은 코드가 말하게 한다
- 게임 로직(규칙·상태)과 렌더링 레이어를 분리한다 — 엔진 교체 가능성을 열어둘 것

## 금지사항

- ❌ 시크릿·API 키를 코드나 커밋에 넣지 않는다 (`.env`는 절대 커밋 금지)
- ❌ 패키지 매니저를 섞지 않는다 (lock 파일은 하나만 존재해야 함)
- ❌ `--force` 푸시, `git reset --hard`를 확인 없이 실행하지 않는다
- ❌ 테스트를 통과시키려고 단언(assertion)을 지우거나 `skip` 처리하지 않는다
- ❌ 요청하지 않은 리팩터링·의존성 추가를 임의로 하지 않는다
- ❌ 생성된 게임 결과물을 저장소에 커밋하지 않는다 (`dist/`, 빌드 산출물)

## 추가 문서

- [docs/stack-guide.md](docs/stack-guide.md) — 게임 유형별 스택 선택 기준
