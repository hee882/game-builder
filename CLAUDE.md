# YEONMU project rules

- Read README.md and docs/production/decision-register.md first.
- This is an independent game repository. Do not edit the parent repository or vendor/game-builder during game work.
- Delegate implementation and review fixes to multiple Claude Opus high workers through Orca orchestration. Coordinator owns specifications, integration and validation.
- Current scope is planning documentation only; do not install frameworks or implement gameplay yet.
- TypeScript strict and npm are required for the planned implementation. Native-engine alternatives need an explicit language-policy decision before adoption.
- Use feature branches and PRs, never direct main pushes. Keep secrets, generated builds and large generated art out of Git.
- Clearly distinguish approved requirements, proposed design, unverified assumptions, and measured results.
- Do not present provider integrations, performance, pricing or production readiness as verified without evidence.
