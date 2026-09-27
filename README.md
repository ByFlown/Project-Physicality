# Project Physicality

**Level up every muscle.** Project Physicality is a full-body, muscle-by-muscle training tracker. Every muscle
has its own level, and a live 3D model of your body shows each muscle bulge as it grows and shrink when you
stop training it.

- **18 muscles, each with XP and a level.** Chest, three deltoid heads, biceps, triceps, forearms, traps, lats,
  upper and lower back, abs, obliques, glutes, quads, hamstrings, adductors and calves.
- **A level curve that levels off.** Levels 1→5 cost exponentially more XP (100, 150, 225, 338). From level 5
  on, every level costs the same 506 XP.
- **Levels go down when you stop training.** A muscle that gets fewer than 3 effective sets a week loses XP
  after a 7-day grace period. XP lost this way is banked as _muscle memory_, and you earn it back at double speed.
- **Interactive 3D body.** A procedural body model scaled to your height, weight and body fat. Muscles are
  displacement fields on one continuous skin, coloured by level or status. Click a muscle to open its details.
- **Starting assessment + daily tracking.** Onboarding blends your training experience with a fat-free-mass
  index (FFMI). Body fat comes from a reported value or U.S. Navy tape measurements. Daily you log workouts,
  body weight, sleep and protein, and take tape measurements every week or two.
- **Local-first and private.** No account or server. Data lives in IndexedDB, protected by a synchronous
  write-ahead journal. You can export and import JSON backups, the app works offline as a PWA, and open tabs
  stay in sync.

Try it without typing anything: on the welcome screen, choose **Explore with demo data**. It loads 12 weeks of
realistic history, including a holiday week and some decaying calves.

## Quick start

```bash
npm ci
npm run dev          # http://localhost:5173
```

| Script                       | What it does                                                     |
| ---------------------------- | ---------------------------------------------------------------- |
| `npm run dev`                | Vite dev server                                                  |
| `npm run build`              | Type-check + production build to `dist/` (with service worker)   |
| `npm run preview`            | Serve the production build                                       |
| `npm test`                   | Unit tests (Vitest) — engine, level curve, stimulus, persistence |
| `npm run test:e2e`           | End-to-end tests (Playwright, desktop + mobile)                  |
| `npm run lint` / `typecheck` | oxlint (zero warnings) / `tsc -b`                                |
| `npm run check`              | Everything CI runs, except e2e                                   |

Requires Node ≥ 20.19. For e2e tests, run `npx playwright install chromium` once. If you want to use a
Chromium that is already installed, set `PLAYWRIGHT_CHROMIUM_PATH` to its path.

## Deploying

The build is a static site, so any static host works. Just make sure unknown paths fall back to `index.html`.

- **Docker / nginx:** `docker build -t physicality . && docker run -p 8080:8080 physicality`. It runs
  unprivileged nginx with a strict CSP, immutable asset caching and a no-cache service worker
  (`deploy/nginx.conf`).
- **Vercel:** `vercel.json` is included.
- **Netlify:** `netlify.toml` is included.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit tests and the build, then the Playwright suite.

## How the model works

The full, user-facing explanation is in the app under **How it works**. In short:

1. **Stimulus.** Each working set scores `effort(RIR) × repRange(reps)`, so a hard set of 5–30 reps counts as 1.
   A primary mover gets the full set, a secondary 0.5 and a stabiliser 0.25 (`src/domain/exercises.ts`, 75
   exercises; you can also add custom ones).
2. **Diminishing returns.** Per session, returns start to taper after 6 effective sets per muscle and level off
   at about 10. Per week, sets beyond 20 are worth only 30%.
3. **XP** = `sessionValue × weeklyScale × 10 × recovery`, plus a PR bonus when an exercise's estimated 1RM
   (Epley) improves. `recovery` is 0.85–1.15, based on the last 3 days of sleep and protein. Days you don't
   log count as neutral.
4. **Decay.** Once a muscle's rolling 7-day volume falls below 3 sets, it gets 7 days of grace. After that it
   loses 1.5% of a level's cost per day, ramping up to 5% per day over two weeks. Lost XP goes into a memory
   bank, and future gains are matched from that bank until it is repaid.
5. **Overall level.** This is the weighted mean of all muscle XP, with bigger muscles weighted more. It uses
   the same level curve.

The engine (`src/domain/engine.ts`) is a **pure, deterministic replay**: it simulates day by day, from your
start date to today, over the raw logs. When you edit or delete a past workout, everything downstream
(levels, decay, PRs, events) is recomputed consistently. A year of data replays in a few milliseconds.

## Architecture

```
src/
  domain/      Pure TypeScript, no React — fully unit-tested
    engine.ts      day-by-day simulation: XP, levels, decay, muscle memory, PRs, streaks
    leveling.ts    exponential-then-flat level curve, tiers
    stimulus.ts    set scoring, per-session and weekly diminishing returns, e1RM
    assessment.ts  onboarding baseline (experience + FFMI + self-ratings)
    bodycomp.ts    Navy body fat, FFMI, BMI-based fallback
    schema.ts      Zod schemas = persisted data model (metric units)
    preview.ts     "what is this workout worth" diffing
  body3d/      Procedural 3D body (three.js via react-three-fiber), lazy-loaded
    geometry.ts    elliptical lofts with per-vertex surface parameters
    anatomy.ts     body proportions + muscle footprints in surface coordinates
    deform.ts      bulge displacement, vertex colours, per-vertex muscle ownership (picking)
  store/       Zustand store, IndexedDB persistence, write-ahead journal, cross-tab sync
  features/    Pages (dashboard, workout logger, check-in, measurements, progress, …)
  components/  UI primitives, charts (hand-rolled SVG, accessible), level ring
```

Key decisions:

- **Local-first instead of accounts.** Body data is sensitive, and a static app needs no backend to run.
  Everything goes through `store/persistence.ts`, so a sync backend can be added behind the same interface
  later.
- **Store raw logs, derive all state.** Nothing derived (XP, levels) is persisted, so changing the rules
  never needs a data migration.
- **Procedural model instead of a downloaded anatomy mesh.** There are no licensing issues, it is tiny
  (~14 kB of code) and it is fully parametric. The trade-off is a stylised mannequin rather than photoreal
  anatomy.

## Honest limitations

- Levels measure **training done and sustained**, not measured muscle. The only ground truth is your tape
  measurements and lean-mass trend, and the app charts both.
- The Navy body-fat formula is accurate to roughly ±3–4 percentage points. FFMI inherits that error.
- Data lives in one browser. Export backups regularly. The app asks the browser to make storage persistent,
  but some browsers may refuse.

## License

MIT
