# token-radar-velocity-03

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/hugo61-oss/token-radar-velocity-03/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/hugo61-oss/token-radar-velocity-03/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Velocity Radar — a token launch radar that ranks pre-token protocols by capital velocity, not bulk. A protocol's implied value follows from how fast capital is moving into it this week, how widely that capital spreads across chains, and how long it has run without a token. Every row carries a weekly farm plan: show up every week, not one big deposit.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot, scores the board with the velocity model in `lib/velocity.ts`, and writes `board.json`, `data.js`, `dashboard/` and `screenshots/` plus `dossier.json` into the output directory. The dashboard is a static page with no network: board, detail view per protocol, filters, sort, and a separate live-token view.

---

<sub>Entered on [make.fun](https://make.fun/?ref=velocity-radar&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
