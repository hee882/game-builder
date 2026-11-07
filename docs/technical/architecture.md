# 연무: 잔향의 문 — 기술 스택·온라인 아키텍처 (architecture)

> **문서 상태:** 초안 v0.1 (2026-11-07) · 기술 문서 담당 · 디자인 문서와 교차 검토 전
>
> **가칭·제안 주의:** `연무: 잔향의 문 (YEONMU)`은 임시 작업명이고, 조선풍 가상 다크 판타지 배경은 제안 상태다([decision-register.md](../production/decision-register.md)). 이 문서의 스택 결정은 **ADR 제안(Proposed)** 이며 승인되지 않았다.
>
> **수치 규칙:** 이 문서의 모든 틱 레이트·인원·대역폭·지연 값은 **측정 전 가설 또는 목표**다. 성능을 보장한다는 뜻이 아니다. 측정 결과가 나오면 `측정값`으로 따로 표기한다(현재 측정값 없음).
>
> **출처 표기:** `[공식: URL]` = 2026-11-07에 공식 문서에서 확인한 내용, `[미검증]` = 공식 문서로 확인하지 못했거나 일반 지식에 근거한 내용, `[제안]` = 이 문서의 설계 판단.

관련 문서: [아트·애니메이션 (art-and-animation.md)](art-and-animation.md) · [제작·사업 (delivery-and-business.md)](delivery-and-business.md) · [컨셉 (../design/concept.md)](../design/concept.md) · [검증 계획 (../production/validation-plan.md)](../production/validation-plan.md)

---

## 목차

1. [요구사항과 비기능 제약](#1-요구사항과-비기능-제약)
2. [스택 비교](#2-스택-비교)
3. [ADR-001 제안: 클라이언트·서버 스택](#3-adr-001-제안-클라이언트서버-스택)
4. [기술 스파이크](#4-기술-스파이크)
5. [런타임 구성](#5-런타임-구성)
6. [클라이언트·서버 권한 경계](#6-클라이언트서버-권한-경계)
7. [시뮬레이션·프로토콜](#7-시뮬레이션프로토콜)
8. [예측·재조정·지연 보정](#8-예측재조정지연-보정)
9. [시간 모델: 히트스톱 vs 권위 시계](#9-시간-모델-히트스톱-vs-권위-시계)
10. [지연 공정성](#10-지연-공정성)
11. [룸 할당과 공간 전환](#11-룸-할당과-공간-전환)
12. [연결 끊김·파티·퀘스트 상태](#12-연결-끊김파티퀘스트-상태)
13. [아이템 원장: 트랜잭션·멱등성·장애 복구](#13-아이템-원장-트랜잭션멱등성장애-복구)
14. [데이터 모델](#14-데이터-모델)
15. [보안: Steam 신원·권한·구매](#15-보안-steam-신원권한구매)
16. [채팅·신고·모더레이션](#16-채팅신고모더레이션)
17. [관측성](#17-관측성)
18. [배포·운영](#18-배포운영)
19. [비용 공식](#19-비용-공식)
20. [부하 테스트 게이트](#20-부하-테스트-게이트)
21. [저장소 구조 제안](#21-저장소-구조-제안)
22. [디자인 교차 검토 응답](#22-디자인-교차-검토-응답)
23. [열린 질문](#23-열린-질문)
24. [참고 자료](#24-참고-자료)

---

## 1. 요구사항과 비기능 제약

### 1.1 기능 요구(사용자 요구 → 기술 해석)

| 사용자 요구 | 기술 해석 | 이 문서 위치 |
|---|---|---|
| PC 우선 3D 쿼터뷰 액션 RPG | 데스크톱 패키징, 3D 렌더러, 키보드·마우스 입력 | §2, §3 |
| 타격감 중심 전투, 키보드 분기 콤보 | 입력 지연 최소화를 위한 로컬 예측, 히트스톱·피드백은 클라이언트 연출 | §8, §9 |
| 동작을 바꾸는 전설 무기 | 무기 → 콤보 그래프 ID 매핑을 서버·클라이언트가 같은 데이터로 해석 | §7.4, §14 |
| 제작 | 재료 소비 + 결과 생성을 한 트랜잭션으로 | §13 |
| NPC 퀘스트, 중간보스·보스 | 서버 권위 퀘스트 진행, 목표 단위 저장 | §12 |
| 포탈(귀로등)·웨이포인트 | 룸 간 전환 2단계 예약 | §11 |
| 마을 20~40명, 필드 12~20명, 던전 1~4명 | 공간별 룸 타입과 정원, 관심 영역(AOI) 관리 | §11 |
| 채팅 | 서버 경유 채팅, 필터·신고·차단 | §16 |
| 유료 본편·외형·확장(제안) | Steam 소유권·DLC·마이크로트랜잭션 서버 검증 | §15 |

### 1.2 비기능 제약

| 제약 | 출처 | 의미 |
|---|---|---|
| TypeScript `strict`, `any` 금지(`unknown` + 좁히기) | 상위 `CLAUDE.md`, yeonmu `CLAUDE.md` | 클라이언트·서버·도구 모두 TS 기본 |
| npm 단일 lockfile | 동일 | 워크스페이스는 npm workspaces 사용, pnpm/yarn 혼용 금지 |
| 게임 로직과 렌더링 분리 | 상위 `CLAUDE.md` | 시뮬레이션 패키지는 렌더러·DOM·Node API에 의존하지 않는다 |
| 네이티브 엔진은 명시적 정책 변경 필요 | yeonmu `CLAUDE.md` | §2에서 비교만 하고 채택하지 않는다 |
| 구현·설치·배포 금지(현 단계) | 작업 지시 | 이 문서는 계획이며 의존성 버전은 스파이크 때 고정한다 |
| 성능 약속 금지 | 작업 지시 | 모든 수치는 가설, 게이트에서 측정 |

---

## 2. 스택 비교

### 2.1 비교 축

전투 손맛(입력→화면 지연, 프레임 안정성), 30~40명 마을의 렌더 부하, 권위 서버와 **같은 시뮬레이션 코드를 공유**할 수 있는가, Steam 연동, 팀의 TS 정책, 도구 성숙도를 본다.

### 2.2 클라이언트 패키징(TS 정책 내)

| 후보 | 구성 | 장점 | 위험 | 상태 |
|---|---|---|---|---|
| **A. Electron** | Chromium + Node 메인 프로세스 | 렌더러 버전을 앱이 고정(WebGL2/WebGPU 동작이 OS 웹뷰에 좌우되지 않음). Node 메인 프로세스에서 네이티브 애드온(Steamworks 바인딩) 사용 가능. Electron 45.x가 최신 안정판이고 최근 3개 메이저를 지원 `[공식: releases.electronjs.org, electron-timelines]` | 배포 용량 큼. 보안 설정 실수 시 위험 큼(§15.6). Steam 오버레이 동작은 스파이크 필요 | **권장 후보** |
| B. Tauri v2 | 시스템 웹뷰 + Rust 호스트 | 작은 배포 용량 | 공식 랜딩은 "OS 네이티브 웹 렌더러"라고만 기술 `[공식: v2.tauri.app]`. Windows WebView2 등 구체 웹뷰와 WebGPU 지원 여부 `[미검증]`. 호스트 코드가 Rust라 **TS 정책 예외 필요**. Steam 연동도 Rust 측 구현 | 보류 |
| C. 브라우저 전용 | 웹 배포 | 설치 없음, 빠른 플레이테스트 배포 | Steam 오버레이·구매 흐름과 맞지 않음, 탭 백그라운드 스로틀링 | **플레이테스트용 보조 타깃** |
| D. NW.js | Chromium + Node 혼합 | Electron 유사 | 생태계·문서가 Electron보다 작음 `[미검증]` | 제외 |

### 2.3 렌더러(TS 정책 내)

| 후보 | 장점 | 위험/검증 필요 | 상태 |
|---|---|---|---|
| **three.js** | 웹 3D 사실상 표준, `GLTFLoader`·`AnimationMixer`·`SkeletonUtils`·`WebGPURenderer`가 공식 문서 색인에 있음 `[공식: threejs.org/docs]`. Higgsfield 파이프라인 문서도 three.js `GLTFLoader` + `AnimationMixer` 연동을 예시로 듦 `[공식: higgsfield-ai/skills game-3d-animation.md]` | 엔진이 아닌 렌더러 — 씬 관리·LOD·인스턴싱·애니메이션 블렌딩 상당 부분 직접 구현. WebGPURenderer 성숙도 `[미검증]` | **권장 후보** |
| Babylon.js | 엔진에 가까움(씬, 머티리얼, 애니메이션 그룹, 인스펙터), TS로 작성됨 `[미검증]` | WebGPU·리타깃 지원 세부 `[미검증]`(공식 문서 기능 페이지 미확인) | **스파이크 비교 대상** |
| PlayCanvas | 에디터 포함 | 클라우드 에디터 의존, 팀 워크플로 부합 여부 `[미검증]` | 제외 |

### 2.4 권위 서버(TS 정책 내)

| 후보 | 프레임워크가 제공 | 우리가 구현 | 상태 |
|---|---|---|---|
| **Colyseus 0.18** | 룸 수명주기(`onCreate/onJoin/onLeave/onDispose`), 재접속(`onDrop` + `allowReconnection(client, seconds)`, `onReconnect`), 스키마 바이너리 델타 동기화, `RedisPresence`를 통한 다중 프로세스, 고정 스텝 루프 `setFixedTimestep(step, tickRate)`, 입력 버퍼 `defineInput()`, 클라이언트 예측·재조정 `Predict`/`reconciler`, 원격 보간, 시계 동기화 `room.clock`, 지연 보정 기록 `allowRewindState({ maxRewindMs })`·`rewind.lastSeenBy()`, WebSocket(기본)·uWebSockets.js·WebTransport(실험적) 전송 `[공식: docs.colyseus.io/netcode, /netcode/client-prediction, /netcode/lag-compensation, /room/reconnection, /server/presence, /server/transport/webtransport]` | 결정적 공유 `step` 함수, 입력 의미 검증(`sanitize`는 값 범위 보정만 하고 거부하지 않음), 히트 판정·게임 규칙, 콤보 그래프 검증, 히트스톱 시간 모델(§9), 공간 전환 예약(§11), 원장 연동(§13), Steam 인증(§15) | **권장 후보** |
| 커스텀 `ws`/uWebSockets.js 서버 | 전송만 | 룸·매치메이킹·재접속·동기화·예측 전부 | Colyseus 스파이크 실패 시 대안 |
| Geckos.io 등 WebRTC 데이터채널 | UDP 성격 전송 | 시그널링·NAT·나머지 전부 | `[미검증]`, 보류 |

> **주의(공식 문서 기반):** Colyseus 0.18의 예측 API는 **결정적 공유 step 함수를 전제**로 하며, 가변 스텝 `setTimestep()`은 재생(replay)할 수 없다고 명시한다. 신뢰할 수 없는 채널(`unreliable`)은 WebTransport 전용·실험적이고, WebSocket에서는 신뢰 채널로 대체된다 `[공식: docs.colyseus.io/netcode/client-prediction, /server/transport/webtransport]`. 0.x 버전이므로 **스파이크 시점의 정확한 패치 버전을 고정**하고 마이그레이션 비용을 위험으로 기록한다.

### 2.5 네이티브 대안(정책 변경 필요 — 채택하지 않음)

TypeScript 정책을 바꿔야만 쓸 수 있으므로 **비교 기록만** 남긴다. 아래 장점·약관은 이 작업에서 공식 문서로 확인하지 않았다(`[미검증]`).

| 대안 | 언어 | 기대 장점 | 비용·위험 | 전환 트리거(§4 스파이크 결과 기준) |
|---|---|---|---|---|
| Unreal Engine 5 | C++ (+Blueprint) | 3D 렌더·애니메이션 도구, 데디케이티드 서버·리플리케이션 내장 | TS 정책 폐기, 빌드·서버 바이너리 운영 복잡, 로열티·약관 확인 필요 | S1·S2 실패가 렌더 한계로 원인 확정될 때 |
| Unity | C# | 에셋 생태계, 넷코드 패키지 존재 | 런타임·서비스 약관 변동 이력 확인 필요, 서버 로직 공유를 C#으로 재작성 | 동일 |
| Godot 4 | GDScript/C# | 오픈소스(MIT), 가벼움 | 대규모 온라인 사례·3D 성능 검증 필요. 참고: Colyseus SDK 문서에 Godot SDK(0.18.4 이상) 표기 `[공식: docs.colyseus.io/sdk]` — 서버는 TS 유지 가능성 있음 | 클라이언트만 교체하는 혼합안 검토 시 |

**혼합안**: 서버·시뮬레이션은 TS(Node) 유지, 클라이언트만 네이티브 엔진으로 교체. 이 경우 공유 시뮬레이션 코드를 클라이언트 언어로 이중 구현해야 하므로 예측 불일치 위험이 커진다. 정책 변경과 함께 별도 ADR이 필요하다.

---

## 3. ADR-001 제안: 클라이언트·서버 스택

```text
ADR-001  클라이언트·서버 스택
상태     Proposed (승인 전, 스파이크 S1~S8 결과로 확정/폐기)
날짜     2026-11-07
```

**맥락.** 전투 손맛이 최우선(P1), 서버 권위 온라인, TS strict·npm 정책, 소규모 팀 가정.

**결정(제안).**

1. 언어: TypeScript strict 전 계층. 런타임 Node.js LTS — 공식 페이지 기준 최신 LTS는 v26 계열 `[공식: nodejs.org/en/about/previous-releases]`. Active/Maintenance 구분은 `[미검증]`, 스파이크 시점에 재확인 후 고정.
2. 클라이언트: **Electron + three.js**. 렌더러 프로세스는 샌드박스·컨텍스트 격리 유지, Steam·파일 접근은 메인 프로세스만.
3. 서버: **Node.js + Colyseus 0.18** 룸 서버. 신뢰 채널(WebSocket) 기본, WebTransport는 실험 브랜치에서만.
4. 공유 시뮬레이션: `packages/sim` 순수 TS 패키지를 서버·클라이언트·봇이 공유(§7.2).
5. 영속: PostgreSQL(원장·캐릭터·퀘스트의 진실 원천), Redis(프레즌스·룸 레지스트리·세션 캐시 — 진실 원천 아님). 구체 매니지드 서비스는 미정.
6. Babylon.js는 S1에서 three.js와 비교만 하고 채택 여부를 결정.

**결과.** 공유 TS 시뮬레이션으로 예측·서버·봇 일관성 확보. 대신 GC 일시정지, 단일 스레드 틱 예산, Chromium 배포 용량, Electron 보안 설정 책임을 진다.

**대안.** §2.2~§2.5. 네이티브 전환은 정책 변경 ADR 필요.

**폐기 조건(하나라도 해당되면 재검토).**
- S1: 목표 사양에서 마을 장면 렌더 프레임 시간이 예산을 지속적으로 넘고, 최적화 후보(인스턴싱·LOD·임포스터)를 적용해도 개선되지 않음.
- S2: 입력→첫 반응 프레임 지연이 네이티브 참조 구현 대비 체감 차이가 플레이테스트에서 유의미하게 확인됨.
- S3: Steam 인증·오버레이·구매 승인 흐름이 Electron 메인 프로세스 경유로 동작하지 않음.
- S4: 룸 서버 틱 p99가 목표 정원에서 틱 간격 예산을 넘고 프로파일링으로 해결 불가.

---

## 4. 기술 스파이크

각 스파이크는 **질문 하나**에 답하고 결과를 `측정값`으로 남긴다. 기준값은 제안이며 스파이크 착수 시 확정한다. 순서와 의존은 [delivery-and-business.md §3](delivery-and-business.md#3-백로그와-의존성)에서 관리한다.

| ID | 질문 | 방법 | 통과 기준(제안) | 실패 시 |
|---|---|---|---|---|
| S1 렌더 | 쿼터뷰 마을에 스킨드 캐릭터 40체 + 환경을 목표 PC에서 안정적으로 그릴 수 있나 | three.js / Babylon.js 각각 동일 GLB·카메라로 벤치 씬. 최소·권장 사양 PC 각 1대 이상 | 프레임 시간 p95가 목표 프레임 예산 이하, 장시간(30분) 메모리 증가 없음 | LOD·임포스터·애니메이션 업데이트 빈도 감소 → 그래도 실패 시 ADR 재검토 |
| S2 입력 지연 | 키 입력 → 공격 모션 첫 프레임까지 지연 | 고속 카메라 촬영 또는 입력 타임스탬프 + 프레임 프레젠트 계측. 브라우저/Electron 비교 | 측정값 기록 후 디자인과 기준 합의(현재 미정) | 렌더 파이프라인·vsync 정책 조정 |
| S3 Steam | Electron 메인 프로세스에서 `GetAuthTicketForWebApi` → 서버 `AuthenticateUserTicket`, 오버레이, `MicroTxnAuthorizationResponse_t` 수신 | steamworks.js(개인 유지보수, MIT) 또는 자체 N-API 바인딩. **steamworks.js README의 `nodeIntegration: true`·`contextIsolation: false` 권장은 Electron 보안 체크리스트와 충돌**하므로 메인 프로세스 전용 사용 + IPC로 검증 `[공식: github.com/ceifa/steamworks.js, electronjs.org/docs/latest/tutorial/security]` | 렌더러 격리 유지 상태에서 세 흐름 모두 성공 | 자체 바인딩 또는 NW.js/네이티브 래퍼 검토 |
| S4 서버 틱 | 마을 40명 / 던전 4명 + 적 N체에서 틱 시간 | Colyseus `setFixedTimestep` + 공유 sim + 헤드리스 봇 | 틱 p99가 틱 간격의 50% 이하(제안), GC 일시정지 분포 기록 | AOI 축소, 틱 레이트 차등, 워커 분리 |
| S5 예측 | 지연·손실 주입 하에서 이동·콤보 예측 보정 크기 | Colyseus `Predict.reconciler` vs 자체 구현 비교, `tc`/프록시로 지연 50/100/150ms·손실 1~3% 주입 | 보정 스냅 빈도·크기 측정값 기록, 디자인 체감 테스트 통과 | 보정 스무딩·입력 지연 버퍼 조정 |
| S6 히트스톱 | 액션 로컬 시간(§9)으로 서버·클라이언트 콤보 창이 일치하는가 | 2~4 클라이언트, 지연 주입, 판정 불일치 로그 | 불일치 사례 원인 분류 완료, 허용 규칙 합의 | 모델 수정 |
| S7 원장 | 중복 요청·프로세스 강제 종료에서 중복 지급/유실 0 | 장애 주입 테스트(§13.7) | 위반 0건 | 출시 차단 |
| S8 전송 | WebSocket(TCP) 헤드오브라인 차단이 손실 환경에서 전투에 주는 영향 | 손실 주입 비교, WebTransport 실험 브랜치 | 측정값 기록, WebSocket 유지 여부 결정 | WebTransport 또는 커스텀 UDP 검토 |

---

## 5. 런타임 구성

```text
                         ┌──────────────────────────────┐
  [Electron Client]      │ Edge (TLS 종료, L7 라우팅)   │
  ├ Renderer (three.js,  └──────────────┬───────────────┘
  │   sim 예측, UI)                     │
  └ Main (Steamworks,         ┌─────────┴─────────┐
      업데이트, 로그)         │                   │
         │  HTTPS             ▼                   ▼
         └──────────▶  [Gateway/Auth API]   [Matchmaker / Allocator]
                        │  Steam 티켓 검증     │  룸 레지스트리(Redis)
                        │  세션 발급           │  좌석 예약 토큰
                        ▼                      ▼
                 [Account/Character Svc]   [Room Servers (Colyseus)]
                        │                   ├ TownRoom   (정원 가설 20~40)
                        │                   ├ FieldRoom  (정원 가설 12~20)
                        │                   └ DungeonRoom(1~4, 파티 전용)
                        │                      │  경제 의도(op)
                        ▼                      ▼
                 [PostgreSQL] ◀──────── [Ledger Svc] ──▶ [Steam Web API]
                        ▲                   (구매 확정·대사)
                 [Party/Social Svc]  [Chat Svc] ──▶ [Moderation Queue]
                        │
                 [Telemetry 수집 → 메트릭·로그·트레이스 저장소]
```

- **룸 서버는 상태ful 프로세스**이며 진실 원천이 아니다. 캐릭터·인벤토리·퀘스트 진행의 진실 원천은 PostgreSQL이다.
- 파티·친구·차단 목록은 룸 밖 서비스가 소유한다(룸 전환에도 유지되어야 하므로).
- 초기에는 Gateway·Matchmaker·Ledger·Party·Chat을 **하나의 Node 프로세스(모듈 경계 유지)** 로 배포해도 된다. 서비스 분리는 부하 측정 후 결정 `[제안]`.

---

## 6. 클라이언트·서버 권한 경계

| 영역 | 클라이언트 | 서버(권위) | 비고 |
|---|---|---|---|
| 입력 | 수집·버퍼링·전송, 로컬 예측에 즉시 사용 | 수신·범위 검증·의미 검증(콤보 그래프 합법성, 쿨다운) | 클라이언트 타임스탬프는 상한이 있는 힌트로만 사용 |
| 내 캐릭터 이동 | 예측 | 최종 위치, 속도 상한·충돌 검증 | 재조정(§8) |
| 콤보 진행 | 예측(모션 즉시 재생) | 노드 전이 확정, 거부 시 클라이언트 롤백 | |
| 히트 판정 | 예측 피드백(히트스톱·이펙트·임시 데미지 숫자) | 히트 여부·데미지·상태이상 확정 | 예측 피드백은 취소 가능하게 연출(§8.4) |
| 적 AI | 보간 표시만 | 전부 | |
| 회피 무적·패링 | 예측 표시 | 판정 확정(제한된 되감기 허용) | §10 |
| 드랍·제작·인벤토리·화폐 | 요청만 | 원장 서비스 경유 확정 | 클라이언트 예측 금지 |
| 퀘스트 진행 | 표시 | 목표 단위 확정·저장 | |
| 카메라·사운드·VFX·UI | 전부 | 없음 | 다른 플레이어 VFX 밀도는 클라이언트 설정 |
| 채팅 | 입력·표시 | 필터·속도 제한·차단 적용·저장 | |
| 소유권·DLC·구매 | 표시·Steam 오버레이 트리거 | Steam Web API로 검증 | §15 |

원칙: **돈·아이템·진행에 영향을 주는 결정은 서버만 내린다. 손맛에 영향을 주는 표현은 클라이언트가 먼저 낸다.**

---

## 7. 시뮬레이션·프로토콜

### 7.1 틱 레이트(가설)

| 룸 | 시뮬레이션 틱(가설) | 이유 | 검증 |
|---|---|---|---|
| DungeonRoom | 30Hz, 필요 시 서브스텝 | 콤보 창·패링 창이 수십~150ms 단위라 33ms 해상도가 하한에 가까움. Colyseus는 `setFixedTimestep(step, 30, { subSteps: 2 })` 형태의 서브스텝을 지원 `[공식: docs.colyseus.io/netcode/server-input]` | S4, S6 |
| FieldRoom | 20~30Hz | 전투 있음, 인원 많음 | S4 |
| TownRoom | 10~15Hz | 비전투, 이동·감정표현 위주 | S4 |

틱 레이트와 **스냅샷(패치) 전송률**은 분리한다. Colyseus의 패치 기본값과 변경 방법은 읽은 공식 페이지에서 확인하지 못했다 `[미검증]` — S5에서 확인.

### 7.2 공유 시뮬레이션 패키지 규칙

- `packages/sim`은 DOM·three.js·Node API를 import하지 않는다(정적 검사로 강제 `[제안]`).
- 입력: 고정 dt, 상태, 입력 → 다음 상태. 같은 입력이면 같은 결과.
- **결정성 주의:** JS `number`는 IEEE-754 배정밀도지만 `Math.sin` 등 초월함수 결과는 엔진·버전 간 동일함이 보장되지 않는다 `[미검증 — 명세상 근사 허용으로 알려짐]`. 권위 판정에 쓰는 각도는 **양자화된 정수(예: 0~65535)와 룩업 테이블**로 처리 `[제안]`.
- 난수: 시드 고정 PRNG, 서버가 시드 소유. 예측 재생 시 같은 값을 쓰도록 Colyseus `ctx.memo` 계열 기능 활용 가능성 `[공식(요약 출처): docs.colyseus.io/netcode/client-prediction]` — S5에서 확인.
- 재생 중 일회성 연출 금지: 공식 문서 권고대로 `ctx.isReplay` 확인 후 연출 `[공식: 동일]`.

### 7.3 메시지 분류

| 채널 | 내용 | 전송 | 비고 |
|---|---|---|---|
| 입력 스트림 | `InputFrame` | Colyseus `room.input()` (신뢰, WebSocket) | 스키마는 평면 원시 타입만 허용 `[공식: docs.colyseus.io/netcode/server-input]` |
| 상태 동기화 | 엔티티 위치·상태·HP | Colyseus 스키마 델타 | AOI 필터 필요(§11.5) |
| 전투 이벤트 | `HitConfirmed`, `HitRejected`, `ComboRejected`, `StatusApplied` | `client.send` / `broadcast` | 예측 이벤트 확정·거부 |
| 신뢰 요청 | 제작·장착·퀘스트 수락·포탈 사용 | `room.request()`(TS 전용, 기본 타임아웃 10초 `[공식: docs.colyseus.io/sdk]`) 또는 HTTPS API | 반드시 `requestId`(멱등 키) 포함 |
| 채팅 | 텍스트 | 채팅 서비스(별도 연결 또는 룸 메시지) | §16 |

### 7.4 메시지 계약 스케치(제안, 구현 아님)

```ts
// packages/protocol — 버전은 핸드셰이크에서 협상, 불일치 시 접속 거부
export const PROTOCOL_VERSION = 1 as const;

/** 고정 스텝당 1개. 평면 원시 타입만(프레임워크 제약). */
export interface InputFrame {
  seq: number;          // uint32, 클라이언트 단조 증가
  moveX: number;        // int8 양자화 -127..127
  moveY: number;
  aimYaw: number;       // uint16 양자화 각도
  buttons: number;      // 비트마스크: LIGHT, HEAVY, DODGE, PARRY, INTERACT ...
  pressEdges: number;   // 이 스텝에서 새로 눌린 버튼(박자 분기 판정용)
}

export interface HitConfirmed {
  attackerId: string;
  targetId: string;
  actionInstanceId: number;  // 예측 이벤트와 매칭
  hitIndex: number;          // 한 동작의 n번째 타격
  damage: number;
  hitstopTicks: number;      // §9: 액션 로컬 시간 정지량(데이터 테이블 값 그대로)
  serverTick: number;
}

export interface ReliableRequest<TType extends string, TPayload> {
  type: TType;
  requestId: string;         // UUIDv7 권장, 원장 멱등 키로 전파
  payload: TPayload;
}
```

### 7.5 콤보 그래프와 무기 데이터

- 콤보 그래프는 **데이터**(노드: 동작 ID, 입력 조건, 박자 창, 캔슬 창, 히트 프레임)이며 서버·클라이언트가 같은 빌드 산출물(`content/combat/*.json`)을 읽는다. 해시를 핸드셰이크에 포함해 불일치 시 접속 거부 `[제안]`.
- 전설 무기(잔향구)는 **그래프 패치**(노드 추가·교체)로 표현한다. 장착 변경은 신뢰 요청이며 전투 중 금지 여부는 디자인 결정.
- 애니메이션 클립의 프레임 마커는 아트 파이프라인이 사이드카 JSON으로 내보내고, **서버는 GLB를 읽지 않는다**([art-and-animation.md §8](art-and-animation.md#8-glb-계약)).

---

## 8. 예측·재조정·지연 보정

### 8.1 프레임워크 제공 vs 직접 구현

| 기능 | Colyseus 0.18 제공 `[공식: docs.colyseus.io/netcode/*]` | 직접 구현 |
|---|---|---|
| 고정 스텝 루프·클라이언트 공지 | `setFixedTimestep` | — |
| 입력 버퍼·ack·idle 정책 | `defineInput({ bufferMaxSize, idle, sanitize })` | 의미 검증(콤보 합법성, 쿨다운) |
| 내 엔티티 예측·재조정·보정 감쇠 | `Predict.get` + `predict.reconciler({ step, smoothMs })` | `step` 함수 자체, 순간이동 등 불연속 `reset()` 호출 |
| 원격 엔티티 보간 | `predict.attachAll(mode: lerp/extrapolate/damped/reckon)` | 모드 선택·튜닝 |
| 예측 이벤트 확정/거부 | `predict.defineEvent`(요약 출처, 재확인 필요) | 이벤트별 롤백 연출 |
| 시계 동기화·RTT | `room.clock` (`serverNow`, `rtt`, `jitter`) (요약 출처) | 액션 로컬 시간(§9) |
| 지연 보정 기록·되감기 | `allowRewindState({ maxRewindMs })`, `rewind.lastSeenBy(sessionId)` — 기본 500ms, 실제 되감기 ≈ renderDelay + RTT + 1틱 | 히트 판정, 되감기 상한 정책(§10) |

**판단:** 프레임워크 기능을 쓰되, 전투 판정·콤보·히트스톱 규칙은 우리 코드다. "Colyseus가 예측을 해 준다"가 아니라 "예측 **루프**를 제공하고 우리는 결정적 `step`과 판정 규칙을 공급한다"로 이해한다. S5에서 자체 구현과 비교한다.

### 8.2 내 캐릭터

1. 매 고정 스텝: 입력 생성 → 로컬 `step` 적용 → 전송.
2. 서버 스냅샷 수신: ack된 seq 이후 입력만 남기고, 권위 상태에서 재생.
3. 오차가 임계값 이하면 `smoothMs` 동안 감쇠, 초과하면 스냅(임계값은 S5에서 측정 후 결정).

### 8.3 원격 엔티티

- 다른 플레이어·적은 **과거 시점 보간**(lerp)이 기본. 보간 지연은 스냅샷 간격 × 2 수준에서 출발해 지터 기반 조정 `[제안]`.
- 적의 공격 텔레그래프는 **서버가 시작 틱을 보내고** 클라이언트는 보간 지연을 고려해 텔레그래프를 앞당겨 표시하지 않는다(공정성: 보이는 대로 회피하면 판정도 그 시점 기준, §10).

### 8.4 예측 피드백의 취소

| 상황 | 클라이언트 표현 |
|---|---|
| 예측 히트 → 서버 확정 | 그대로 유지, 데미지 숫자 확정 색상으로 전환 |
| 예측 히트 → 서버 거부 | 히트스톱·스파크는 이미 재생됨(되돌리지 않음). 데미지 숫자 미표시 또는 흐리게 소멸. 적 HP 바는 서버 값만 반영 |
| 예측 콤보 → 서버 거부(`ComboRejected`) | 다음 노드 모션을 캔슬해 서버 확정 노드로 블렌드. 거부율을 텔레메트리로 집계(§17) |

데미지 숫자를 확정 전까지 띄우지 않을지, 임시로 띄울지는 S6 플레이테스트로 결정한다.

---

## 9. 시간 모델: 히트스톱 vs 권위 시계

### 9.1 문제

히트스톱(타격 순간 수십 ms 정지)은 손맛의 핵심이지만, 서버 틱을 멈출 수는 없다. 4인 파티에서 각자 히트스톱이 다르게 걸리면 콤보 창과 적 행동이 어긋난다.

### 9.2 세 개의 시계

| 시계 | 소유 | 정지 가능 | 용도 |
|---|---|---|---|
| **서버 틱** `serverTick` | 서버 | 불가, 항상 진행 | 적 AI, 이동, 투사체, 지연 보정 기준 |
| **액션 로컬 시간** `actionTick` (엔티티별) | 서버 권위, 클라이언트 예측 | **가능** — 히트스톱 동안 해당 공격자의 현재 동작 타임라인만 멈춤 | 콤보 박자 창, 캔슬 창, 히트 프레임 |
| **표현 시간** `presentationTime` | 클라이언트 | 가능(연출용 슬로모션 포함) | 애니메이션 재생, 카메라 흔들림, VFX, 사운드 |

### 9.3 규칙(제안)

1. 히트 확정 시 공격자의 `actionTick`은 `hitstopTicks`(데이터 테이블 값) 동안 진행을 멈춘다. **서버와 클라이언트가 같은 데이터·같은 틱 단위로** 멈추므로 박자 창은 어긋나지 않는다.
2. 피격자(적)의 경직도 데이터 기반 `actionTick` 정지로 표현한다. 적 AI의 다른 판단(위치 이동 등)은 서버 틱으로 계속 진행.
3. 클라이언트는 예측 히트 순간 자기 캐릭터의 **표현 시간**을 즉시 멈추고(손맛), 서버 확정이 오면 `actionTick` 정렬을 확인한다. 거부되면 남은 정지를 즉시 해제하고 따라잡는다.
4. 다른 플레이어의 히트스톱은 **그 엔티티의 표현에만** 적용한다. 화면 전체를 멈추는 히트스톱은 1인 던전에서만 허용할지 디자인과 결정 `[열린 질문]`.
5. **입력 버퍼(디자인 제안 150ms)와 박자 창은 `actionTick` 기준**으로 정의한다. 벽시계(ms) 기준으로 정의하면 히트스톱 길이에 따라 창이 줄어든다.
6. 사운드는 정지하지 않는다(타격음은 히트스톱 시작에 재생). 세부는 [art-and-animation.md §5](art-and-animation.md#5-사운드).

### 9.4 입력 시점 해석

- 서버는 클라이언트 seq와 고정 스텝 매핑으로 "어느 스텝의 입력인가"를 안다. 클라이언트 벽시계 타임스탬프는 신뢰하지 않는다.
- 박자 판정은 "입력이 적용된 스텝의 `actionTick`"으로 한다. 지연 때문에 입력이 늦게 도착해도 seq 순서대로 적용되므로 박자 판정 자체는 지연과 무관하다. 단, 버퍼가 비어 서버가 idle 처리한 스텝 이후 늦게 도착한 입력의 처리 정책(버림 / 상한 내 재적용)은 S6에서 결정한다.

---

## 10. 지연 공정성

이 게임의 실시간 상호작용은 대부분 **PvE**(플레이어 vs 서버 적)다. PvP는 범위 밖이다([concept.md §9](../design/concept.md#scope-out)). 따라서 원칙은 "**상한 안에서 플레이어에게 유리하게**".

| 판정 | 규칙(제안) | 상한 |
|---|---|---|
| 플레이어 → 적 히트 | 공격자가 본 적 위치로 되감아 판정(`rewind.lastSeenBy`) | `maxRewindMs`(프레임워크 기본 500ms). 우리는 더 작게 시작해 S6에서 결정 |
| 적 → 플레이어 히트, 회피·패링 | 플레이어의 회피·패링 입력 스텝이 적 히트 프레임 이전이면 성공(입력 seq 기준) | 같은 상한. 상한 초과 지연은 실패 처리 |
| 파티원끼리 | 버프·회복 등 서버 확정 | — |

- 고지연 플레이어가 상한 끝에서 회피에 성공하면, 다른 파티원 화면에선 "맞았는데 안 맞은" 장면이 보일 수 있다. PvE에선 허용 범위로 본다(디자인 교차 검토 항목 2 응답).
- 지역: 첫 출시 리전 1곳 가설(한국어 우선이므로 동북아 리전 후보) `[제안]`. 다른 지역 플레이어 RTT는 측정 후 지역 추가 결정.
- 매칭은 같은 리전 우선, 파티 초대는 리전 무관 허용하되 RTT 경고 표시.
- 지연 표시: 화면에 RTT·손실 아이콘. 높은 지연에서 패링 창을 늘리는 **자동 보정은 하지 않는다**(악용 가능).

---

## 11. 룸 할당과 공간 전환

### 11.1 룸 타입

| 타입 | 정원(가설) | 생성 | 해체 | 영속 |
|---|---|---|---|---|
| TownRoom (채널) | 목표 20~40, 하드캡은 S4 측정 후 | 기존 채널 점유율이 상한 근접 시 새 채널 | 비어 있고 유예 경과 | 없음(위치는 체크포인트) |
| FieldRoom | 12~20 | 마을 채널과 연계 또는 독립 | 동일 | 공개 이벤트 진행 상태는 룸 수명 동안만 |
| DungeonRoom | 1~4, 파티 전용 | 입장 시 | 파티 전원 이탈 + 재접속 유예 종료 | 런 ID, 체크포인트, 보상 지급 기록 |
| SoloStoryRoom | 1 | 튜토리얼·컷신 | 종료 시 | 퀘스트 진행만 |

### 11.2 할당 규칙

- 마을: (1) 파티원이 있는 채널 → (2) 친구 → (3) 점유율이 목표 범위 중간에 가까운 채널. 디자인 제안대로 20 미만 채널은 병합 후보로 표시하되, **강제 이동은 하지 않고** 다음 전환 시 재배치 `[제안]`.
- 레지스트리: Colyseus `RedisPresence` 기반 다중 프로세스 `[공식: docs.colyseus.io/server/presence]`. 매치메이킹 플래그 `locked/private/unlisted` 및 `setMatchmaking()` 사용 `[공식: docs.colyseus.io/matchmaker/visibility]`. `filterBy` 세부 시그니처 `[미검증]`.

### 11.3 전환 프로토콜(포탈·귀로등·던전 입장)

2단계 예약. 모든 단계는 `transitionId`(UUID)로 멱등.

```text
Client          SourceRoom         Allocator          Character Svc       TargetRoom
  │ usePortal(reqId) │                  │                    │                  │
  │─────────────────▶│ 조건 검증(퀘스트·파티 준비·전투 중 아님)          │
  │                  │ reserve(transitionId, party) ─▶│        │                  │
  │                  │                  │ 대상 선택/생성, 좌석 예약(TTL) ───────▶│
  │                  │ checkpoint(transitionId, 위치·HP·버프) ─▶│                │
  │                  │                  │                    │ 커밋              │
  │◀─ seatToken(서명, TTL, transitionId) ─│                    │                  │
  │ 연결 종료(소스)   │ 플레이어 엔티티 '이동 중' 표시 후 제거                  │
  │──────────────────────────────── join(seatToken) ─────────────────────────────▶│
  │                  │                  │                    │◀─ load(transitionId)
  │◀────────────────────────────────── 입장 완료 ─────────────────────────────────│
```

| 실패 지점 | 처리 |
|---|---|
| 예약 실패(정원·생성 실패) | 소스에 머무름, 에러 표시, 체크포인트 미작성 |
| 체크포인트 저장 실패 | 예약 취소, 소스에 머무름 |
| 토큰 발급 후 클라이언트가 대상 접속 실패 | 토큰 TTL 내 재시도. TTL 만료 시 **체크포인트 기준 마지막 안전 마을**로 복귀 |
| 대상 룸 크래시 | 클라이언트 재접속 시 Allocator가 새 룸 배정, 체크포인트 로드 |
| 같은 transitionId 재요청 | 기존 예약·토큰 반환(중복 생성 금지) |

### 11.4 파티 동반 전환

- 던전 입장: 파티장이 요청 → 전원 '준비' 상태 확인 → 파티 단위 예약(좌석 n개) → 각자 토큰. 일부 실패 시 성공한 인원만 입장할지, 전원 취소할지는 디자인 결정 `[열린 질문]` — 기본안은 **전원 취소 후 재시도**.

### 11.5 관심 영역(AOI)

마을 40명이면 모든 엔티티를 모두에게 보내지 않아도 될 수 있다. 셀 그리드 기반 AOI로 원거리 플레이어는 낮은 빈도 갱신 `[제안]`. Colyseus 스키마의 클라이언트별 필터링 방식은 `[미검증]` — S4에서 확인.

---

## 12. 연결 끊김·파티·퀘스트 상태

### 12.1 상태 소유권

| 상태 | 소유자 | 저장 | 룸 크래시 시 |
|---|---|---|---|
| 계정·캐릭터 외형·장착 | Character Svc | PostgreSQL | 영향 없음 |
| 인벤토리·화폐·제작 결과 | Ledger Svc | PostgreSQL(원장) | 영향 없음(§13) |
| 퀘스트 진행 | Character Svc | 목표 단위 커밋 | 마지막 커밋 목표로 복원 |
| 파티 구성·파티장 | Party Svc | Redis + 주기 저장 | 영향 없음 |
| 위치·HP·버프 | 룸 | 전환·주기 체크포인트 | 마지막 체크포인트 |
| 던전 런(보스 페이즈 등) | DungeonRoom | 체크포인트 이벤트만 | 런 실패 처리, 입장 재료 보상 정책(§13.6) |
| 공개 이벤트 진행 | FieldRoom | 없음 | 소실(기여도 보상은 확정분만) |

### 12.2 재접속

- Colyseus `onDrop` → `allowReconnection(client, seconds)`로 좌석 유지 `[공식: docs.colyseus.io/room/reconnection]`. 디자인 제안 **180초**를 기본값 후보로 둔다.
- 유예 동안 캐릭터는 **방어 상태로 남는다**(적 어그로 해제·피해 감소 등 디자인 결정). 보스전 중 재입장 차단은 디자인 요구이며, 서버는 "보스 페이즈 진행 중" 플래그로 신규 입장만 막고 **기존 좌석 재접속은 허용**한다 `[제안 — 디자인 확인 필요]`.
- 유예 만료: `onLeave` → 체크포인트 기준 마을로 이동, 파티 유지(파티 서비스 소유). 던전 좌석 반환.
- 클라이언트 크래시와 네트워크 끊김을 구분하지 않는다(서버는 알 수 없음).
- 프로세스 재시작으로 룸이 사라진 경우 재접속 토큰은 무효 → Allocator 경유 복구.

### 12.3 퀘스트 진행

- 퀘스트는 목표(objective) 단위로 이벤트를 받는다: `ObjectiveProgressed(questId, objectiveId, delta, sourceEventId)`.
- `sourceEventId`(예: 처치 이벤트 ID)로 중복 반영 방지.
- 파티 공유 목표는 각자 진행에 기록(개인 진행 원칙). 보스 처치 크레딧은 처치 시점 던전 좌석 보유자에게 부여.

---

## 13. 아이템 원장: 트랜잭션·멱등성·장애 복구

### 13.1 원칙

1. **모든 아이템·화폐 변화는 원장 연산(Operation)** 이다. 인벤토리 테이블은 원장의 결과(물질화된 뷰)이며 직접 UPDATE 금지.
2. 연산마다 **결정적 멱등 키** `opKey`. 같은 키는 한 번만 적용.
3. 한 연산은 **한 DB 트랜잭션**: 소비·생성·잔액 변화·연산 기록을 함께 커밋.
4. 룸 서버는 결과를 낙관적으로 표시하지 않는다. 원장 확정 후 표시.

### 13.2 멱등 키 설계

| 연산 | opKey 구성(제안) | 이유 |
|---|---|---|
| 처치 드랍 | `loot:{runId}:{encounterId}:{characterId}:{dropIndex}` | 재시도·중복 이벤트에도 같은 키 |
| 보스 보상 상자 | `reward:{runId}:{characterId}` | 런당 1회 |
| 채집 | `gather:{nodeInstanceId}:{characterId}:{cycle}` | 개인 노드 |
| 제작 | `craft:{requestId}` | 클라이언트 요청 단위 |
| 구매 지급 | `purchase:{steamOrderId}:{itemLine}` | Steam orderid 기준 1회 |
| 환불·차지백 회수 | `revoke:{steamOrderId}:{itemLine}:{status}` | 상태 전이당 1회 |
| 운영 보상 | `ops:{ticketId}:{characterId}` | 감사 추적 |

### 13.3 연산 흐름

```text
Room → Ledger.apply({ opKey, kind, characterId, inputs[], outputs[], context })
  BEGIN
    INSERT INTO ledger_operations (op_key, ...) ON CONFLICT (op_key) DO NOTHING
    → 이미 있으면: 저장된 결과 반환 (멱등 응답), COMMIT
    → 새 연산이면:
       입력 아이템 행 잠금(SELECT ... FOR UPDATE), 소유·수량·잠금 상태 검증
       ledger_entries 삽입 (항목별 +/-)
       item_instances / stack_balances 갱신
       결과 스냅샷 저장
  COMMIT
Room ← { status: applied | duplicate | rejected(reason), result }
```

- 격리 수준은 Serializable 또는 행 잠금 + Read Committed 중 S7에서 결정 `[제안]`.
- 거부 사유: `insufficient`, `not_owner`, `item_locked`, `recipe_version_mismatch`, `inventory_full`.

### 13.4 고유 아이템(전설 무기·잔향구)

- `item_instances`에 고유 ID, `definitionId`, `createdByOpKey`(출처), `boundTo`(귀속), 롤 결과(있다면).
- 출처 추적으로 복제 의심 시 "어느 연산에서 생겼는가"를 역추적.
- 거래는 범위 밖. 열 때는 소유 이전도 원장 연산으로만.

### 13.5 제작

- 레시피는 버전 관리(`recipeId@version`). 요청에 버전 포함, 서버 현재 버전과 다르면 거부.
- 입력 소비 + 출력 생성 단일 트랜잭션. 무작위 결과가 있으면 시드를 `opKey`에서 파생해 재시도에도 같은 결과.

### 13.6 장애 복구

| 장애 | 결과 | 복구 |
|---|---|---|
| 원장 커밋 전 룸 크래시 | 연산 없음 | 플레이어는 드랍을 못 받은 상태. 던전 런 실패 정책: 입장 재료를 `refund:{runId}:{characterId}`로 환불 `[제안]` |
| 원장 커밋 후 응답 전 룸 크래시 | 연산 확정 | 재접속 시 인벤토리에 존재. 룸 재시도 시 `duplicate` 응답 |
| 원장 응답 타임아웃 | 불명 | **같은 opKey로 재시도**(안전). 새 키 생성 금지 |
| DB 장애 | 쓰기 불가 | 경제 연산 요청 큐잉 금지, 거부 후 UI 안내. 전투는 계속 가능하되 보상 지급 지연 표시 여부는 디자인 결정 |
| DB 복구(PITR) | 시점 이후 연산 유실 가능 | Steam 구매는 `GetReport` 대사로 재지급(§15.4). 게임 내 드랍 유실은 공지·보상 정책 |

### 13.7 검증(S7 시나리오)

1. 같은 opKey 동시 100회 → 적용 1, duplicate 99.
2. 제작 트랜잭션 중간 프로세스 kill → 입력·출력 둘 다 없거나 둘 다 있음.
3. 원장 응답 지연 주입 → 룸 재시도 → 중복 없음.
4. 구매 지급 중 서버 재시작 → 재시작 후 대사 작업이 정확히 1회 지급.
5. 차지백 상태 재통지 → 회수 1회.
6. 불변식 검사: 모든 캐릭터에 대해 `Σ ledger_entries = 현재 잔액`, 고유 아이템 소유자 1명.

---

## 14. 데이터 모델

### 14.1 TS 타입 스케치

```ts
type SteamId64 = string & { readonly __brand: 'SteamId64' };
type CharacterId = string & { readonly __brand: 'CharacterId' };

interface Account {
  accountId: string;
  steamId: SteamId64;
  createdAt: string;
  status: 'active' | 'suspended' | 'banned';
  chatRestrictionUntil: string | null;
}

interface Entitlement {
  accountId: string;
  steamAppId: number;          // 본편 또는 DLC AppID
  ownsApp: boolean;
  permanent: boolean;          // false: 패밀리 공유·무료 주말 등
  checkedAt: string;           // 캐시 TTL 판단
}

interface Character {
  characterId: CharacterId;
  accountId: string;
  appearancePresetId: string;
  equippedWeaponInstanceId: string | null;
  equippedRelicInstanceIds: string[];   // 잔향구, 슬라이스 1개
  lastSafeCheckpoint: Checkpoint;
  version: number;                      // 낙관적 잠금
}

interface Checkpoint {
  spaceId: 'town' | 'field' | 'dungeon' | 'story';
  zoneId: string;
  position: [number, number, number];
  hp: number;
  transitionId: string | null;
  savedAt: string;
}

interface QuestProgress {
  characterId: CharacterId;
  questId: string;
  state: 'available' | 'active' | 'completed' | 'turned_in';
  objectives: Record<string, number>;
  appliedSourceEventIds: string[];      // 최근 N개, 중복 방지
}

interface LedgerOperation {
  opKey: string;
  kind: 'loot' | 'reward' | 'gather' | 'craft' | 'purchase' | 'revoke' | 'refund' | 'ops';
  characterId: CharacterId;
  context: Record<string, string>;      // runId, recipeId@version, steamOrderId ...
  result: 'applied' | 'rejected';
  createdAt: string;
}

interface PurchaseOrder {
  orderId: string;                      // Steam InitTxn orderid (서버 발급 64비트)
  steamId: SteamId64;
  lines: { itemId: string; qty: number; amountCents: number }[];
  currency: string;
  state: 'initiated' | 'authorized' | 'finalized' | 'granted' | 'failed' | 'refunded' | 'chargedback';
  steamTransId: string | null;
  updatedAt: string;
}
```

### 14.2 핵심 테이블(PostgreSQL 제안)

| 테이블 | 키·제약 |
|---|---|
| `accounts` | PK `account_id`, UNIQUE `steam_id` |
| `entitlements` | PK (`account_id`, `steam_app_id`) |
| `characters` | PK `character_id`, FK `account_id`, `version` |
| `item_definitions` | 빌드 콘텐츠에서 적재, `content_hash` |
| `item_instances` | PK `instance_id`, `owner_character_id`, `created_by_op_key` FK |
| `stack_balances` | PK (`character_id`, `definition_id`), `quantity >= 0` CHECK |
| `ledger_operations` | PK `op_key` |
| `ledger_entries` | FK `op_key`, append-only (UPDATE/DELETE 권한 회수) |
| `quest_progress` | PK (`character_id`, `quest_id`) |
| `purchase_orders` | PK `order_id`, 상태 전이 로그 테이블 별도 |
| `chat_reports` | 신고 대상·메시지 스냅샷·처리 상태 |
| `moderation_actions` | 제재 이력, 처리자, 근거 |

---

## 15. 보안: Steam 신원·권한·구매

### 15.1 로그인

```text
Electron Main: GetAuthTicketForWebApi(identity="yeonmu-gateway")
             → GetTicketForWebApiResponse_t 대기 (유효 티켓 보장)
             → HTTPS POST /auth/steam { ticketHex }
Gateway:     GET partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/
               key=<publisher key, 서버 전용>, appid, ticket, identity
             → SteamID64 획득
             → CheckAppOwnership(steamid, 본편 appid) (§15.2)
             → 자체 세션 발급(짧은 TTL 액세스 토큰 + 회전 리프레시)
Client:      세션으로 Allocator에서 seatToken 발급 → 룸 onAuth에서 서명 검증
```

- 근거: Web API 티켓 흐름, identity 문자열 일치 필요, `AuthenticateUserTicket`은 퍼블리셔 키가 필요하고 보안 서버에서 호출해야 함 `[공식: partner.steamgames.com/doc/features/auth, /doc/webapi/ISteamUserAuth]`.
- Web API 티켓의 수명·재사용 방지 동작은 공식 문서에서 확인하지 못했다 `[미검증]` → 티켓은 로그인 1회에만 쓰고, 이후는 자체 세션만 사용.
- 대안: Encrypted App Ticket(서버가 Steam에 외부 호출 없이 검증, 21일 만료, 개인키는 절대 배포 금지) `[공식: partner.steamgames.com/doc/features/auth]`. 초기에는 Web API 방식이 단순하다고 판단 `[제안]`.

### 15.2 소유권·DLC

- `ISteamUser/CheckAppOwnership/v4` (퍼블리셔 키, 서버 전용) 응답의 `ownsapp`이 유효 라이선스 판단 기준, `permanent`는 패밀리 공유·무료 주말 등에서 false `[공식: partner.steamgames.com/doc/webapi/ISteamUser]`.
- DLC는 별도 AppID이며 서버는 `CheckAppOwnership`으로 확인 가능 `[공식: partner.steamgames.com/doc/store/application/dlc]`.
- 정책: 로그인 시 확인 후 캐시(TTL 제안: 세션 수명), 확장팩 지역 입장 시 캐시 만료면 재확인. 클라이언트 측 `BIsSubscribedApp` 등은 **UI 표시용**으로만 사용.
- `permanent=false`(공유 등) 사용자의 외형·구매 상품 사용 범위는 사업 결정 `[열린 질문]`.

### 15.3 구매(마이크로트랜잭션 — 외형 상품 제안 시)

흐름 `[공식: partner.steamgames.com/doc/features/microtransactions, /doc/webapi/ISteamMicroTxn]`:

1. 클라이언트가 상품 ID만 보냄. **가격은 서버 카탈로그에서 결정**.
2. 서버가 고유 64비트 `orderid` 발급, `purchase_orders`에 `initiated` 저장, `InitTxn/v3` 호출.
3. 사용자가 Steam 오버레이에서 승인 → 클라이언트가 `MicroTxnAuthorizationResponse_t` 수신 → 서버에 알림(필드 세부 `[미검증]`).
4. 서버가 `FinalizeTxn/v2` 호출. 성공 응답이면 결제 완료로 간주 → 원장 `purchase:{orderId}:{line}` 지급.
5. 타임아웃·통신 오류 시 성공/실패를 가정하지 말고 `QueryTxn`/`GetReport`로 확인 `[공식: 동일]`. FinalizeTxn의 멱등성은 문서에 명시되지 않음 `[미검증]` → 재호출 전 QueryTxn 선행.
6. 테스트는 `ISteamMicroTxnSandbox` 사용 `[공식: 동일]`.

### 15.4 "웹훅 검증"에 대한 결론

- 읽은 Steam 공식 문서에서는 **결제 상태 푸시·웹훅을 찾지 못했다** `[미검증 — 없다고 확정하지 않음]`. 문서상 백엔드는 `GetReport/v5`를 `time` 커서로 주기 폴링해 환불·차지백 등 상태를 받아야 한다(문서는 최소 하루 1회 호출 권장, 요약 출처) `[공식: /doc/webapi/ISteamMicroTxn]`.
- **대사 작업(Reconciler):** `GetReport` 결과의 각 주문 상태를 `purchase_orders`와 비교 → 미지급 성공 주문 지급, `Refunded/PartialRefund/Chargedback` 등은 회수 연산. 모두 opKey로 멱등.
- 향후 Steam 외 결제·외부 서비스가 웹훅을 보낸다면 공통 규칙: (1) 공급자 서명 검증(HMAC 등, 공급자 문서 기준), (2) 타임스탬프 허용 범위, (3) 이벤트 ID 중복 저장소로 재생 차단, (4) 본문은 신호로만 쓰고 **공급자 API 재조회로 상태 확정**, (5) 2xx는 영속 저장 후에만 반환.

### 15.5 비밀 관리

| 비밀 | 위치 | 금지 |
|---|---|---|
| Steam 퍼블리셔 Web API 키(권한별 분리: 일반/마이크로트랜잭션) | 서버 비밀 저장소, IP 허용 목록 `[공식: partner.steamgames.com/doc/webapi_overview/auth]` | 클라이언트 배포, 로그, URL 쿼리(헤더 `x-webapi-key` 사용) |
| Encrypted App Ticket 키(쓰는 경우) | 동일 | 클라이언트 포함 |
| 세션 서명 키 | 비밀 저장소, 회전 | 저장소 커밋 |
| DB 자격 증명 | 동일 | `.env` 커밋 |
| AI 생성 서비스 키(Meshy 등) | 아트 파이프라인 CI 비밀·개인 키체인 | 게임 클라이언트·서버, GLB `extras` |

### 15.6 Electron 보안 기준

공식 체크리스트 `[공식: electronjs.org/docs/latest/tutorial/security]` 중 필수 적용:

- `nodeIntegration` 끄기(기본), `contextIsolation` 켜기(기본), `sandbox` 켜기(기본).
- CSP `script-src 'self'`, 원격 코드 로드 금지, `webSecurity` 유지.
- `setWindowOpenHandler`·내비게이션 제한, `shell.openExternal` 허용 목록.
- IPC 발신자 검증, contextBridge로 최소 API만 노출(원시 `ipcRenderer.on` 노출 금지).
- `file://` 대신 커스텀 프로토콜, Electron fuses 점검.
- 위 기준과 충돌하는 Steam 바인딩 설정은 채택하지 않는다(S3).

### 15.7 치트·악용 위협 모델(요약)

| 위협 | 대응 |
|---|---|
| 속도·텔레포트 | 서버 이동 검증(최대 속도, 충돌) |
| 데미지·쿨다운 조작 | 서버 계산, 클라이언트 값 무시 |
| 콤보 창 위조(입력 타임스탬프) | seq·스텝 기반 판정, 타임스탬프 신뢰 안 함 |
| 패킷 재생·위조 | TLS, 세션 바인딩, seq 단조 증가 |
| 경제 복제 | 원장 멱등·불변식 검사 |
| 봇 사냥 | 행동 텔레메트리 이상 탐지(후순위), 속도 제한 |
| 메모리 조작·월핵 | 서버 권위로 영향 제한. AOI로 불필요 정보 미전송. 클라이언트 안티치트는 범위 밖 |

---

## 16. 채팅·신고·모더레이션

| 기능 | 슬라이스 | 출시 |
|---|---|---|
| 채널: 근처(마을 AOI), 파티, 귓속말 | 근처·파티 | + 귓속말 |
| 속도 제한(계정·IP), 메시지 길이 제한 | 필수 | 필수 |
| 금칙어 필터(한국어) | 기본 목록 | 목록 확장 + 우회 표기 대응 |
| 차단(개인), 신고(메시지 스냅샷 첨부) | 필수 | 필수 |
| 운영자 처리 도구(제재·해제·이력) | 최소 CLI/관리 페이지 | 관리 콘솔 |
| 외부 모더레이션 API·Steam 텍스트 필터 기능 | — | 검토 `[미검증 — 기능·약관 확인 필요]` |

- 메시지는 서버 경유, 필터 후 전송. 신고 시 해당 메시지와 앞뒤 문맥을 신고 레코드에 복사(원본 로그 보존 기간과 분리).
- 로그 보존 기간·개인정보 처리 방침은 법무 검토 `[열린 질문]`.
- 제재는 계정 단위, Steam ID와 연결. 제재 이력은 append-only.
- 신고 처리 SLA는 운영 인력에 의존 — [delivery-and-business.md §7](delivery-and-business.md#7-인력) 참조.

---

## 17. 관측성

### 17.1 메트릭(제안)

| 영역 | 메트릭 | 용도 |
|---|---|---|
| 룸 | 틱 처리 시간 p50/p95/p99, 틱 초과 횟수, GC 일시정지 | S4·게이트 |
| 네트워크 | 클라이언트별 RTT·지터·손실 분포, 클라이언트당 송수신 바이트/초 | 비용 공식(§19) 입력 |
| 예측 | 재조정 보정 크기 분포, 스냅 횟수, `ComboRejected`·`HitRejected` 비율 | 손맛·공정성 |
| 할당 | 룸 점유율 분포, 예약 실패율, 전환 소요 시간 | 정원 조정 |
| 원장 | 연산 지연, duplicate 비율, rejected 사유별 수, 불변식 위반 수(0이어야 함) | S7 |
| 구매 | 상태별 주문 수, 대사 지연, 미지급 성공 주문 수 | 출시 차단 지표 |
| 클라이언트 | 프레임 시간 분포(사양 등급별), 로딩 시간, 크래시 | S1 |
| 디자인 텔레메트리 | `combo_node_first_use` 등 디자인 게이트 이벤트 | [concept.md §10](../design/concept.md#gates) |

### 17.2 로그·트레이스

- 구조화 로그(JSON), 상관 ID: `sessionId`, `roomId`, `transitionId`, `opKey`, `orderId`.
- 분산 트레이스는 Gateway→Allocator→Room→Ledger 경로에 적용(OpenTelemetry 등, 도구 선택 `[미검증]`).
- 개인정보 최소화: Steam ID는 해시 또는 내부 accountId로 기록, 채팅 본문은 모더레이션 저장소에만.

### 17.3 전투 리플레이

던전 런의 입력 스트림 + 시드 + 콘텐츠 해시를 저장하면 공유 sim으로 서버 판정을 재현할 수 있다. 판정 분쟁·버그 재현용. 저장 기간·용량은 측정 후 결정 `[제안]`.

---

## 18. 배포·운영

| 항목 | 제안 | 비고 |
|---|---|---|
| 서버 패키징 | 컨테이너 이미지(Node LTS 고정) | 서버 빌드 산출물은 Git 커밋 금지 |
| 룸 서버 호스팅 | 초기: VM 또는 단순 컨테이너 호스트에 프로세스 N개. 확장: 게임 서버용 오케스트레이션 검토 `[미검증]` | 상태ful이라 일반 롤링 배포 불가 |
| 배포 방식 | 드레인: 새 버전 프로세스 기동 → 구버전 `locked`(신규 할당 중지) → 마을은 다음 전환 시 이동, 던전은 런 종료 대기(상한 시간 후 체크포인트 저장 후 종료) | 프로토콜 버전 호환 1세대 유지 |
| 클라이언트 배포 | Steam 디포 빌드. 서버·클라이언트 프로토콜 버전 불일치 시 업데이트 안내 | Steam 업로드 절차는 출시 단계에서 공식 문서 재확인 |
| 콘텐츠 배포 | 콘텐츠 해시 기반, 서버·클라이언트 동일 해시 강제 | |
| DB | 매니지드 PostgreSQL 후보, PITR 백업 | 복구 훈련은 출시 게이트(§20) |
| 환경 | dev / playtest / prod 분리, Steam 샌드박스 결제는 dev·playtest만 | |
| 운영 절차 | 장애 런북: 룸 크래시, DB 장애, Steam API 장애, 대사 지연 | 출시 전 작성 |

---

## 19. 비용 공식

**숫자 없이 변수만 정의한다.** 단가는 공급자·리전·계약에 따라 다르고 이 작업에서 확인하지 않았다 `[미검증]`. 변수 값은 S4·G2 측정으로 채운다.

```text
입력(측정 또는 가정)
  CCU_t, CCU_f, CCU_d     공간별 동시 접속자(마을/필드/던전)
  occ_t, occ_f, occ_d     룸당 평균 인원(측정)
  cpu_room_x              룸 1개당 평균 vCPU 사용률(측정, 공간별)
  mem_room_x              룸 1개당 메모리(측정)
  bps_client_x            클라이언트당 평균 송신 바이트/초(측정, 공간별)
  H                       월 운영 시간(피크 프로파일로 가중)
  headroom                여유율(장애·피크 대응, 예: 1.3~1.5 가정)

룸 수        R_x   = ceil(CCU_x / occ_x)
vCPU         V     = headroom × Σ_x (R_x × cpu_room_x)
룸 서버 비용 C_cpu = V × H × 단가_vCPU시간  (+ 메모리 단가 해당 시)
송신량(GB)   E     = Σ_x (CCU_x × bps_client_x) × 3600 × H / 1e9
송신 비용    C_egr = E × 단가_GB (구간 요금 적용)
상시 비용    C_fix = DB + Redis + Gateway/서비스 + 관측성 저장 + 비밀 저장소 + 백업
월 서버 비용 C_mon = C_cpu + C_egr + C_fix

DAU 기준 환산(사업 문서용)
  CCU_peak ≈ DAU × 평균 세션 시간(h) × 피크 집중 계수 / 24   (계수는 실측 전 가정)
  사용자당 월 서버 비용 = C_mon / MAU
```

- 클라이언트 배포(Steam 디포)는 Steam이 호스팅하므로 패치 CDN 비용은 별도 항목으로 두지 않는다 `[미검증 — Steamworks 조건 확인 필요]`.
- 사업 지표와 결합은 [delivery-and-business.md §6](delivery-and-business.md#6-비용-구조).

---

## 20. 부하 테스트 게이트

헤드리스 봇은 공유 sim + 프로토콜 패키지로 작성(같은 입력 경로). 봇 행동 스크립트: 마을 배회·감정표현·채팅, 필드 전투, 던전 콤보 반복, 포탈 왕복.

| 게이트 | 조건 | 통과 기준(제안, 착수 시 확정) | 차단 대상 |
|---|---|---|---|
| L0 단일 룸 | 던전 4봇 + 적, 지연 0/100/150ms·손실 0~3% | 틱 p99 ≤ 틱 간격 × 0.5, 예측 거부율 측정값 기록 | 네트워크 수직 절편 |
| L1 마을 정원 | 마을 1룸에 정원 상한까지 봇 | 틱 p99 기준 동일, 클라이언트당 송신량 측정 | 마을 정원 확정 |
| L2 프로세스 | 프로세스당 룸 N개(목표 혼합) | CPU·메모리 포화 전 N 측정 → §19 입력 | 비용 추정 |
| L3 전환 폭주 | 다수 봇이 동시에 포탈·던전 입장 | 예약 실패율·전환 시간 분포 기록, 데이터 손실 0 | 클로즈 테스트 |
| L4 장애 주입 | 룸 kill, 원장 지연, DB 페일오버, Redis 재시작 | 원장 불변식 위반 0, 재접속 성공률 측정 | 클로즈 테스트 |
| L5 장시간 | 목표 CCU 혼합 부하 장시간 | 메모리 누수 없음, 틱 분포 악화 없음 | 출시 |
| L6 복구 훈련 | DB 백업에서 복원 + 구매 대사 | 대사 후 구매 지급 불일치 0 | 출시 |

---

## 21. 저장소 구조 제안

npm workspaces, 단일 `package-lock.json`. **현재 생성하지 않는다(구현 금지 단계).**

```text
yeonmu/
├─ packages/
│  ├─ sim/           # 순수 TS 결정적 시뮬레이션(이동·콤보·히트·히트스톱 시간)
│  ├─ protocol/      # 메시지 타입·스키마·버전
│  ├─ content/       # 콤보 그래프·아이템·레시피·퀘스트 데이터 + 검증기
│  └─ test-bots/     # 헤드리스 봇
├─ apps/
│  ├─ client/        # Electron(main/preload/renderer) + three.js
│  ├─ room-server/   # Colyseus 룸
│  └─ services/      # gateway, allocator, ledger, party, chat (초기 단일 프로세스)
├─ tools/
│  └─ asset-pipeline/ # GLB 계약 검사, 마커 사이드카 생성 (art 문서 §8~§9)
└─ docs/
```

---

## 22. 디자인 교차 검토 응답

[concept.md §12](../design/concept.md#cross-review) 항목에 대한 기술 측 1차 응답. 상세 결정은 S5·S6 이후.

| # | 디자인 요구 | 기술 응답(제안) | 상태 |
|---|---|---|---|
| 1 | 입력 버퍼 150ms, 패링 창 150ms | 30Hz 기준 약 4~5 스텝. **`actionTick` 기준**으로 정의하면 히트스톱과 충돌 없음(§9.3). 패링은 입력 seq 기준 판정 + 되감기 상한(§10) | S6에서 지연 100ms 체감 확인(가정 A3) |
| 2 | 히트스톱은 로컬 연출, 판정은 서버 | 동의. 단 콤보 창은 액션 로컬 시간으로 서버도 멈춤(§9). 타인 화면 불일치는 그 엔티티 표현에만 적용 | S6 |
| 3 | 재접속 예약 180초, 보스전 재입장 차단, 목표 단위 저장 | `allowReconnection(client, 180)` 후보. 보스전 중 **기존 좌석 재접속은 허용**, 신규 입장만 차단 제안. 목표 단위 커밋(§12.3) | 디자인 확인 필요 |
| 4 | 마을 상한 40 / 병합 하한 20, 필드 동시 표시 20 내외 | 정원은 L1 측정 후 확정. 병합은 강제 이동 대신 다음 전환 시 재배치 | L1 |
| 5 | 개인 드랍·개인 채집 노드 | 원장 opKey에 characterId 포함(§13.2), 노드 상태는 캐릭터별 | 반영 |
| 6 | 텔레메트리 이벤트 수집 | §17.1에 포함. 개인정보 최소화 규칙 적용 | 반영 |

---

## 23. 열린 질문

1. 화면 전체 히트스톱을 1인 던전에서 허용할지(§9.3-4).
2. 파티 던전 입장 시 일부 실패 처리(§11.4).
3. 보스전 중 재접속 허용 범위(§12.2).
4. `permanent=false` 소유자(패밀리 공유 등)의 유료 외형 사용 범위(§15.2).
5. 채팅 로그 보존 기간, 개인정보 처리 방침, 연령 정책(법무).
6. 첫 리전 위치와 해외 플레이어 정책.
7. three.js vs Babylon.js(S1), Colyseus 예측 API vs 자체 구현(S5).

## 24. 참고 자료

2026-11-07 조회. 요약 출처로 표기한 항목은 페이지 일부를 도구 요약으로 읽었으므로 구현 전 재확인.

- Colyseus: https://docs.colyseus.io/netcode · https://docs.colyseus.io/netcode/client-prediction · https://docs.colyseus.io/netcode/server-input · https://docs.colyseus.io/netcode/lag-compensation · https://docs.colyseus.io/sdk · https://docs.colyseus.io/room/reconnection · https://docs.colyseus.io/matchmaker/visibility · https://docs.colyseus.io/server/presence · https://docs.colyseus.io/server/transport/webtransport
- Steamworks: https://partner.steamgames.com/doc/features/auth · https://partner.steamgames.com/doc/webapi/ISteamUserAuth · https://partner.steamgames.com/doc/webapi/ISteamUser · https://partner.steamgames.com/doc/store/application/dlc · https://partner.steamgames.com/doc/features/microtransactions · https://partner.steamgames.com/doc/webapi/ISteamMicroTxn · https://partner.steamgames.com/doc/features/inventory · https://partner.steamgames.com/doc/webapi_overview/auth
- Electron: https://www.electronjs.org/docs/latest/tutorial/security · https://www.electronjs.org/docs/latest/tutorial/electron-timelines · https://releases.electronjs.org/
- Tauri v2: https://v2.tauri.app/ (웹뷰 세부 미확인)
- three.js: https://threejs.org/docs/ (클래스 상세 페이지 미확인)
- Babylon.js: https://doc.babylonjs.com/ (기능 페이지 미확인)
- steamworks.js: https://github.com/ceifa/steamworks.js
- Node.js: https://nodejs.org/en/about/previous-releases
