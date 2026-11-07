# YEONMU project rules

- 현재 기준 문서: docs/arpg/slice-spec.md (디아블로식 오프라인 파밍 절편). 그다음 docs/production/decision-register.md.
- This is an independent game repository. Do not edit the parent repository or vendor/game-builder during game work.
- 2026-11-07 사용자 결정: 쿼터뷰 핵앤슬래시(빠른 템포·몹 무리·랜덤 옵션 장비·쉬운 빌드), 클릭 이동 + 스킬 단축키, 오프라인 한 바퀴 우선. 특정 기존 게임의 이름·캐릭터·아트·레벨 복제 금지.
- 구현은 Codex Astra(사용량 부족 시 Claude), 점검은 Claude. Astra에 보내기 전 예상 사용량을 추정하고 사전 점검을 먼저 한다.
- 서버·계정·온라인·퀘스트 체인·Electron·외부 유료 서비스는 현재 범위 밖.
- 게임 로직은 packages/sim(순수 TS, 결정적, 30Hz), 렌더·입력·UI는 apps/client(three.js). sim은 DOM·three.js에 의존하지 않는다.
- TypeScript strict and npm are required. Native-engine alternatives need an explicit language-policy decision before adoption.
- Use feature branches and PRs, never direct main pushes. Keep secrets, generated builds and large generated art out of Git.
- Clearly distinguish approved requirements, proposed design, unverified assumptions, and measured results.
- Do not present performance, fun or production readiness as verified without evidence.
