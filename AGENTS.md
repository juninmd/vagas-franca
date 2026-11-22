# AGENTS.md

vagas-franca: a Telegram bot that posts each day's open jobs in Franca-SP. It collects from about 10 job boards, deduplicates them in SQLite, and enriches them with an AI provider. It also has a small web view.

## Stack

- Bun 1.4 runtime, TypeScript 5.
- SQLite for dedupe (`data/*.db`, path from `DB_PATH`).
- AI enrichment through LiteLLM or Ollama (`AI_PROVIDER`).
- Biome for lint and format (`biome.json`). `bun test` with `bunfig.toml`.
- Web view in `web/` (Vite).

## Commands

```bash
bun install
bun run dev                 # src/index.ts
bun run start               # src/index.ts --loop, scheduled by CRON_* variables
bun run ingest              # collect sources once
bun run digest              # build and send the digest once
bun run smoke               # src/smoke.ts
bun run typecheck           # tsc --noEmit
bun test                    # preloads tests/setup.ts, which isolates the production DB
bun run lint                # biome check --write . (rewrites files)
bun run web                 # src/server.ts
bun run web:install && bun run web:build
bun run web:dev
```

## Structure

- `src/index.ts`: entry point, with flags `--loop`, `--ingest`, `--digest`.
- `src/ingest.ts`, `enrich.ts`, `analysis.ts`, `digest.ts`, `telegram.ts`: pipeline and delivery.
- `src/db.ts`: SQLite. `src/sources/`: one parser per job board.
- `src/config/`: env, areas, region, topic. `src/web-server.ts`, `src/vagas-api.ts`: web view API.
- `tests/`: Bun tests. `web/`: Vite front end. `scripts/`: screenshot generators for the README and the web view.
- `docs/`: notes on sources, parsers and AI, and the web view.

## Conventions

- Env variable names are in `.env.example`. Values never go in the repo, and `.env` is gitignored.
- Run `bun run lint` and `bun run typecheck` before committing.
- Keep the test setup that isolates the production database (`tests/setup.ts`).
- Add a new job board as its own module in `src/sources/`.

## Gotchas

- `docker.yml` builds and pushes an image on every push to `main`. Merging to `main` publishes.
- `bun run lint` writes files (`--write`). Review the diff after it runs.
- The dedupe state lives in SQLite. Losing the database makes the bot post jobs again.
- Schedules come from `CRON_TZ`, `CRON_INGESTION`, and `CRON_DIGEST`.

<!-- base-actions-main-policy -->
## GitHub Actions — padrão obrigatório (@main)

- Referencie as actions internas sempre pelo branch, nunca por SHA:
  - `uses: juninmd/base-actions/<action>@main`
  - `uses: juninmd/base-actions/.github/workflows/<arquivo>.yml@main`
- Não fixe `@<sha>` em `juninmd/base-actions`: a atualização é centralizada no
  `main` e passa a valer no próximo run.
- PRs cujos checks não iniciam por billing/spending limit são mesclados pelo bot central
  `juninmd/base-actions/.github/workflows/auto-merge-billing-blocked.yml`.
  Para impedir o merge automático de um PR, aplique a label `do-not-merge`.
