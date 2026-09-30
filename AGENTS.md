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
| a user cannot finish a task, or a page is not wired to the rule | browser | `tests/e2e/**` | `npm run e2e` |

There is no component-test layer yet, so widget behaviour (pickers, dialogs, filter controls) stays in the browser for now.

**A browser test is for what only a browser can show:** a whole journey; that a refusal reaches the screen; who sees which actions; redirects and sign-in; layout; time zones.

**For a new server rule**, write database tests for every case, plus at most one browser test showing it on screen. The model to copy is outcome reversal: `prisma/outcome-reversal.test.ts` covers every rule (refusals, locks, units, listings, applications), and `tests/e2e/animals/outcome-reversal.spec.ts` has two journeys.

These rules are for new tests. Do not delete or move existing browser tests as a side effect of other work.

## Running tests locally

- Run the unit and database tests freely.
- For the browser, run only the specs you touched **plus the specs that cover the pages, components and server actions you changed**, with `npx playwright test <paths>`. Find them by grepping `tests/e2e` for the route, component or action name; a change to a shared component such as a picker can break specs you never opened.
- Run the whole browser suite locally only when the change touches something every spec depends on: the seed, `playwright/global-setup.ts`, auth, or the shared helpers in `tests/e2e/support`. Otherwise leave it to CI, where the full suite runs as a required check.
- The local e2e run and `npm run test:db` share one Docker container and fixed ports, so do not start either while another worktree is running one.

Setup and commands: the README's "Tests" and "End-to-End Tests" sections.
