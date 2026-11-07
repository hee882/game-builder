# 연무: 잔향의 문 / YEONMU

PC 우선 온라인 3D 액션 RPG 프로젝트. 현재 **단계 0 오프라인 전투 증명**을 구현했다. 제목과 조선풍 가상 판타지 배경은 **가칭·제안**이며 상표·스토어명 사용 가능 여부를 확인하지 않았다.

핵심: **장비 보상을 꺼도 싸우고 싶어지는 전투, 전투 방식을 바꾸는 전설 무기, 낯선 사람을 만나는 온라인 세계.**

## 전투 증명 실행

Node.js 24 및 npm 사용. 이 폴더에서 실행한다.

```sh
npm ci
npm run check
npm test
npm run build
npm run dev
```

`http://127.0.0.1:5173`에서 **수련 시작**을 누른다. WASD 이동, J/좌클릭 약공, K/우클릭 강공(18틱 홀드 = 일섬), Space/L 회피, Shift/; 튕겨내기(홀드 = 막기), Q/E/R/F 기술. 마우스를 움직이면 그 방향으로 공격하며, 키보드만 쓸 때는 이동 방향 전방의 적을 자동 조준한다.

- J를 빠르게 네 번 연결하면 마무리 횡베기. 첫 J 뒤 칼끝 박자 신호가 뜰 때 J → K는 지연 베기 → 내려찍기다.
- 회피 종료 직후 J는 흘려베기, 튕겨내기 성공 뒤 J/K는 반격이다. 방패 정면 연타는 튕겨 나가며 지연 베기로 넘겨 친다.
- 우측 비교 조건 또는 `?mode=simple` / `?mode=branch`로 A/B를 바꾼다. 적·배치·체력·기술·방어는 같고, A는 약공 4연타와 기술만 쓴다.
- 하단 **수련 도구**에서 14개 동작을 따로 볼 수 있다. 동작 보기와 일시 정지는 전투 측정에서 제외된다. 전투로 돌아온 뒤 **계속하기**를 누른다.
- **기록 내려받기**는 JSON을 내려받는다. 로컬스토리지 `yeonmu-p0-<sessionId>`에도 기록한다. 외부 전송은 없다.
- 수련은 전멸·패배·10분에서 끝난다. 다시 시작하면 같은 조건으로 초기화한다. 탭 비활성화 때 자동 정지한다.

구현 범위·검증 증거·임시 대체·미측정 항목은 [단계 0 구현 보고서](docs/production/p0-implementation-report.md)에 정리했다. **G-P0 통과를 선언한 것이 아니며 단계 1은 착수하지 않았다.**

## 문서 읽는 순서

1. [범위와 결정 상태](docs/production/decision-register.md)
2. [게임 컨셉](docs/design/concept.md)
3. [세계관·시놉시스·시나리오](docs/design/narrative.md)
4. [퀘스트 설계](docs/design/quests.md)
5. [전투·콤보·아이템·조합](docs/design/combat-and-items.md)
6. [기술 스택·온라인 아키텍처](docs/technical/architecture.md)
7. [디자인·UI·모델·리깅·애니메이션](docs/technical/art-and-animation.md)
8. [단계별 제작·사업·검증 계획](docs/technical/delivery-and-business.md)
9. [검토 완료 범위와 재개 지점](docs/production/review-status.md)
10. [디자인 교차 검토](docs/production/design-cross-review.md) · [기술 교차 검토](docs/production/technical-cross-review.md)
11. [독립 검증 결과](docs/production/independent-validation.md) · [검증 계획](docs/production/validation-plan.md)

## 격리 원칙

- 이 폴더는 독립 Git 저장소이며 상위 `game-builder`의 추적 대상이 아니다.
- `vendor/game-builder`만 공통 기반을 참조하는 단방향 서브모듈이다. 원본 게임 수정·이동·삭제를 하지 않는다.
- 구현 브랜치: `impl/p0-combat-proof` (`planning/initial-design`의 `2d0d550`에서 시작). 원격 생성·배포·유료 서비스 연결은 하지 않았다.
- 플레이 가능한 오프라인 회색 상자만 구현했다. 서버·계정·아이템·퀘스트·온라인 플레이는 구현하지 않았다.
- 기존 기획 문서 속 성능·재미 수치는 측정 전 목표이며, 단계별 게이트를 별도로 통과해야 한다.

## 협업

기획은 Claude Opus high 다중 작업자의 설계·교차 검토·수정·독립 검증을 거쳤다. 2026-11-07 사용자 결정으로 단계 0 구현은 Codex Astra, 점검은 Claude 코디네이터가 맡는다. TypeScript strict, npm 단일 lockfile과 기능 브랜치를 적용하며, 원격이 없어 PR·푸시는 만들지 않았다.
