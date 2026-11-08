# 3D 렌더 기반 ① 검증 기록

2026-11-08, `redesign/arpg-loop`, 기준 HEAD `8e28b42`.

## 구현

- 쿼터뷰 52도, 부드러운 추적과 휠 3단계 줌; ACES/sRGB/안개, 주인공 그림자 횃불과 방 횃불 조명 최대 4개.
- 시드별 석재 타일·벽 인스턴싱, 가리는 전방 벽 낮춤, 룸당 횃불 2개.
- GLB 교체 경계 `PlayerModel`; 갓·도포·환도 도형 모델과 이동 회전·시전 동작.
- 적 종류별 인스턴싱, 보스 단독 메시, 정예 강조·피격 흰색·32개 사망 풀.
- 희귀도 빛기둥·발광 체력 구슬·귀환 문; 레이캐스트 이동/추적 공격/줍기/시전, Shift, I/R, 저장 유지.
- 매 틱 이전 좌표 캡처 → `FixedStepper.advance()` alpha 보간; 모든 틱 이벤트를 프레임 큐로 모은 뒤 소비.
- `?perf`, `?mobs=N`(총수, 1~400), `?seed=N`(재현용), `?bloom=0`; 기본 블룸 켬.
- `window.yeonmu.world` 유지, `project`, `perf`, `resetPerf`, `events`, `aim`, `renderer`, `camera` 추가.
- sim 및 의존성 변경 없음; 신규 클라이언트 모듈은 모두 300줄 미만.

## 검증

`npm run check`, `npm test`(26개), `npm run build` 통과. Vite 단일 JS 번들 약 592 kB 경고가 있으며 빌드는 성공한다.

Orca 브라우저 포인터/키 입력 검증: 클릭 이동, 끌기, 줌, Shift 제자리, 적 레이캐스트 및 추적 공격, 우클릭/1 시전, I 열기, 아이템 줍기·장착, R 재진입, 문 귀환, 저장 통과. 초기 아이템 테스트는 생성 후 200ms 대기 검사에서 실패했고, 800ms 대기 후 재검증은 통과했다; 타이밍이 원인이라는 해석은 추정이다.

재진입 3회: GPU geometries 25 → 25 → 25 → 25, textures 16 → 16 → 16 → 16. 최종 브라우저 콘솔 오류 없음. 테스트용 프로필은 원본으로 복구했다.

## 스크린샷 / 원시 증거

저장소 기준 경로(로컬 파일, `artifacts/`는 Git 제외):

- `artifacts/render-base/entry.png`: 던전 진입, 기본 블룸.
- `artifacts/render-base/combat.png`: 14마리 일반 무리와 실제 sim 전투, 시전 후 9킬 및 쓰러지는 적.
- `artifacts/render-base/combat-load.png`: 100마리 각성 부하 장면.
- `artifacts/render-base/input-smoke-result.json`, `input-smoke.js`: 입력 검증 및 재현 스크립트.
- `artifacts/render-base/reentry-memory-result.json`, `reentry-memory.js`: 재진입 자원 검증.
- `artifacts/render-base/perf-bloom-on.json`, `perf-bloom-off.json`, `benchmark.js`: 부하 측정 원본.

전투 스크린샷은 플레이어를 일반 무리 옆으로 이동하고 임시 무적을 부여한 검사 fixture이며, 공격·피격·사망·드랍은 실제 sim으로 진행했다. 무수정 일반 플레이의 생존·밸런스 검증을 의미하지 않는다.

## 100마리 성능

Orca 내장 브라우저, dev Vite, 1393×921, DPR 1, NVIDIA RTX 3080 Ti / ANGLE D3D11. 동일 시드 424242, 일반 방에 100마리를 모아 모두 각성시켰다. 플레이어 무적과 보스 추가 소환 억제로 표본 동안 100마리를 유지했으며, 5초 예열 후 20초 측정(각 600 sim 틱)했다.

| 블룸 | frame p95 | sim p95 | draw calls | 프레임 표본 |
|---|---:|---:|---:|---:|
| 켬 | 93.4 ms | 0.20 ms | 84 | 258 |
| 끔 | 93.4 ms | 0.20 ms | 70 | 270 |

frame은 실제 requestAnimationFrame 간격이며 GPU 시간만을 뜻하지 않는다. draw calls는 그림자 및 후처리 전체를 포함한다. sim p95는 입력 레이캐스트를 제외한 `step()` 시간이며 최대 600틱 표본이다.

**프레임 성능은 낮고 원인은 아직 확정하지 못했다.** 별도 시작 방 진단에서 그림자를 꺼도 frame p95는 같았고, renderer.render CPU 호출 p95는 0.8ms(그림자 끔 0.5ms)였다. 빈 페이지 RAF p95는 13.4ms였다. 이 수치만으로 GPU나 Orca 표시 계층 중 하나를 원인으로 단정할 수 없다. 블룸 해제가 frame p95를 개선하지 않아 기본 켬을 유지했다; 60fps 달성을 주장하지 않는다.

## 다음 작업 경계

sim 추가 API 요구 없음. ②의 이펙트/발사체/위험 예고 및 ③의 정식 HUD는 이 작업 범위 밖이다. 성능 병목 추가 분석과 사용자 PC에서의 직접 플레이 확인은 후속 과제다.

개발 서버: `http://127.0.0.1:5173/`, Orca 터미널 `term_96702b2d-6169-41c0-82d4-4a1856f9acb2`. 브라우저 페이지 `7f6916da-d596-4c19-9e6f-1d55ff33c3a0`.

