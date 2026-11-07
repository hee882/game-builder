# 독립 검증 기록 (independent-validation)

> **상태:** 독립 검증 1차 · 2026-11-07 · Orca Task `task_0c49dbfd1c40` · 검증 담당(설계·기술 문서 비소유)
>
> **2차 재검증:** Orca Task `task_000a35dd3d52` — 결과는 [§7](#7-2차-재검증-f-01f-16)에 덧붙였다. §1~§6은 1차 기록으로 **수정하지 않고 보존**한다(줄 번호·blob은 1차 시점 기준).
>
> **이 기록이 말하는 것:** 두 교차 검토 작업자가 끝난 뒤의 작업 트리를 **문서끼리** 정적으로 대조한 결과다. 게임 코드·서버·빌드·테스트·측정은 없다. "통과"는 문서의 규칙·수치·링크가 서로 맞는다는 뜻이며 재미·성능·안정성이 검증됐다는 뜻이 **아니다**. 모든 수치는 여전히 측정 전 **[제안]** 이고, 이 검증으로 새로 사용자 승인된 요구는 없다.
>
> **수정 범위:** 이 파일만 새로 작성했다. design·technical·production의 다른 문서, README, CLAUDE.md, `vendor/`, 상위 저장소는 수정하지 않았다. 설치·커밋·푸시·유료 호출 없음.

---

## 1. 근거

| 항목 | 내용 |
|---|---|
| 읽은 문서 | `CLAUDE.md`, `README.md`, [decision-register](decision-register.md), [review-status](review-status.md), [validation-plan](validation-plan.md), [design-cross-review](design-cross-review.md), [technical-cross-review](technical-cross-review.md), design 4종, technical 3종 전문 |
| 브랜치·기준 | `planning/initial-design`, 기준 커밋 `7cceab0` + 커밋 전 작업 트리(design 3·technical 3 수정, cross-review 2 신규) |
| 검증한 작업 트리 blob (`git hash-object`) | `combat-and-items.md` `e021776` · `concept.md` `e66fe19` · `quests.md` `fe645a8` · `narrative.md` `d278a23` · `architecture.md` `e480cd7` · `art-and-animation.md` `d773cab` · `delivery-and-business.md` `1cd237e` · `design-cross-review.md` `6d88337` · `technical-cross-review.md` `47b3497` |
| blob 대조 결과 | technical-cross-review가 기록한 디자인 blob 5개는 현재와 **모두 일치**(기술 측은 최종 디자인을 읽었다). design-cross-review가 기록한 기술 blob(`07ac078`/`3e30509`/`6b3961c`)은 현재(`e480cd7`/`d773cab`/`1cd237e`)와 **다르다** — 디자인 측 기록은 기술 최종본 이전 상태다. X15의 원인 |
| 링크 검사 | 스크래치 디렉터리의 로컬 Python 스크립트(작업 트리에 넣지 않음). 상대 링크마다 대상 파일 존재 + `#fragment`가 GitHub식 헤딩 슬러그(HTML·링크 제거, 소문자, 문자·숫자·결합표지·`-`·`_`·공백만 유지, 공백 → `-`, 중복 `-1`) 또는 `<a id>`와 일치. 코드 펜스·인라인 코드·외부 URL 제외 |
| 수행하지 않은 것 | 런타임·빌드·`npm` 검사(앱 코드 없음), 실제 GitHub 렌더 확인, 외부 URL 조회, `[공식]` 인용 재확인 |
| 환경 메모 | 저장소 소유자가 현재 사용자와 달라 `git`이 dubious ownership으로 거부했다. 전역 설정을 바꾸지 않고 명령마다 `-c safe.directory=…`로 읽기만 했다 |

---

## 2. 검사별 결과

| # | 검사 | 결과 | 요약 |
|---|---|---|---|
| V1 | 사용자 요구 커버리지 | **통과** | 결정 기록 §사용자 요구 7항목 모두 소유 문서에 대응(§3.1) |
| V2 | 남은 문서 간 모순 | **조건부 통과** | 규칙·수치 모순 0건. 잘못된 절 번호 참조와 노후 상태 표기만 남음(§3.2·§4) |
| V3 | Markdown 파일·앵커 링크 | **통과** | 로컬 링크 394개, 깨짐 0. 서브모듈 경로 링크 1건은 GitHub 웹에서 열리지 않을 수 있음(§3.3) |
| V4 | 타이밍·action clock·튕겨내기 5틱 | **통과** | 모든 틱 값과 시계 귀속 규칙이 combat §3 ↔ architecture §9 ↔ art §8.4 ↔ delivery P0-T4에서 일치 |
| V5 | 재접속 보호 | **조건부 통과** | 90틱·시작 시점·효과·조기 종료·적용 범위 일치. 보호 시작 전(로딩 중) 엔티티 상태가 미정의(F-04) |
| V6 | 보스 기여·인원 스케일링 | **통과** | 명단·고정·재계산·기여 4종·혼백·전멸·크레딧 일치. 경미한 표기 2건(F-08·F-11) |
| V7 | 포탈 전환 ID vs 시도 멱등 키 | **실패** | 논리 전환 ID와 시도 키의 역할 분리가 정의되지 않아 원장 키·좌석 토큰·체크포인트가 어느 ID를 쓰는지 불명(F-01). 기름 소모 후 전환 실패 처리도 미정(F-02) |
| V8 | 보상 | **조건부 통과** | 1회성 범위표 ↔ 원장 키 1:1, 주간 이월·보관함 일치. 퀘스트 보상 필드와 첫 처치 보상의 이중 지급 해석 여지(F-03) |
| V9 | 애니메이션 클립 예산 동결 | **통과** | combat §4.2·§4.5 ↔ art §8.3·§10.1 클립 ID·등급·상한·집계(16/27/35~36/약 55) 일치. 동결 기준 blob 기록만 필요(§5 X16) |
| V10 | [지정]·수치의 승인 오인 문구 | **조건부 통과** | [지정] 표기 자체는 양쪽 모두 정확. 다만 제안을 "확정·승인"으로 읽히게 하는 문구 다수(§3.4) |

판정 기준: **통과** = 수정 불필요 · **조건부 통과** = 내용 모순은 없고 문구·경미 보완 필요 · **실패** = 구현 전 명세 보완 필요.

---

## 3. 세부 결과

### 3.1 V1 요구 커버리지

| 사용자 요구([decision-register:7-12](decision-register.md#사용자-요구)) | 대응 위치 | 판정 |
|---|---|---|
| 3D 액션 RPG, 타격감·사냥 재미 | concept §3 P1·§10 G0/G1, combat §1·§3·§6.1 | 충족 |
| 키보드 입력·콤보, 화려하지만 읽히는 스킬 | combat §2·§4·§5.1, art §4.1·§4.2 | 충족 |
| 전설 무기·아이템 조합 | combat §7(6종)·§7.7·§8 | 충족(절편 잔향구 2종은 손목·머리, 무기형은 1막 `묵철 수문창`) |
| NPC 미션 → 중간보스·보스 | narrative, quests §3·§4 | 충족 |
| 타운포탈·멀티·채팅·낯선 사람 수십 명 | quests §2.6, architecture §11.6·§16, 마을 20~40 | 충족 |
| 격리 하위 프로젝트, 컨셉~아키텍처 선문서화 | README, 7개 문서 | 충족 |
| Opus high 다중 작업자 설계·교차 검토·수정·독립 검증 | design/technical-cross-review, 이 파일 | 진행 중(review-status 미갱신, F-13) |

### 3.2 V4 타이밍 대조 (일치 확인)

| 값 | combat | architecture | art / delivery |
|---|---|---|---|
| 튕겨내기 창 | §3.3:107 `0~4틱째(5틱)` [지정] | §9.5:404 `[0,5)` | delivery:76 `≥ 5틱` |
| 방어 입력이 자기 히트스톱 해제 | §3.1:79 규칙 3 | §9.3:370 | delivery:76 |
| 적·보스 타임라인 불변 | §3.1:78 규칙 2 | §9.3:366, §10.2:439 | delivery:76 |
| 박자 0~6 / 7~15 / 16+ | §3.2:88-90 | §9.5:408 | art:330-340 `[5,12)`·`[12,21)` |
| 히트스톱 2·3·4·6 | §3.2:92 | §9.5:411 | art:325 `hitstopTicks: 2` |
| 회피 무적 6틱·완벽 회피 3틱 | §3.3:105-106 | §9.5:409-410 | — |
| 텔레그래프 12·18·24·120 | §3.5:125-129 | §9.5:412 | — |
| 접근성 5→8, 버퍼 5→8 | §5.2:268 | §9.5:405-406 | art:187 |

규칙·수치 불일치 0건. 남은 것은 절 번호 오기(F-09)뿐이다.

### 3.3 V3 링크

- 결과: `docs/**/*.md` + README의 로컬 링크 **394개, 깨짐 0**(파일 누락 0, 앵커 누락 0). 두 교차 검토가 보고한 185 + 200(겹침 제외)과 README 9개를 합한 값과 맞는다.
- 주의: [concept.md:49](../design/concept.md#3-디자인-기둥-제안)의 `../../vendor/game-builder/AGENTS.md`는 로컬 체크아웃에서는 존재하지만 **서브모듈 경로**라 GitHub 웹 렌더에서는 열리지 않을 가능성이 크다 `[미검증]`. 같은 줄의 인용문은 영어 원문의 의역인데 따옴표로 직접 인용처럼 적었다(F-14).
- 링크는 해석되지만 **가리키는 절 번호가 틀린** 참조는 F-09에 모았다.

### 3.4 V10 승인 오인 문구

[지정] 태그 정의(concept:18)와 architecture:57·389·555의 "결정 기록 미등재 / [요구] 아님" 표기는 정확하다. 아래는 제안·지정 값을 사용자 승인 또는 확정으로 읽히게 하는 문구다.

| 위치 | 문구 | 문제 | 소유 |
|---|---|---|---|
| [concept.md:27](../design/concept.md#1-한-줄-컨셉), :67 | `[요구: PC·3D·…]`, `[요구] PC` | 결정 기록에서 "PC 우선"은 사용자 요구가 아니라 **현재 설계 제안** 표(decision-register:20)에 있다 | 디자인 |
| [architecture.md:50](../technical/architecture.md#11-기능-요구사용자-요구--기술-해석) | 사용자 요구 열에 "PC 우선 3D **쿼터뷰** 액션 RPG" | PC 우선은 제안, 쿼터뷰는 디자인 [제안](concept:69) | 기술 |
| [quests.md:100](../design/quests.md#reconnect) | "디자인이 추가로 **확정**한 것: … ② 재접속 보호 3초" | 3초는 [지정]이며 디자인 결정도 사용자 승인도 아님 | 디자인 |
| architecture.md:559, :560, :614, :1028 · art:343 · combat:95 | "디자인 확정", "디자인 v0.2 확정", "디자인이 확정한다" | 디자인 [제안]을 확정으로 표기. "디자인 v0.2 제안(교차 검토 합의)"로 | 기술(architecture·art) / 디자인(combat) |
| [combat.md:59](../design/combat-and-items.md#tick-units) · [architecture.md:233](../technical/architecture.md#71-틱-레이트가설) | "이 표를 **다시 승인**하기 전에는", "§9.5 변환 표를 **다시 승인받기** 전에는" | 틱 표가 이미 승인된 것처럼 읽힌다. "변환 표를 재검토·합의하기 전에는" | 디자인 / 기술 |

---

## 4. 발견 목록 (소유자별 필요한 수정)

심각도: **차단** = P0 진입 차단 · **주요** = 해당 기능 구현 단계 착수 전 수정 · **경미** = 다음 문서 개정에서 수정 · **표기** = 상태·참조 정리.

| ID | 심각도 | 소유 | 위치 | 문제 | 필요한 수정 |
|---|---|---|---|---|---|
| **F-01** | 주요(P1-T7 전) | 기술 | architecture §11.3:470·493, §11.4:499, :478·480·483, §11.6:517, §13.2:619, §14.1:730 | §11.3은 "모든 단계는 `transitionId`로 멱등, 같은 ID 재요청 = 기존 예약 반환"인데 §11.4는 재시도에 새 시도 키 `{transitionId}:{attempt}`를 도입한다. 좌석 토큰·`checkpoint()`·`load()`·`Checkpoint.transitionId`·원장 키 `portal:{transitionId}`·`grant:portal_oil_refill:…:{arrivalTransitionId}`가 **논리 ID와 시도 키 중 무엇을 쓰는지** 정의가 없다. 시도 키를 원장에 쓰면 재시도마다 기름이 이중 차감되고, 논리 ID를 Allocator 예약에 쓰면 취소된 결과가 되돌아온다 | 두 식별자를 명시 분리: `transitionId` = 논리 전환 정체성(원장·체크포인트·텔레메트리·`arrivalTransitionId`), `attemptKey = {transitionId}:{attempt}` = Allocator 예약·좌석 토큰 멱등 키. §11.3 실패 표의 "같은 transitionId 재요청" 행을 "같은 attemptKey 재요청"으로 고치고, 단독 귀로등·웨이포인트 전환에도 같은 규칙 적용을 명시 |
| **F-02** | 주요(P1-T7 전) | 디자인 + 기술 | quests §2.6:125, architecture §11.6:512, §11.3:489 | 기름은 시전 **완료** 시 소모되는데 그 뒤 예약 실패(§11.3 "소스에 머무름")·토큰 TTL 만료 시 기름 반환 또는 재시전 무료 여부가 양쪽 모두 미정 | 디자인: 플레이어 규칙("전환 실패 시 기름 반환" 또는 "같은 시전으로 재시도 가능") 결정. 기술: F-01의 논리 ID 재사용 또는 보상 연산 키로 표현 |
| **F-03** | 경미 | 디자인 (+기술 확인) | quests Q-M04:292, Q-P01:308 / architecture §13.2:614·617 | 퀘스트 "보상·해금" 칸에 첫 처치 기억·공명석이 함께 적혀 있어, 퀘스트 보고 보상(`quest:`)과 첫 처치(`firstkill:`) 양쪽에서 지급하는 구현이 가능하다. Q-S04 재료 수지(:348)는 각 1개만 전제 | 디자인: "(첫 처치 확정)" 항목은 `firstkill` 원장으로만 지급되고 퀘스트 보고 보상에 포함되지 않는다고 명시. 기술: §13.2 비고에 같은 문장 |
| **F-04** | 경미 | 기술 (+디자인 확인) | architecture §12.2:550-557, quests §2.3:91 | 좌석 재연결부터 보호 시작(첫 스냅샷 응답, 최대 150틱)까지 엔티티가 피격 가능한지 정의가 없다. 피격 가능이면 로딩 중 맞고, 비표적이면 응답을 늦춰 최대 5초 + 3초 무적을 얻는다 | 보호 시작 전에는 `afterimage` 유지(비표적·입력 무시), 첫 입력 수신을 응답으로 간주하는 규칙 추가 |
| **F-05** | 표기 | 디자인 | design-cross-review.md:20, :33, :134, :138, :142, :161-162, :172, :182-183, :190, :200 | 기술 최종본 이전 상태: `technical-cross-review.md` 없음(현재 있음), X12·X13·무예록 문구 미갱신(architecture §13.2:616·§13.3:646·§23:1031, art §3.1:94에 반영됨), X-D1 delivery 재확인 필요(delivery:76에 있음), "기술 문서가 '사용자 확인 요구'로 적음"(현재 해당 문구 0건), 기술 문서 깨진 링크 5건(현재 0) | §4·§5.2·§6·§7을 기술 blob `e480cd7`/`d773cab`/`1cd237e` 기준으로 갱신 |
| **F-06** | 표기 | 디자인 | concept.md:197 (§12 7번), combat-and-items.md:558 (§11 5번), :79 | "클립 예산은 art 반영 대기", "art §1.3 문구만 X-A2", "technical 반영 요청 X-D1" — 모두 반영됨(art §10.1, art:66, architecture:370) | 상태 열 갱신 |
| **F-07** | 표기 | 기술 | architecture.md:499, :1027, technical-cross-review.md:87 | X11을 "디자인 문구 '같은 전환 ID로 재시도'"가 남은 것으로 적지만 quests.md:116은 이미 "같은 논리 요청… 새 시도 키 `{transitionId}:{attempt}`"로 고쳐졌다(기술이 읽었다고 기록한 blob `fe645a8`에 포함) | X11을 종결로 표기. 실제 남은 일은 F-01 |
| **F-08** | 경미 | 디자인 | combat-and-items.md:322-324 (§6.3 표) | "같은 사람 일으키기 시간 회당 +1초"가 3인 행에만 있고 4인은 "동일", 2인은 없음. architecture:589는 인원 무관 적용 | 2인 이상 공통 규칙인지 표 밖 문장으로 명시 |
| **F-09** | 표기 | 기술 / 디자인 | architecture:366 "combat §3.3"(→ §3.5), "§3.1의 12f·24f"(→ §3.2 `6·12틱`), :368 "combat §3.4"(→ §3.1 규칙 4, `#clocks`), :390 "combat §3.4"(→ §3.6) · art:101 "combat §3.1"(→ §3.2), :187 "combat §3.4"(→ §3.6·§5.2) · combat:533 C2 "§3.3 최소치"(→ §3.5), :156 "10f 안에 L"(틱 원천 규칙상 "5틱 안에") | 링크는 해석되지만 절 번호·단위가 v0.1 기준 | 번호·단위 교체 |
| **F-10** | 경미 | 기술 | art §8.3:297·302 / §10.1:416-426 | `loco_hwando_run`은 무기 전용 이동 클립인데 환도 전용 27 집계에 없음(combat §4.5:209 규칙 5의 "공통 이동 제외"와 경계 모호). 피격·상태 `기상`, 시스템 `G 응답` 클립 이름 예 없음 | 무기 전용 이동 클립을 상한 계산에 넣는지 명시(넣어도 28 ≤ 30). 예시 이름 보강 |
| **F-11** | 경미 | 기술 | architecture §7.4:285-291, §12.4:587 | 기여 판정 "보스·소환물 공격 튕겨내기"에 `DefenseResolved`를 쓰지만 메시지에 공격자 엔티티·`encounterId`가 없다(`attackId`는 데이터 ID) | 서버 내부 이벤트 또는 메시지에 `attackerEntityId` 추가 |
| **F-12** | 경미 | 디자인 | combat §4.5:230 | 곡비 어멈 적 클립 상한 산식 "§6.2 패턴 9"가 §6.2 표(어멈 본인 패턴 약 6개 + 상여·소환은 다른 엔티티)로 추적되지 않음 | 패턴 9개 목록 명시 또는 수 정정 |
| **F-13** | 표기 | 코디네이터 | review-status.md:13-27, validation-plan.md:14-22, README.md:7-17 | review-status는 교차 검토 전 상태(X17). validation-plan 증거 표에 C12·재접속 보호·보스 기여·포탈 전환 시나리오 없음. README 읽기 순서에 두 cross-review와 이 파일 없음 | 코디네이터가 갱신 |
| **F-14** | 표기 | 디자인 | concept.md:49 | 영어 AGENTS.md의 의역을 따옴표 직접 인용으로 표기 + 서브모듈 경로 링크 | "취지 요약"으로 표기, 링크는 유지하되 GitHub에서 열리지 않을 수 있음을 감안 |
| **F-15** | 경미 | 디자인 | quests §7:445, architecture §13.2:616 | 주간 이월 "지난주를 놓쳤으면"이 신규 캐릭터·변이 미해금 주에도 적용되는지 미정. 기술 키는 "지난주 키 없음 → 지급"이라 신규 캐릭터가 첫 클리어에서 2개를 받는다 | 디자인: 이월 자격(캐릭터 생성/변이 해금 이후 주만) 결정 |
| **F-16** | 표기 | 디자인·기술 | §3.4 표 전체 | 승인 오인 문구 | §3.4의 대체 문구 적용 |

---

## 5. X11 / X15 / X16 판정

| ID | 실제 차단 여부 | 근거 (파일:줄) | 판정 |
|---|---|---|---|
| **X11** 재시도 키 문구 | **차단 아님** | 디자인 문구는 이미 해결: quests.md:116. 기술 측 기록만 노후: architecture.md:499, :1027, technical-cross-review.md:87 (F-07). 단, 그 밑의 **명세 공백은 실재**한다: 논리 전환 ID와 시도 키의 역할 분리 부재(F-01), 기름 소모 후 전환 실패 처리 부재(F-02) | X11 자체는 종결 가능. F-01·F-02는 **P0 진입을 막지 않지만 P1-T7(전환 프로토콜) 착수 전 필수** |
| **X15** 디자인 상태 표기 노후 | **차단 아님** | 확인된 노후: design-cross-review.md:20·33·134·138·142·161-162·172·182-183·190·200, concept.md:197, combat-and-items.md:79·558 (F-05·F-06). 원인은 blob 불일치(§1). **X15 설명의 일부는 과장**: technical-cross-review.md:89는 concept §12 "2·3·5·7·8번"이 "반영 대기/확인 필요"라 했지만 현재 concept.md:192·193·195·198(2·3·5·8번)은 이미 "정렬됨(문서)"이고 노후는 7번(:197)뿐이다 | 내용 모순이 아닌 상태 표기 노후. 디자인 작업자가 갱신 |
| **X16** 클립 예산 동시 수정 경합 | **차단 아님** | 현재 일치 확인: 클립 ID combat.md:167-180 = art.md:298-301, 차지형 3 combat.md:178·205 = art.md:407·416, 환도 전용 27 combat.md:209 = art.md:419, 전투 35~36·플레이어 약 55 combat.md:228 = art.md:423·428, 적 상한 combat.md:230 = art.md:431. 남은 것은 F-10·F-12(경미) | 코디네이터가 동결 기준을 **combat `e021776` + art `d773cab`** 로 기록. 이후 클립 ID·수량 변경은 art, `animCost`·상한 변경은 디자인이 상대 승인 후 수정 |

**X14**([지정] 승격)는 문서 결함이 아니라 결정 게이트다. 양쪽 문서는 [지정]을 [요구]로 쓰지 않았다(§3.4 예외 제외). 코디네이터가 사용자 확인을 받거나, 결정 기록에 "코디네이터 지정(사용자 미승인)" 항목으로 출처를 남기는 것을 P0-D1 데이터 작성 전에 권장한다.

---

## 6. 종합

- **P0(오프라인 전투 증명) 진입을 막는 차단 항목: 0건.** P0 범위(sim·틱·히트스톱·튕겨내기)의 문서 정렬은 V4에서 통과했다.
- **P1 착수 전 필수:** F-01·F-02(전환 ID/시도 키, 전환 실패 시 기름) — V7 실패의 원인.
- 나머지는 경미·표기 수정이며 소유자별로 나눠 위임할 수 있다.

| 소유 | 맡길 항목 |
|---|---|
| 기술 작업자 | F-01, F-02(서버 표현), F-04, F-07, F-09(architecture·art), F-10, F-11, §3.4의 architecture·art 문구 |
| 디자인 작업자 | F-02(플레이어 규칙), F-03, F-05, F-06, F-08, F-09(combat), F-12, F-14, F-15, §3.4의 concept·quests·combat 문구 |
| 코디네이터 | F-13, X14 결정 경로, X16 동결 기준 기록 |

이 기록은 정적 문서 검증이며, 수정 후에는 같은 링크 검사와 F-01~F-16 재확인이 필요하다.

---

## 7. 2차 재검증 (F-01~F-16)

> **범위:** 기술 후속 수정(`ctx_0b054bbb259f`)·디자인 후속 수정(`ctx_2a9e2a066e33`)과 코디네이터의 README·decision-register·validation-plan·review-status 갱신 뒤 작업 트리. 이 절만 새로 썼고 다른 파일은 수정하지 않았다. 여전히 **정적 문서 대조**이며 런타임·빌드·테스트·측정은 없다. 아래 "해결"은 문서끼리 맞는다는 뜻이고, 모든 수치·규칙은 계속 **[제안]**(일부 [지정])이며 사용자 승인값이 아니다.

### 7.1 근거

| 항목 | 내용 |
|---|---|
| 읽은 문서 | [README](../../README.md), [decision-register](decision-register.md), [validation-plan](validation-plan.md), [review-status](review-status.md), [design-cross-review §8](design-cross-review.md#validation-response), [technical-cross-review §8](technical-cross-review.md#validation-response), design 4종, technical 3종(변경 절 전문) |
| 현재 blob (`git hash-object`) | [combat-and-items](../design/combat-and-items.md) `94c2df4` · [concept](../design/concept.md) `e9c0031` · [quests](../design/quests.md) `28254fb` · [narrative](../design/narrative.md) `d278a23` · [architecture](../technical/architecture.md) `700ebf1` · [art-and-animation](../technical/art-and-animation.md) `cd2c588` · [delivery-and-business](../technical/delivery-and-business.md) `4da74a1` · [decision-register](decision-register.md) `52fe75e` · [design-cross-review](design-cross-review.md) `5bafeb5` · [technical-cross-review](technical-cross-review.md) `ca537a0` · [validation-plan](validation-plan.md) `259cec2` · [review-status](review-status.md) `daa011f` · [README](../../README.md) `23ebcc1` · 이 파일 1차 `a7784c0`(2차 편집 전) |
| 작업자 기록과 대조 | design-cross-review §1이 마지막으로 읽은 기술 blob(`700ebf1`/`cd2c588`/`4da74a1`/`ca537a0`)은 현재와 **모두 일치**. technical-cross-review §8:136이 마지막으로 읽은 디자인 blob 중 combat `94c2df4`·quests `28254fb`·narrative `d278a23`은 일치하고, **concept는 `c0b4838`에서 현재 `e9c0031`로 그 뒤 바뀌었다.** 현재 concept의 기술 관련 문구(§1·§5·§12)를 직접 대조했고 기술 문서와 모순은 없다(§7.2 F-16, §7.3) |
| 링크 검사 | 1차와 같은 로컬 스크립트(스크래치 디렉터리, 작업 트리 밖). 이 절 작성 전 **로컬 링크 442개, 깨짐 0**. 작성 후 재실행 결과는 코디네이터 보고에 적는다 |
| 수행하지 않은 것 | 런타임·빌드·`npm`·DB 경합 실험, GitHub 실제 렌더, 외부 URL 조회 |

### 7.2 발견별 판정

판정: **해결** = 1차 문제가 문서에서 해소되고 양쪽이 일치 · **해결(측정 대기)** = 문서는 해소, 값은 실측으로 조정 · **보류(코디네이터)** = 결함이 아니라 마무리 대기.

| ID | 1차 심각도 | 판정 | 근거 (현재 파일:줄) |
|---|---|---|---|
| **F-01** 논리 ID vs 시도 키 | 주요 | **해결** | [architecture §11.3.1](../technical/architecture.md#1131-식별자-분리):476-483 — `transitionId`(UUIDv7 서버 발급) = 원장 키·체크포인트·`load()`·`arrivalTransitionId`·텔레메트리, `attemptKey = {transitionId}:{attempt}` = `reserve()`·좌석 예약·`seatToken`·`join()`, `requestId` = `(characterId, requestId)` 중복 제거. 각 식별자의 "쓰면 안 되는 곳"까지 명시. 흐름도 :487-508, 실패 표 [§11.3.4](../technical/architecture.md#1134-실패-표):541-548("같은 `attemptKey` 재요청"과 "같은 `requestId` 재요청"으로 분리), 파티 [§11.4](../technical/architecture.md#114-파티-동반-전환):552-553(파티원당 `transitionId` + `partyTransitionGroupId`), 원장 키 [§13.2](../technical/architecture.md#132-멱등-키-설계):678("`attemptKey`는 원장 키에 쓰지 않는다"), 타입 [§14.1](../technical/architecture.md#141-ts-타입-스케치):796·800-807, 테이블 :860-861, `onAuth` :882-883, 로그 상관 ID :988. 디자인 [quests §2.5](../design/quests.md#25-마을에서의-파티-형성):117과 일치 |
| **F-02** 기름 청구·정확히 1회 반환 | 주요 | **해결(측정 대기)** | 기술 [§11.3.3](../technical/architecture.md#1133-전환-레코드-상태와-기름독립-검증-f-02--코디네이터-제안-사용자-미승인):512-535 — 상태 `pending → committed → arrived` / `pending → compensated`, 차감은 전환 생성과 같은 트랜잭션에서 논리 전환당 1회(:520), 일시 실패는 같은 `transitionId`의 새 시도로 무료(:521), 종결 실패는 `UPDATE … state=compensated WHERE state=pending` **와** `portal_refund:{transitionId}`를 한 트랜잭션으로(:522), 보상 후 commit·`load()`·늦은 토큰 거부(:523). **commit 펜스:** commit도 `WHERE state=pending`을 통과해야 하므로 commit과 보상 중 정확히 하나만 이긴다(:527). 대사 작업·불변식 :529-535. 검증 시나리오 [§13.7](../technical/architecture.md#137-검증s7-시나리오):740-744(경합 100회 반복 포함), 완료 기준 [delivery P1-T7](../technical/delivery-and-business.md#32-단계-1--네트워크-절편):96. 디자인 [quests §2.6](../design/quests.md#portal):133 ①~⑤와 일치. 재시도 상한(3회/30초)은 측정 전 [제안] |
| **F-03** 첫 처치 보상 범위 | 경미 | **해결** | 디자인 [quests §2.2](../design/quests.md#party-rules):68(첫 처치 기억·공명석은 처치 틱 첫 처치 보상으로만, 보고 시 재지급 없음), [Q-M04](../design/quests.md#q-m04):294, [Q-P01](../design/quests.md#q-p01):310, QA :466. 기술 [§13.2](../technical/architecture.md#132-멱등-키-설계):673(`firstkill:`로만 지급), :676(`quest:` 출력에 첫 처치 아이템이 있으면 콘텐츠 검증기 빌드 실패) |
| **F-04** 로딩 중 상태(핸드셰이크) | 경미 | **해결** | 기술 [§12.2](../technical/architecture.md#122-재접속):613-616 — 재연결부터 보호 시작까지 `afterimage`(비표적·입력 무시·생존자 미산입), 시작 = ① 스냅샷 적용 응답 ② 첫 `InputFrame`(이동만 적용, 행동 입력 버림) ③ 150틱 중 가장 이른 틱, 비표적 상한 240틱. 디자인 [quests §2.3](../design/quests.md#reconnect):92와 같은 규칙, QA :468. 이름 부르기 대상 제외([combat §6.2](../design/combat-and-items.md#boss-gokbi):327, architecture :653)와도 모순 없음 |
| **F-05** design-cross-review 노후 | 표기 | **해결** | [design-cross-review](design-cross-review.md) §1:20-21(현재 기술 blob, 기술 기록 존재), §5:180-192, §6:198, §7:208·211 |
| **F-06** concept·combat 상태 노후 | 표기 | **해결** | [concept §12](../design/concept.md#cross-review):197, [combat §11](../design/combat-and-items.md#11-교차-검토-질문-technical--art-담당에게):570·572, [combat §3.1](../design/combat-and-items.md#clocks):79 |
| **F-07** X11 종결 | 표기 | **해결** | [architecture §11.4](../technical/architecture.md#114-파티-동반-전환):554, [§23](../technical/architecture.md#23-열린-질문):1109, [technical-cross-review §5](technical-cross-review.md#unresolved):87 |
| **F-08** 재구조 +1초 | 경미 | **해결** | [combat §6.3](../design/combat-and-items.md#scaling):350(2인 이상 공통, 보스 초기화 시 리셋) = architecture [§12.4](../technical/architecture.md#124-보스-encounter-기여인원-스케일링쓰러짐):648, art [§3.2](../technical/art-and-animation.md#32-화면-구성초안):102 |
| **F-09** 절 번호·단위 | 표기 | **해결** | 기술: architecture :368(§3.5, §3.2 6·12틱), :370(§3.1 규칙 4, `#clocks`), :392·:445(§3.6), art :101·:174(§3.2), :187(§3.6). 디자인: [combat §4.1](../design/combat-and-items.md#combo-tree):156("5틱 안에 L"), [C2](../design/combat-and-items.md#combat-gates):547(§3.5) |
| **F-10** 클립 집계 | 경미 | **해결** | 산술 확인: 전투 27 = 16 + 5 + 6, 무기 전용 합계 **27 + `loco_hwando_run` 1 = 28 ≤ 30**, 전투 소계 35~36 = 16 + 5 + 9 + 1(R 승격 시 2) + 2 + 2, 플레이어 합계 **35~36 + 1 + 20(8 + 4 + 4 + 4) = 56~57(약 56)**. art [§8.3](../technical/art-and-animation.md#83-클립-이름):297·302·303·305, [§10.1](../technical/art-and-animation.md#101-콤보별-애니메이션-예산첫-절편):419-420·424·429·432 = combat [§4.5](../design/combat-and-items.md#anim-budget):209-212·231. 용어 차이(art :420 "환도 전용 소계" = combat :212 "환도 전용 합계 28")는 combat :212가 명시적으로 대응시켜 모순 아님 |
| **F-11** 기여 이벤트 식별 | 경미 | **해결** | [architecture §7.4](../technical/architecture.md#74-메시지-계약-스케치제안-구현-아님):289-290(`attackerEntityId`, `encounterId`), [§12.4](../technical/architecture.md#124-보스-encounter-기여인원-스케일링쓰러짐):646 |
| **F-12** 곡비 어멈 상한 추적 | 경미 | **해결** | [combat §4.5](../design/combat-and-items.md#anim-budget):235-243 — 1 + 7 + 5 + 1 = 14, 상여꾼·상여는 공유 2로 분리. art [§10.1](../technical/art-and-animation.md#101-콤보별-애니메이션-예산첫-절편):433 상한 14와 일치 |
| **F-13** 코디네이터 문서 | 표기 | **해결 / 보류(코디네이터)** | [README](../../README.md):18-19(교차 검토·독립 검증·검증 계획 링크), [validation-plan](validation-plan.md#구현-단계-진입-후-증거):18-21(C12·재접속 보호·보스 참여·포탈 전환 증거 행). [review-status](review-status.md#진행-중과-다음-단계):13-20의 "다음 단계"는 이 보고를 기다리는 **코디네이터 마무리 대기**이며 게임 설계 결함이 아니다 |
| **F-14** AGENTS.md 인용·링크 | 표기 | **해결** | [concept §3](../design/concept.md#3-디자인-기둥-제안):49(취지 요약 + 서브모듈 링크 `[미검증]` 표기) |
| **F-15** 이월 자격 | 경미 | **해결** | 디자인 [quests §7](../design/quests.md#7-반복-콘텐츠-원칙-퀘스트-측면):447-448(자격 주 = 그 주 시작 전 캐릭터 생성 + 첫 보스 첫 처치로 변이 해금), 범위표 :76, [combat §9](../design/combat-and-items.md#anti-grind):536, QA :467. 기술 [§13.2](../technical/architecture.md#132-멱등-키-설계):675(`createdAt < prevWeekStart` 그리고 `weeklyVariantUnlockedAt < prevWeekStart`, 해금 = 첫 `firstkill:`), [§14.1](../technical/architecture.md#141-ts-타입-스케치):785. 신규·막 해금 캐릭터 1개, 자격 주 1주 누락 2개로 양쪽 일치. 주 경계 시간대는 미정(기술 :675) |
| **F-16** 승인 오인 문구 | 표기 | **해결** | 디자인: [concept §1](../design/concept.md#1-한-줄-컨셉):27, [§5](../design/concept.md#5-플랫폼--시점--조작-요약):67, [§12](../design/concept.md#cross-review):187·189, [quests §2.3](../design/quests.md#reconnect):101, [combat §3.0](../design/combat-and-items.md#tick-units):59. 기술: [architecture §1.1](../technical/architecture.md#11-기능-요구사용자-요구--기술-해석):50, [§7.1](../technical/architecture.md#71-틱-레이트가설):233, §9.3:370, §12.2:618-619, §13.2:673, §23:1109-1112, art :434. 재검색(`확정한`·`v0.2 확정`·`다시 승인`·`승인받`·`[요구] PC`·`사용자 확인`)에서 남은 적중은 원장 커밋 의미의 "확정"(quests:69 등)과 과정 문구(art:285 "승인된 몬스터 스켈레톤", art:305 "확정 후")뿐이다 |

**집계:** F-01~F-16 중 15건 해결. F-13은 문서 갱신은 해결이고 review-status 마무리만 코디네이터 대기. **열린 주요·차단 항목 0건.**

### 7.3 이번 확인에서 새로 본 것 (모두 표기·선택 수준, 차단 아님)

| ID | 심각도 | 소유 | 위치 | 내용 | 권장 |
|---|---|---|---|---|---|
| N-01 | 표기 | 기술 | [technical-cross-review §5](technical-cross-review.md#unresolved):89-91 | X15·X16·X17 행이 1차 문구 그대로다. 특히 X16 행 "환도 전용 27, 약 55"는 현재 규약(전투 27, 무기 전용 28, 플레이어 약 56)과 다르게 읽힌다. 같은 파일 §8과 디자인·art 본문은 최신이라 **기록 노후**이지 설계 모순은 아니다 | 세 행에 "§8·independent-validation §7로 종결·대체" 표기 |
| N-02 | 표기 | 기술 | [architecture §22](../technical/architecture.md#22-디자인-교차-검토-응답):1087 | 열 머리글 "디자인 요구(concept §12 v0.2 번호)" — concept §12는 "design 요청 값"으로 바뀌었다. 사용자 요구로 오독될 수 있는 마지막 표현 | "디자인 요청 값"으로 |
| N-03 | 표기 | 디자인(선택) | [quests §2.6](../design/quests.md#portal):133 ③ / [architecture §11.3.4](../technical/architecture.md#1134-실패-표):546 | 커밋 전 **소스 룸 크래시**는 플레이어가 출발 공간에 남지 못해도 반환한다. 기술이 예외로 명시했고 technical-cross-review §8:138도 같은 취지로 기록했다. 모순은 아니지만 디자인 문구가 이 경우를 다루지 않는다 | ③에 "이동이 성립하지 않은 전환" 기준 한 줄 추가(선택) |
| N-04 | 표기 | 디자인 / 코디네이터 | [concept 표기 규칙](../design/concept.md#notation):18, [combat](../design/combat-and-items.md):5 vs [decision-register](decision-register.md#검토용-제안과-승인-상태-2026-11-07):39 | 디자인은 [지정] 값을 "플레이테스트 조정 대상에서 뺀다", 결정 기록은 "실제 플레이·지연 실험 후 재검토한다". 일상 튜닝에서는 빼고 코디네이터·사용자 재검토로만 바꾼다는 뜻이면 양립한다. 승인 오인 방향의 문제는 아니다 | 디자인 문구에 "(코디네이터·사용자 재검토로만 변경)" 추가(선택) |
| N-05 | 표기 | 코디네이터 | [decision-register](decision-register.md):33-46 | 새 소제목 "검토용 제안과 승인 상태"가 "충돌 처리" 아래에 들어가, 원래 충돌 처리 문단(:46)이 그 소제목 아래로 밀렸다. 내용 문제 아님 | 소제목 위치 정리(선택) |

**새 승인 오인 문구는 없다.** 코디네이터 갱신본 [decision-register:35-44](decision-register.md#검토용-제안과-승인-상태-2026-11-07)는 5틱·3초·기름·이월·클립 집계를 "사용자가 승인한 요구사항이 아니다"로 명시했고, 두 작업자의 §8([디자인](design-cross-review.md#validation-response):217, [기술](technical-cross-review.md#validation-response):121)도 같은 표기다.

### 7.4 X11 / X15 / X16 재판정

| ID | 판정 |
|---|---|
| X11 | **종결.** 디자인 quests:117, 기술 architecture:554·1109, technical-cross-review:87 모두 종결 표기. 실제 공백이던 F-01·F-02는 §7.2에서 해결 |
| X15 | **종결.** design-cross-review·concept·combat 상태 표기가 현재 기술 blob 기준으로 갱신됨(F-05·F-06). technical-cross-review:89의 X15 행 자체만 노후(N-01) |
| X16 | **동결 기준 제안:** combat-and-items **`94c2df4`** + art-and-animation **`cd2c588`**. 이 두 blob에서 클립 ID(combat §4.2 ↔ art §8.3), `animCost`·상한(combat §4.5), 집계(전투 27 / 무기 전용 28 ≤ 30 / 전투 소계 35~36 / 플레이어 56~57, 약 56), 곡비 어멈 14가 일치한다. 기록은 [decision-register:42](decision-register.md#검토용-제안과-승인-상태-2026-11-07)가 예고한 대로 코디네이터가 한다. 동결은 계획 수량의 기준점일 뿐 제작 시간(S-A2)이나 사용자 승인을 뜻하지 않는다 |

### 7.5 요청 확인 항목 요약

| 확인 항목 | 결과 |
|---|---|
| 논리 ID vs `attemptKey` | 통과 — F-01 |
| 정확히 1회 반환 + commit 펜스 | 통과(문서) — F-02. 같은 트랜잭션의 상태 비교 갱신 + 고유 원장 키 + 대사 불변식. 실제 경합 동작은 §13.7 10~14번과 P1-T7에서 측정 |
| 첫 처치 보상 범위 | 통과 — F-03 |
| 핸드셰이크 중 afterimage | 통과 — F-04 |
| 이월 자격 | 통과 — F-15 |
| 애니메이션 27 + 1 = 28, 합계 56~57 | 통과 — F-10 |
| 새 승인 오인 문구 | 없음 — §7.3 |
| 1차 검사 V1~V10 재판정 | V7(포탈 ID) **실패 → 통과**, V5·V8·V10 **조건부 → 통과**, V2는 N-01~N-05(표기)만 남아 **통과(표기 정리 권장)**, 나머지 통과 유지 |

### 7.6 종합 판정

- **기획 문서는 내부적으로 일관된다.** 규칙·수치·식별자·원장 키·클립 집계의 문서 간 모순은 0건이고, 남은 것은 N-01~N-05의 표기·선택 정리와 코디네이터 마무리(F-13 review-status, X16 동결 기록)뿐이다.
- **런타임 준비 완료를 뜻하지 않는다.** 코드·서버·측정이 없으며 이 검증은 문서 대조다.
- **측정에 달린 것:** 튕겨내기 5틱·히트스톱 2/3/4/6틱의 손맛(G0·G1·C3·C13), `maxDefenseRewindMs` 200ms와 C12 75%의 양립(S6), 비정상 단절 감지 지연(S5), 마을 20~40명 정원(L1), 30Hz 틱 비용(S4), 전환 재시도 상한 3회/30초와 commit·보상 경합(§13.7 10~14, P1-T7), 클립당 제작 시간(S-A2), 막기 블렌드 판독성(S-A5), 보스 클리어율·스케일링 배율(C8·A7).
- **사용자 결정에 달린 것:** [지정] 값(5틱·3초)의 승격 여부(X14), 코디네이터 제안(기름 청구·반환, 이월 자격, 클립 집계 규약)의 채택, 제목·세계관, 플랫폼(PC 우선·Steam), 사업 모델·가격, 유료 AI 생성 사용, ADR-001 스택, 캐릭터 이름 출시 정책(X8), 스태미나 없는 회피·레벨 없는 성장·원버튼 모드 노출·무기 3종, 주 경계 시간대.
- **코디네이터 다음 일:** review-status 마무리(F-13), X16 동결 blob 기록, N-01·N-02(기술)·N-03·N-04(디자인, 선택)·N-05 배정 여부 판단.
