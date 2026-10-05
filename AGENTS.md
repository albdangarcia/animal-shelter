<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Tests: where a new test goes

Before writing a test, ask: *if this failed, what would be broken?* Put it in the matching layer.

| If it failed... | Layer | Where | Run |
|---|---|---|---|
| a calculation, a formatter or a validation schema is wrong | unit, no database | `app/**/*.test.ts` | `npm test` |
| the wrong thing is saved, refused or logged (locks, transactions, audit rows) | database, real Postgres | `prisma/**/*.test.ts` | `npm run test:db` |
| a widget behaves wrong: a picker, a dialog, a filter control | component, real Chromium | `components/**/*.test.tsx` | `npm run test:components` |
| a user cannot finish a task, or a page is not wired to the rule | browser | `tests/e2e/**` | `npm run e2e` |

**A component test is for a shared client widget** (`components/forms`, `components/table-common`, the `components/ui` wrappers, the command palette, the login prompt): what a click, a key or a value does to it. It runs in Vitest browser mode, so it gets real layout and focus and reads like a Playwright test. A whole form that imports server actions stays in the browser; the browser keeps one test per form that shows the page is wired to its widgets (for the date picker, a trigger found by its `"<Label> *:"` name). The model to copy is `components/forms/date-fields.test.tsx`.

**A browser test is for what only a browser can show:** a whole journey; that a refusal reaches the screen; who sees which actions; redirects and sign-in; layout; time zones.

**For a new server rule**, write database tests for every case, plus at most one browser test showing it on screen. The model to copy is outcome reversal: `prisma/outcome-reversal.test.ts` covers every rule (refusals, locks, units, listings, applications), and `tests/e2e/animals/outcome-reversal.spec.ts` has two journeys.

**Database tests drive auth-free modules.** A database test must not import, even indirectly, `@/auth`, `app/lib/auth/session`, or anything that imports `RequirePermission` or `withAuthenticatedUser`: that builds the auth setup, which fails in CI. Put the logic in a module with no auth or `next/*` imports (a service in `app/lib/services/`, or a query module beside its `*.data.ts`), and let the action or `*.data.ts` file wrap it. Run one file with `npm run test:db -- prisma/<file>.test.ts`.

These rules are for new tests. Do not delete or move existing browser tests as a side effect of other work.

## Running tests locally

- Run the unit, component and database tests freely. `npm run test:components` needs Playwright's Chromium (`npm run e2e:install`).
- For the browser, run only the specs you touched **plus the specs that cover the pages, components and server actions you changed**, with `npx playwright test <paths>`. Find them by grepping `tests/e2e` for the route, component or action name; a change to a shared component such as a picker can break specs you never opened.
- Run the whole browser suite locally only when the change touches something every spec depends on: the seed, `playwright/global-setup.ts`, auth, or the shared helpers in `tests/e2e/support`. Otherwise leave it to CI, where the full suite runs as a required check.

Setup and commands: the README's "Tests" and "End-to-End Tests" sections.

# Working in a git worktree

- A new worktree has no `.env` and no `node_modules` (both are gitignored). Run `npm ci` with the Node version in `.nvmrc`; without `.env`, its `prisma generate` needs a placeholder URL, as in CI: `DATABASE_URL_UNPOOLED=postgresql://placeholder@127.0.0.1/placeholder npm ci`. `npm run test:db` and `npm run e2e` then work without `.env`; `npm run dev` needs a copy of the main checkout's.
- Each checkout gets its own e2e and `test:db` containers and ports, so e2e and `test:db` can run at once, in one worktree or in several. If a run fails on a busy port, another worktree has the same slot: set `E2E_SLOT=<n>` (1 to 99) and run again.
- Dev servers in different worktrees share the dev database. If your change touches `prisma/schema.prisma`, give the worktree its own database before you push the schema: see the README, "Two worktrees that change the schema".
