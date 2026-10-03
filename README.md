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
```

## Commands

| Command          | What it does                                   |
| ---------------- | ---------------------------------------------- |
| `pnpm dev`       | Starts the API, restarted on every change      |
| `pnpm check`     | Runs all the checks below, in order            |
| `pnpm format`    | Formats every file with Prettier               |
| `pnpm lint`      | Lints with ESLint, including type-aware rules  |
| `pnpm typecheck` | Type-checks the root configs and every package |
| `pnpm test`      | Runs the tests of every package with Vitest    |

## Layout

- `apps/`: deployable applications (API, web app)
  - `apps/api`: REST API (Fastify) served under `/api`, e.g. `GET /api/health`.
    Its settings come from environment variables, documented in `.env.example`:
    it refuses to start if one is invalid.
- `packages/`: code shared between apps; `@statslol/shared` holds what both the API and the browser use
