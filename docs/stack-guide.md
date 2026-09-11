# 스택 선택 가이드

"무슨 게임이냐에 따라 다르다"가 맞습니다. 게임 유형부터 정하고 아래 표에서 고르세요.

## 게임 유형 → 추천 스택

| 만들려는 게임 | 렌더링 | 추천 스택 | 이유 |
|---|---|---|---|
| 텍스트/선택지, 비주얼 노벨 | DOM | **Next.js + TS** | 라우팅·SSR·배포가 그대로 해결됨 |
| 퍼즐, 보드, 카드 (턴제) | DOM 또는 Canvas | **Vite + React + TS** | 빌드 빠르고 구조 단순. 서버 불필요 |
| 2D 액션·플랫포머·슈팅 | Canvas/WebGL | **Phaser 3 + TS (Vite)** | 물리·스프라이트·입력 루프 내장 |
| 2D인데 엔진은 과함 | Canvas/WebGL | **PixiJS + TS** | 렌더러만 필요할 때. 게임 루프는 직접 |
| 3D | WebGL | **Three.js + TS** (또는 react-three-fiber) | 웹 3D 사실상 표준 |
| 멀티플레이어 필요 | - | 위 + **Node.js(Colyseus/socket.io)** | 권위 서버가 있어야 치팅 방지 |
| 게임을 "생성"하는 도구 자체 | - | **Node.js CLI + TS** | 결과물만 만들면 되고 UI 불필요할 때 |

## 결정 순서

1. **게임 유형**을 먼저 정한다 (위 표 왼쪽 열)
2. 실시간 루프(60fps 렌더)가 필요한가?
   - 예 → Canvas/WebGL 계열 (Phaser / Pixi / Three)
   - 아니오 → DOM 계열 (Next.js / Vite+React)
3. 서버가 필요한가? (계정, 저장, 멀티플레이, AI 생성 API 호출)
   - 예 → Next.js(API Routes) 또는 별도 Node 서버
   - 아니오 → Vite 정적 배포

## 패키지 매니저

| 매니저 | 언제 |
|---|---|
| **pnpm** | 기본 추천. 빠르고 디스크 절약, 모노레포 확장 쉬움 |
| npm | 별도 설치 없이 바로 쓰고 싶을 때 |
| bun | 속도 최우선, 생태계 호환성 이슈를 감수할 수 있을 때 |

정하고 나면 **lock 파일은 하나만** 유지하세요.

## 정한 뒤 할 일

1. `CLAUDE.md`의 "스택" 표와 "명령어" 블록 채우기
2. `.claude/commands/check.md`의 TODO를 실제 명령어로 교체
3. `/upgrade-claude-code` 재실행 → Skills / MCP 추천 받기
