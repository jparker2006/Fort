# Fort

A single-player, desktop-only creative freebuild sandbox delivered as an
installable fullscreen PWA. Build, edit, and move; no combat, no economy,
infinite materials. All visual assets are original.

## Stack

Vite + TypeScript + vanilla Three.js. See `TICKETS.md` for the architecture
summary and the full ticket plan.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server on port 5173. |
| `npm run build` | Typecheck, then build the production bundle to `dist`. |
| `npm run preview` | Serve the production build on port 4173. |
| `npm run typecheck` | Run `tsc --noEmit`. |
| `npm run lint` | Run ESLint with zero warnings allowed. |
| `npm run check:no-emdash` | Fail if an em dash (U+2014) appears in any tracked text file. |
| `npm run check` | Typecheck, lint, and the em dash scan. |
| `npm run test:unit` | Run Vitest unit tests. |
| `npm run test` | Run the Playwright suite in a real browser. |
| `npm run verify` | Run check, unit tests, and the Playwright suite. |

## Project rules

- No em dashes anywhere in code, comments, UI copy, or docs. `npm run check`
  enforces this via `scripts/check-no-emdash.mjs`.
- No Epic Games assets, character likenesses, icon art, or trade dress. All art
  originates in this repository.
- Builds do not persist across reloads; settings and key binds do.
- Every gameplay input flows through the action map (see `src/input`); hardcoded
  key checks in gameplay code are a defect.

## Requirements

Desktop browser with WebGL2 and Pointer Lock. Chromium is used for automated
verification via Playwright.
