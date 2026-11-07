# 연무: 잔향의 문 / YEONMU

조선풍 퇴마 판타지 배경의 **쿼터뷰 핵앤슬래시 액션 RPG**(오프라인 파밍 절편). 제목·배경은 가칭.
현재 기준 문서는 [오프라인 파밍 절편 설계](docs/arpg/slice-spec.md)다.

## 실행

```sh
npm ci
npm run check   # 타입·경계 검사
npm test        # sim 규칙 테스트
npm run build
npm run dev     # http://127.0.0.1:5173
```

지금 화면은 **임시 2D 디버그 화면**이다(정식 three.js 화면 작업 예정).
좌클릭 이동·공격·줍기, 우클릭·1~4 스킬, Shift 제자리 공격, I 가방(클릭 = 장착). 보스를 쓰러뜨리면 파란 문을 눌러 새 던전으로 재진입, 쓰러지면 R. 장비·레벨은 `localStorage['yeonmu.save.v1']`에 저장된다.
부하 확인: `?mobs=100`으로 몹을 추가 배치한다.

## 구조

| 경로 | 역할 |
|---|---|
| `packages/sim` | 순수 TS 게임 규칙. 30Hz 고정 스텝, 시드 결정성. 던전 생성·길찾기·스킬·적 AI·드랍·성장·저장 검증 |
| `apps/client` | 화면·입력·저장소. sim 상태를 읽어 그린다 |
| `docs/arpg` | 현재 설계 |
| `docs/design`, `docs/technical`, `docs/production` | 이전 방향(콤보 액션·온라인 우선) 보관 기록 |

공통 기반 `vendor/game-builder`는 단방향 서브모듈이며 수정하지 않는다. 원격 저장소는 아직 없다.
