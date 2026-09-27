# Project Physicality — notes for Claude Code

Local-first React 19 + TypeScript + Vite 8 PWA. Per-muscle XP/levels, a deterministic replay engine, and a
procedural three.js body model. See `README.md` for the architecture.

## In-progress work

**Read `docs/tasks/body-scan-precise-model.md` first.** It holds the spec, the decisions already made, the status
checklist and the next steps for the photo body-scan and precise-model feature. Update its checkboxes as you
complete steps.

## Conventions

- Domain logic lives in `src/domain/`. It is pure TypeScript with no React, and every rule change gets a unit test.
- Persisted data is validated with Zod (`src/domain/schema.ts`) and stored in metric units. Any shape change needs
  two things:
  - a `DATA_VERSION` bump;
  - a migration in `src/store/persistence.ts`, with a test.
- Never persist derived state (XP, levels). The engine recomputes it from raw logs.
- Non-component exports go in `.ts` modules, not `.tsx` files. `oxlint --deny-warnings` enforces react-refresh
  rules.
- Formatting: Prettier (`npm run format`). CI runs `format:check`.

## Commands

- `npm run dev` — dev server. Run `npm run vision:assets` once for the body-scan models.
- `npm run check` — typecheck + lint + unit tests + build. It must stay green.
- `npm run test:e2e` — Playwright. If the bundled Chromium is missing, set `PLAYWRIGHT_CHROMIUM_PATH`.
