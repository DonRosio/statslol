# statslol

League of Legends stats website: search a player by Riot ID, view their profile, rank and match history.

Private project, phase 1 (used among friends).

## Requirements

- Node 24 (version in `.nvmrc`, e.g. via nvm)
- pnpm through Corepack (`corepack enable`): the exact version is pinned in `package.json`
- Docker with the Compose plugin
- [gitleaks](https://github.com/gitleaks/gitleaks) 8.30+, used by the pre-commit hook

## Setup after cloning

```bash
pnpm install                              # also enables the secret-scanning pre-commit hook
cp .env.example .env && chmod 600 .env    # then fill in the values
docker compose up --detach --wait         # starts PostgreSQL and Redis (see compose.yaml)
pnpm db:migrate                           # creates the tables
```

The PostgreSQL passwords of `.env` are set when the database is created. To change them, or to
start again from an empty database: `docker compose down --volumes` (deletes the data), then
the last two commands above.

## Commands

| Command            | What it does                                                        |
| ------------------ | ------------------------------------------------------------------- |
| `pnpm dev`         | Starts the API, restarted on every change                           |
| `pnpm check`       | Runs the checks below, in order, except `test:db`                   |
| `pnpm format`      | Formats every file with Prettier                                    |
| `pnpm lint`        | Lints with ESLint, including type-aware rules                       |
| `pnpm typecheck`   | Type-checks the root configs and every package                      |
| `pnpm test`        | Runs the tests of every package with Vitest                         |
| `pnpm test:db`     | Runs the tests that need PostgreSQL (`docker compose up` first)     |
| `pnpm db:generate` | Writes the migration for the changes of `apps/api/src/db/schema.ts` |
| `pnpm db:migrate`  | Applies the migrations the database has not run yet                 |

## Layout

- `compose.yaml`: PostgreSQL and Redis for development, only reachable from this machine.
  `docker/postgres/initdb` runs when the database is created.
- `apps/`: deployable applications (API, web app)
  - `apps/api`: REST API (Fastify) served under `/api`. Its settings come from environment
    variables, documented in `.env.example`: it refuses to start if one is invalid.
    - `GET /api/health`: answers 200 while the API is up.
    - `GET /api/v1/players/:region/:name/:tag`: profile of a player, e.g.
      `/api/v1/players/euw/Hide%20on%20bush/KR1` (level, icon, solo and flex ranks).
    - Every answer carries security headers (helmet). Requests are limited per IP address
      (60 per minute, 20 for player lookups, none for the health check): beyond, 429.
      Unexpected errors answer a generic 500; their details only go to the logs.
    - `src/db/schema.ts`: tables of the PostgreSQL database (Drizzle ORM). Each change comes
      with a migration in `drizzle/`, written by `pnpm db:generate` and reviewed like code.
      The migrations run as the superuser, who owns the tables; the API connects as
      `statslol_app`, which can only read and write rows.
- `packages/`: code shared between apps
  - `packages/shared`: what both the API and the browser use, e.g. the Zod schemas of a
    Riot ID and of a region, so that both validate user input with the same rules.
  - `packages/riot-client`: client of the Riot API. Server-only: it sends the API key,
    so browser code must never import it.
    It spreads its calls to stay under Riot's rate limits, learned from Riot's answers;
    `pnpm --filter @statslol/riot-client check:rate-limits` checks it with 150 real calls
    (about 2 minutes: Riot answers 429 to none of them).
