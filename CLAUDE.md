# Project Physicality — notes for Claude Code

Local-first React 19 + TypeScript + Vite 8 PWA. Per-muscle XP/levels, a deterministic replay engine, and a
procedural three.js body model. See `README.md` for the architecture.

## In-progress work

**Read `docs/tasks/precision-and-realism.md` first.** It covers the current phases: scan precision (body-model fit,
synthetic benchmark) and the realistic MakeHuman-based body. It holds the decisions, the benchmark results, the status
checklists and the next steps. `docs/tasks/body-scan-precise-model.md` holds the original scan feature spec. Update
the checkboxes as you complete steps.

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
- `npm run scan:bench` — scan accuracy on synthetic bodies. Run it before and after any change to `src/scan/`.
- `npm run body:bake <makehuman checkout>` — regenerate the body model assets (rarely needed; see the asset README).
