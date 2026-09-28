# Collaboration for this project

## Repository layout

`game-builder` is the base: shared guidance, standards and the legacy showroom. Each game under active development lives in its own GitHub repository and is linked here as a git submodule under `services/` (same pattern as `app-builder-base`).

```
game-builder/                  # base — guidance, standards, legacy showroom (src/, *.html)
├── AGENTS.md  CLAUDE.md  docs/
└── services/
    └── arctic-diner/          # github.com/hee882/arctic-diner — 북극 사냥 식당
```

- A service is a capsule. While working inside `services/<slug>/`, do not edit the base or another service. Commits for a service are made in that service's repository; the base only records submodule pointer updates (`<slug>: 포인터 갱신`).
- Each service carries its own `AGENTS.md` (game concept, stack, user feedback log), `docs/` (plan, design, handoff) and a fixed dev port. Read the service's `AGENTS.md` before working in it.
- New games start as a new repository plus `git submodule add <url> services/<slug>`. Games that were judged not fun stay in Git history and are not split out.
- Clone with `git clone --recurse-submodules`.

## Delegation

- The user requires detailed implementation to be delegated to multiple workers through Orca orchestration. Preferred worker: Codex with `gpt-6-astra`. When Codex is unavailable (for example its usage limit), use Claude Opus with high effort. Do not switch to any other provider or model without user direction.
- The coordinator owns the contract (shared types, data, module signatures), task specifications, sequencing, integration, validation and release. Workers own disjoint files; the ownership table lives in the service's `docs/HANDOFF.md`.
- Use multiple rounds: design, implementation, then independent validation and fixes.

## Game direction

- The user judges a game by playing it. For a new direction or a large feature, show a short plan first and build after the user picks.
- Prioritize rapid visible growth, meaningful choices, automation of solved chores, and discoveries that unlock new actions. Avoid shallow reskins. Outside idle games, avoid repetitive numerical upgrades.
- Idle/키우기 games: numerical growth is the core loop and is allowed. Growth must stay visible, and milestones should periodically unlock a new action or system rather than only raise stats.
- Preserve prior games in Git history.

Follow the TypeScript strict, npm, testing and Git conventions in CLAUDE.md. User instructions take precedence.
