# statslol

League of Legends stats website: search a player by Riot ID, view their profile, rank and match history.

Private project, phase 1 (used among friends).

## Requirements

- Node 24 (via nvm) and pnpm (via Corepack)
- Docker with the Compose plugin
- [gitleaks](https://github.com/gitleaks/gitleaks) 8.30+, used by the pre-commit hook

## Setup after cloning

```bash
git config core.hooksPath .githooks       # enable the secret-scanning pre-commit hook
cp .env.example .env && chmod 600 .env    # then fill in the values
```
