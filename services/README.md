# Local game checkouts

`game-builder` is the common base repository. Game repositories are independent
and must not be nested as submodules here, because the game repositories consume
`game-builder` as their own submodule.

Keep local checkouts under this directory when convenient:

```text
services/
└── arctic-diner/  # clone of https://github.com/hee882/arctic-diner.git
```

The directory is ignored by the base repository. Deploy each game from its own
GitHub repository and keep its `main` branch as the production source.
