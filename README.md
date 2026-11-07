# 연무: 잔향의 문 / YEONMU

PC 우선 온라인 3D 액션 RPG의 기획 프로젝트. 제목과 조선풍 가상 판타지 배경은 **가칭·제안**이며 상표·스토어명 사용 가능 여부를 확인하지 않았다.

핵심: **장비 보상을 꺼도 싸우고 싶어지는 전투, 전투 방식을 바꾸는 전설 무기, 낯선 사람을 만나는 온라인 세계.**

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

## 격리 원칙

- 이 폴더는 독립 Git 저장소이며 상위 `game-builder`의 추적 대상이 아니다.
- `vendor/game-builder`만 공통 기반을 참조하는 단방향 서브모듈이다. 원본 게임 수정·이동·삭제를 하지 않는다.
- 현재 브랜치: `planning/initial-design`. 원격 저장소 생성·배포·유료 서비스 연결은 아직 하지 않았다.
- 이번 산출물은 기획 문서다. 플레이 가능한 게임이나 서버를 구현했다고 간주하지 않는다.
- 코드 구현은 문서의 단계별 검증 기준을 따라 별도 진행한다. 문서 속 수치와 용량은 측정 전 목표다.

## 협업

Claude Opus high 작업자를 Orca orchestration으로 위임해 설계 → 교차 검토 → 수정 → 독립 검증한다. 코디네이터는 범위·통합·검증을 맡는다. 구현 시 TypeScript strict, npm 단일 lockfile, 기능별 브랜치와 PR을 적용한다.
