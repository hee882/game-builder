# Repository layout

## Ownership

Each game repository owns its production code, history, `main` branch, tests,
and deployment. `game-builder` owns game-neutral guidance, templates, and
reusable packages.

```text
game-builder/                         # common base
penguin-gourmet-club/                 # independent game repository
└── vendor/game-builder/              # pinned game-builder commit
```

The relationship is intentionally one-way. `game-builder` does not track the
game repositories as submodules. This avoids recursive checkout paths and lets
Vercel build a private game repository while fetching the public base submodule.

## Change flow

1. A game change is implemented in the game repository and merged into that
   repository's `main` through a pull request.
2. A common change is implemented in `game-builder` and merged into its
   `main` through a pull request.
3. Each game updates `vendor/game-builder` to the approved base commit in its
   own pull request.
4. Vercel connects directly to each game repository. Feature branches create
   previews and `main` creates production deployments.

The old in-tree games and showroom remain available in this repository as
compatibility examples. New games should start in their own repository and use
the base submodule from the beginning.
