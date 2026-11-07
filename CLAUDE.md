# YEONMU project rules

- Read README.md and docs/production/decision-register.md first.
- This is an independent game repository. Do not edit the parent repository or vendor/game-builder during game work.
- 2026-11-07 사용자 결정: 단계 0 구현 진행 중, 구현은 Codex Astra, 점검은 Claude 코디네이터. 이 결정은 이전 planning only / Claude Opus 구현 위임 규칙에 우선한다.
- 현재 구현 범위는 오프라인 전투 증명이다. 서버·계정·아이템·퀘스트·Electron·외부 유료 서비스는 제외한다.
- TypeScript strict and npm are required for the planned implementation. Native-engine alternatives need an explicit language-policy decision before adoption.
- Use feature branches and PRs, never direct main pushes. Keep secrets, generated builds and large generated art out of Git.
- Clearly distinguish approved requirements, proposed design, unverified assumptions, and measured results.
- Do not present provider integrations, performance, pricing or production readiness as verified without evidence.
