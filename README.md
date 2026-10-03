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

With `pnpm dev` running, the site is at http://localhost:5173 (Ctrl+C stops both servers;
pnpm then reports that Vite "failed with signal SIGINT": that is expected).

| Command            | What it does                                                            |
| ------------------ | ----------------------------------------------------------------------- |
| `pnpm dev`         | Starts the API and the web app, reloaded on every change                |
| `pnpm build`       | Builds the web app for production, in `apps/web/dist`                   |
| `pnpm check`       | Runs the checks below, in order, except `test:db`                       |
| `pnpm format`      | Formats every file with Prettier                                        |
| `pnpm lint`        | Lints with ESLint (type-aware rules, rules of React); fails on warnings |
| `pnpm typecheck`   | Type-checks the root configs and every package                          |
| `pnpm test`        | Runs the tests of every package with Vitest                             |
| `pnpm test:db`     | Runs the tests that need PostgreSQL (`docker compose up` first)         |
| `pnpm db:generate` | Writes the migration for the changes of `apps/api/src/db/schema.ts`     |
| `pnpm db:migrate`  | Applies the migrations the database has not run yet                     |

## Layout

- `compose.yaml`: PostgreSQL and Redis for development, only reachable from this machine.
  `docker/postgres/initdb` runs when the database is created.
- `apps/`: deployable applications (API, web app)
  - `apps/api`: REST API (Fastify) served under `/api`. Its settings come from environment
    variables, documented in `.env.example`: it refuses to start if one is invalid.
    - `GET /api/health`: answers 200 while the API is up.
    - `GET /api/v1/players/:region/:name/:tag`: profile of a player, e.g.
      `/api/v1/players/euw/Hide%20on%20bush/KR1` (level, icon, solo and flex ranks).
    - `GET /api/v1/players/:region/:name/:tag/matches?start=0`: a page of 10 matches of the
      player, the most recent first, and the `start` of the next page. Each match is fetched
      from Riot once, then stored in PostgreSQL.
    - `POST /api/v1/players/:region/:name/:tag/refresh`: the "Update" button. The next
      lookups of the player get fresh data from Riot. At most once every 2 minutes per
      player, whoever asks: otherwise 429, with the seconds to wait in `Retry-After`.
    - `GET /api/v1/static-data`: what the web app needs from Data Dragon, Riot's CDN for
      the files of the game: the version of its files (part of every image URL) and the
      name of each champion, by champion ID. Asked to Data Dragon at most once an hour.
    - Every answer carries security headers (helmet). Requests are limited per IP address
      (60 per minute, 20 for player lookups, none for the health check): beyond, 429.
      Unexpected errors answer a generic 500; their details only go to the logs.
      Requests that change something (POST...) sent by a page of another website are
      refused (403): browsers tell where requests come from (`Sec-Fetch-Site`).
    - Riot's answers are cached in Redis: a Riot ID for 6 hours, a level or a rank for
      5 minutes, the latest matches of a player for 2 minutes. Simultaneous lookups share
      the same calls to Riot. Without Redis, the API keeps answering, from Riot.
    - The log line of each request gives the number of calls it sent to Riot (`riotCalls`);
      with `LOG_LEVEL=debug`, each call is logged too.
    - `src/db/schema.ts`: tables of the PostgreSQL database (Drizzle ORM). Each change comes
      with a migration in `drizzle/`, written by `pnpm db:generate` and reviewed like code.
      The migrations run as the superuser, who owns the tables; the API connects as
      `statslol_app`, which can only read and write rows.
  - `apps/web`: the website, a single-page app (React, Vite). React Router picks the page
    of each URL; TanStack Query sends the requests to the API and caches the answers, which
    are checked against the Zod schemas of `packages/shared`. In development, the Vite
    server forwards `/api/...` to the API (port 3000), so the page and the API share the
    same origin, as they will in production.
    - `/`: home page, with the search form: a region and a Riot ID typed in one piece
      (`Hide on bush#KR1`). The Riot ID is checked with the rules of the API (schemas of
      `packages/shared`): an invalid one is reported at once, without any request. Also
      shows whether the API answers (`/api/health`).
    - `/players/:region/:name/:tag`: profile page of a player, e.g.
      `/players/kr/Hide%20on%20bush/KR1` (for now, only whose profile it is). A URL the API
      would refuse (unknown region, invalid name or tag) shows the "not found" page.
    - Tests run in jsdom (a browser simulated in Node.js) with Testing Library; MSW plays
      the API.
- `packages/`: code shared between apps
  - `packages/shared`: what both the API and the browser use, e.g. the Zod schemas of a
    Riot ID, of a region and of the parts of a player URL, so that both validate user
    input with the same rules.
  - `packages/riot-client`: client of the Riot API. Server-only: it sends the API key,
    so browser code must never import it. Its `onCall` option reports each request sent
    to Riot (endpoint, status, duration).
    It spreads its calls to stay under Riot's rate limits, learned from Riot's answers;
    `pnpm --filter @statslol/riot-client check:rate-limits` checks it with 150 real calls
    (about 2 minutes: Riot answers 429 to none of them).
