# statslol

League of Legends stats website: search a player by Riot ID, view their profile, rank and match history.

Personal project, phase 1: used among friends, with its own deployment (see `deploy/`).
statslol isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or
anyone officially involved in producing or managing Riot Games properties. Riot Games, and all
associated properties are trademarks or registered trademarks of Riot Games, Inc.

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
pnpm --filter @statslol/web exec playwright install --only-shell chromium
                                          # browser of the end-to-end tests (~110 MB)
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
| `pnpm build`       | Builds the web app in `apps/web/dist`, then checks it has no secret     |
| `pnpm check`       | Runs the checks below, in order, except `test:db`                       |
| `pnpm format`      | Formats every file with Prettier                                        |
| `pnpm lint`        | Lints with ESLint (type-aware rules, rules of React); fails on warnings |
| `pnpm typecheck`   | Type-checks the root configs and every package                          |
| `pnpm test`        | Runs the tests of every package with Vitest                             |
| `pnpm test:db`     | Runs the tests that need PostgreSQL (`docker compose up` first)         |
| `pnpm test:e2e`    | Builds the web app, then tests it in a real browser (Playwright)        |
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
      from Riot once, then stored in PostgreSQL. Each one has the player's result, KDA,
      level, vision score, spells, runes and items, and its 10 players (18 in Arena: Riot ID,
      champion, side).
    - `GET /api/v1/matches/:region/:matchId`: the details of a match, e.g.
      `/api/v1/matches/euw/EUW1_8001854388`: its teams (the 2 sides, or in Arena the teams of
      players, the best place first) with the result, the kills, the gold and the objectives
      of each, and all their players (level, spells, runes, items, score, damage, gold,
      vision). Read from PostgreSQL; fetched from Riot once if the match is not there yet.
      400 for the match of another server, 404 for one Riot does not have.
    - `GET /api/v1/matches/:region/:matchId/ranks`: the rank of each player of the match
      (the Ranked Flex rank in a Ranked Flex game, the solo/duo rank in any other), by participant number (`null` for an unranked player). One Riot call per player,
      then cached for a few minutes; a player whose rank could not be read is left out of the
      answer (the page shows nothing for them), not shown as unranked.
    - `POST /api/v1/players/:region/:name/:tag/refresh`: the "Update" button. The next
      lookups of the player get fresh data from Riot. At most once every 2 minutes per
      player, whoever asks: otherwise 429, with the seconds to wait in `Retry-After`.
    - `GET /api/v1/static-data`: what the web app needs from Data Dragon, Riot's CDN for
      the files of the game: the version of its files (part of every image URL) and the
      name of each champion, item, summoner spell and rune, by ID. Asked to Data Dragon at
      most once an hour.
    - Every answer carries security headers (helmet). Requests are limited per IP address
      (60 per minute, 20 for player lookups, none for the health check): beyond, 429.
      Behind Caddy, the address of a visitor is the one Caddy gives (`TRUST_PROXY`).
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
      `/players/kr/Hide%20on%20bush/KR1`: icon, level and "Update" button, then a bar of tabs
      (`src/profile-tabs.ts`: each tab is a page of its own, under the address of the profile;
      "Overview", which is the profile itself, and "Arena" for now). The overview has the solo
      and flex ranks, then the match history of the usual games (5v5, ARAM...; the Arena games
      are in their own tab, which is just their history). Pages are loaded by themselves until
      20 games of the tab are there (5 pages at most), then 10 matches at a time ("Show more").
      Above the matches of the overview, a summary of the last 20 games: the win rate as a
      ring, the average KDA, the 3 most played champions (win rate, record and average KDA),
      and the average rank of the player (a placeholder, 5/10, until the factors that decide it
      are chosen).
      A match is colored by its result (the words "Victory" and "Defeat" are only for screen
      readers) and shows its queue, the champion with its level and its position (the icons of
      the positions are in `src/assets/positions`, grey on a dark chip), the score
      (creep score, or vision score for a support), a frame with the spells, the runes and the
      7 item slots, and the players, each
      linked to their profile (in Arena, the player's team). Images (profile icon, champions,
      spells, runes, items) come from Data Dragon; without them, the page shows names and
      empty squares instead. A URL the API would refuse (unknown region, invalid name or
      tag) shows the "not found" page.
    - The arrow at the right of a match opens its details, with a menu bar (General, and
      Analysis, which is not designed yet). "General" has a table for each team (the 2 sides,
      or in Arena the teams by place) with the result, kills, gold (42.3K) and objectives (dragons, void grubs, heralds, barons,
      towers, with their icons), and for each
      player the score, the damage (with a bar relative to the best of the match), the creep
      score per minute (the vision score for a support) and the items. Under each name, the
      rank with its emblem (asked after the table, so it does not delay it). Asked to
      the API when opened for the first time, then kept; nothing scrolls sideways: a narrow
      card puts the numbers on two lines.
    - "Update" button: the API forgets what it knows about the player, and the page loads
      fresh data. Once every 2 minutes per player: the button counts down the delay.
    - Grey blocks stand in for the ranks and the matches while they load. When the API
      cannot answer (server or Riot down, too many requests...), the page says why in plain
      words, with a "Try again" button; an unknown Riot ID shows "Player not found" and the
      search form, filled in to correct it.
    - Every page ends with the legal notice Riot's policies require.
    - `design/wireframes/`: hand-drawn wireframes of the pages. `design/logo/`: the logo, 1440 px
      (`logo.png` with rounded corners, `logo-square.png` full-bleed); `public/` holds its favicon.
    - Styles: each component has its own CSS Module (`Component.module.css`, class names
      made unique by Vite); `src/styles.css` holds the page-wide rules and the design
      tokens (CSS variables: the palette, the colors derived from it, radius). The
      components use no color of their own, and `scripts/design-tokens.test.ts` checks it,
      along with the contrast of each pair of text and background.
    - Tests run in jsdom (a browser simulated in Node.js) with Testing Library; MSW plays
      the API. `e2e/`: end-to-end tests, run by `pnpm test:e2e` with Playwright on the
      production build, in Chromium; the tests play the API and Data Dragon, so no request
      leaves the machine.
- `packages/`: code shared between apps
  - `packages/shared`: what both the API and the browser use, e.g. the Zod schemas of a
    Riot ID, of a region and of the parts of a player URL, so that both validate user
    input with the same rules.
  - `packages/riot-client`: client of the Riot API. Its `onCall` option reports each
    request sent to Riot (endpoint, status, duration). It spreads its calls to stay under
    Riot's rate limits, learned from Riot's answers;
    `pnpm --filter @statslol/riot-client check:rate-limits` checks it with 150 real calls
    (about 2 minutes: Riot answers 429 to none of them).
    Server-only: it sends the API key, so browser code must never import it. Four barriers
    keep the key out of the pages:
    - ESLint refuses any import of it, or of the API's code, in `apps/web` and in
      `packages/shared` (package name, relative path, `import()`);
    - pnpm only lets `apps/web` resolve the packages of its own `package.json`;
    - the web app reads no `.env` file (`envDir: false` in `vite.config.ts`): Vite would
      build their `VITE_*` variables into the JavaScript sent to visitors;
    - `pnpm build` searches every file of `apps/web/dist` for a Riot key and for the Riot
      client's address and header (`apps/web/scripts/check-bundle.ts`), and fails if one
      is there.
- `deploy/`: statslol in production, at https://statslol.donrgames.fr for a list of friends.
  `deploy/README.md`: deploying a version, managing the friends who have access, backups
  (`deploy/check-backup.sh` tries one), monitoring.
  - `deploy/compose.yaml`: runs the images of the API and of the web app with PostgreSQL
    and Redis, each container read-only, without Linux capabilities and with a memory
    ceiling. The database and the cache have no network access outside; only the API and
    the web app are published, on the server itself (ports 3100 and 3101), for its Caddy.
    `deploy/.env.example` lists its settings.
  - The images: `apps/api/Dockerfile` (Node.js runs the TypeScript files, as an
    unprivileged user, without npm) and `apps/web/Dockerfile` (the files of `vite build`,
    served by Caddy, `apps/web/Caddyfile`). Built from the root of the repository; only the
    files listed in `.dockerignore` go in (never `.env`).
  - `.github/workflows/images.yml` builds them for each pull request and starts statslol
    with them as in production, to try it. For each commit of `main`, it also publishes
    them to GitHub's container registry, where the server downloads them:
    `ghcr.io/donrosio/statslol-api` and `ghcr.io/donrosio/statslol-web`, tagged
    `sha-<first 7 characters of the commit>`.
  - `deploy/server/`: the files added to the server (VPS) the site runs on, and how to set
    up a server the same way: SSH with keys only, firewall, automatic updates, swap, Docker.

## Security

The API key of Riot never reaches the browser (see the four barriers above), the containers run
read-only without capabilities, and a pre-commit hook plus a weekly CI run scan for secrets and
vulnerable dependencies. To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Approach

statslol is a way to build a complete, secure web application end to end: a League of Legends
stats site, from the Riot API to a deployment on my own server, that I and my friends really use.

I wrote the specification and drove the project, and I developed it with the assistance of
**Claude** (Anthropic), used as a pair-programming partner. Every commit message ends with a line
saying it was developed with Claude, for that reason. My role: draw the wireframes of the pages
and the logo, choose the look (palette, accent, density of the match cards), set the roadmap in
small steps (the profile, the match history, the details of a match, the champions of a season,
the mastery), decide what is worth building, and ask for security first in every choice (the
Riot key kept on the server, validated input, rate limits that stay under Riot's, a hardened server).
I also reviewed and tested each step, and ran the deployment myself.

The code was written with Claude, then checked: strict TypeScript, type-aware linting, unit tests,
tests against a real PostgreSQL and Redis, end-to-end tests in a real browser (Playwright), a
dependency audit and a secret scan in CI, and Docker images tried as in production before they are
published.

## Credits and license

The code is under the [MIT license](LICENSE). The game images of the web app (ranks, champion
mastery, objectives and roles) are artwork of League of Legends, © Riot Games, used under Riot's
policies: they are not covered by the MIT license. Champion, item, spell and rune images are
loaded from Riot's Data Dragon and are not in this repository.
