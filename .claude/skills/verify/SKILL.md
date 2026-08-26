---
name: verify
description: How to boot this app locally and drive it end-to-end for verification (not unit tests).
---

# Verifying changes in animal-shelter

## Environment

- Local Postgres runs in a long-lived docker container (`some-postgres`, port 5432)
  independent of the Playwright e2e docker-compose stack. Check `docker ps` — if it's
  up, `.env`'s `DATABASE_URL` already points at it and `npm run dev` works with no
  extra setup.
- `npx dotenv -e .env -- prisma migrate status` to confirm the schema is current before
  assuming seed data matches the code.
- Seed data: `admin@example.com` uses `ADMIN_PASSWORD` from `.env`. Every other seeded
  user (`staff1@`, `staff2@`, `volunteer1@`, `surrenderer1@`, `finder1@example.com`,
  etc.) shares the hardcoded fallback password in `prisma/seed.ts`
  (`password = "7dJbys5@?tMA"` — check the file, it may change).
- Seed source of truth for a given person's original field values (name/phone/address/
  etc.) is the `personData` array in `prisma/seed.ts` — use it to restore a Person row
  after a test mutates it via a form that syncs back to `Person` (e.g. the foster/
  adoption application actions do this).

## E2E database isolation (do not break this)

`npm run e2e` must use the docker-compose container on port 55432, never the dev
database. Verify from the setup log:

- **Correct:** `Datasource "db": ... at "127.0.0.1:55432"` followed by
  `🚀 Your database is now in sync with your Prisma schema`.
- **Wrong:** `The database is already in sync with the Prisma schema` immediately after
  `DROP SCHEMA / CREATE SCHEMA`. That is impossible for a freshly-wiped database and
  means Prisma connected somewhere else — historically the dev database, which the
  seed then overwrote with 150 animals.

All three call sites (`app/lib/prisma.ts`, `prisma.config.ts`, `prisma/seed.ts`)
resolve their connection string through `resolveDatabaseUrl(mode, env)` in
`app/lib/db-url.ts`. Do not reintroduce a local `??` chain in any of them.

- `PLAYWRIGHT_DATABASE_URL` wins in both modes. `playwright/env.ts` is the only thing
  that sets it, which is how the harness overrides deterministically without depending
  on `POSTGRES_URL` being absent.
- The `"pooled"` and `"direct"` modes are **not** interchangeable. The running app
  needs the Neon pooler; migrations and seeding need a direct (unpooled) connection.
  Collapsing them would hand production an unpooled URL.

Covered by `node --import tsx --test app/lib/db-url.test.ts` — no database or container
required, so prefer it over re-running the suite with a dirty `.env` to check
precedence.

`prisma.config.ts` imports `db-url` by **relative path** (`./app/lib/db-url`), not the
`@/` alias. Prisma's config loader does not resolve tsconfig path aliases the way `tsx`
does, and using `@/` there breaks `prisma generate` entirely.

## Booting the app

```bash
npm run dev -- --port 3000   # or any port; run in background, tee to a log file
```

**Use `http://localhost:3000`, not `127.0.0.1`.** Next.js 16 dev's cross-origin
protection blocks HMR/RSC requests from `127.0.0.1` by default, which silently kills
client-side hydration — forms then fall back to native `<form>` GET submissions
(you'll see `GET /some-page?field=value&...` in the server log instead of a POST/server
action). It looks like a client validation bug but it's just the dev server refusing
the origin. If you ever need a non-default host, add it to `allowedDevOrigins` in
`next.config.ts` first.

Confirmed on Next 16.3.1 — browsing `127.0.0.1:3000` against a default-bound dev server
logs, for every chunk and for `/_next/hmr`:

```
⚠ Blocked cross-origin request to Next.js dev resource /_next/hmr from "127.0.0.1".
```

and a sign-in submit becomes `GET /sign-in?email=...&password=...`. **Treat a
`GET` with credentials in the query string as a signal to stop and fix the origin**,
not as a form bug — it puts the password in the URL, the server log, and browser
history in plaintext.

The Playwright harness is exempt: `playwright.config.ts` starts the dev server with
`--hostname 127.0.0.1` and sets `baseURL` to `http://127.0.0.1:3001`, so both sides
agree on the origin and nothing is blocked. This only bites manual dev runs.

## Logging in as a test user without fighting the UI

`login.spec.ts` has been stable since S5 of the Better Auth migration, so there's no
flakiness to work around — but it's still often more convenient to authenticate via the
API and inject the session cookie directly than to drive the form:

```bash
curl -s -i -c cookies.txt -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"<user>@example.com","password":"<password>"}'
# grabs a Set-Cookie: better-auth.session_token=<token>.<signature>; ...
# inject the *full* value (token + signature, exactly as sent — better-auth verifies
# the signature, so a truncated or re-derived value fails closed) into Playwright via
# context.addCookies([{ name: "better-auth.session_token", value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }])
```

Verified against a running `next dev` (2026-08-25): no CSRF token or prior `GET` is
needed — the endpoint takes a plain JSON `POST` and returns `200` with the cookie on the
first request. A follow-up `GET /dashboard` with that cookie returns `200`; the same
request without it returns `307` to `/sign-in`.

This exercises the same Better Auth credential backend as the UI, so it's not a bypass of
app logic — just a more reliable way to get an authenticated Playwright context.

## Auth layout

Better Auth, three files, one shared config (migration doc D6):

- `auth.options.ts` — shared options, Prisma client **injected** as a parameter, no
  plugins. Holds `prismaAdapter`, `emailAndPassword.enabled: true`, `socialProviders`
  (github, google), `user.additionalFields` (`personId`, `role`, both `input: false`),
  and `databaseHooks.user.create.before` → `linkOrCreatePerson`. Signature is
  `authOptions(db, opts?: { trustProvidedEmails?: boolean })`.
- `auth.ts` — the app instance. Spreads `authOptions(prisma)` (the pooled client), adds
  `emailAndPassword.disableSignUp: true`, and `plugins: [nextCookies()]`. **`nextCookies()`
  must be last in the array** — without it, sign-in through a server action creates the
  session row but never sets the browser cookie, and the user appears logged out with no
  error anywhere (H5).
- `prisma/seed.ts` — its own `seedAuth` instance on the **direct** client, with
  `disableSignUp: false`, `autoSignIn: false`, and `trustProvidedEmails: true`.

Do not merge these or import the app's `auth` into the seed. The split is load-bearing:
`nextCookies()` would reach for `next/headers` outside a request context in the seed,
`autoSignIn: false` stops a junk session row per seeded user, the app and seed use
different Prisma clients (pooled vs. direct), and the trust flag is what makes the
linking rule safe.

`emailAndPassword.enabled: true` powers credential **sign-in** and must stay on. There
is no sign-up form and `disableSignUp: true` keeps registration off; credential users
exist only because the seed creates them. Since the linking-trust refactor,
`disableSignUp` is a product decision, not a security control — the linking rule no
longer depends on it.

**Deleted in S5 and no longer present: `auth.config.ts` and `proxy.ts`.** There is no
middleware or proxy layer in this app at all. Do not recreate one, and do not look for
an edge-safe config split — that was the Auth.js v5 pattern. Real authorization lives
in page/layout guards and in `protectedAction`.

Session reads go through `getCachedSession()` in `app/lib/auth/session.ts` — a zero-arg
React `cache()` wrapper around `auth.api.getSession({ headers: await headers() })`.
`withAuthenticatedUser` and `hasPermission` both call it, so a whole render converges on
one session read (D5a). **`auth()` is not callable** — that was next-auth. Sessions are
DB-backed with no `cookieCache`, deliberately: roles stay always-fresh and a demotion
takes effect on the next request (D5).

The session user type is `SessionUser` from `app/lib/auth/session.types.ts` (types only,
safe for client components). `personId` on it is `string`, not nullable — `User.personId`
is a real NOT NULL column.

Better Auth is mounted at `app/api/auth/[...all]/route.ts` via `toNextJsHandler`. The
session cookie is `better-auth.session_token`.

`app/dashboard/layout.tsx` redirects logged-out visitors with an explicit **relative**
`callbackUrl`. Keep it relative — an absolute one reintroduces a host mismatch between
`127.0.0.1` and `localhost`, and an origin-only callback drops the destination path so
users land on the public homepage after signing in.

Note the layout hardcodes `/dashboard` as the callback, so a logged-out visitor to a deep
link like `/dashboard/animals/123` still lands on `/dashboard` after signing in. Known and
accepted.

## Driving the UI

Playwright + Chromium is already installed in `node_modules`/the Playwright browser
cache (`~/Library/Caches/ms-playwright`), independent of the `tests/e2e` docker-compose
harness. For a quick one-off verification script (not a committed e2e test), write a
`.mjs` file **inside the repo root** (Node's ESM resolver needs `node_modules` on a
parent path — a script under `/tmp` or a scratch dir won't resolve `@playwright/test`)
and `import { chromium } from "@playwright/test"`. Delete the scratch script when done;
don't commit it.

Shadcn/Radix `<Select>` components: if the field's current value doesn't match any
`<SelectItem value=...>` exactly, the trigger renders **blank** (no placeholder, no
label) instead of showing the placeholder — this is a real recurring footgun in this
codebase, not just a test-authoring issue. Don't assume a blank-looking select means an
empty/invalid value; check the underlying form value or DB row before concluding a
field is unset. `getByLabel(...)` still works for these via the shadcn Form
label/id wiring even when the trigger text is blank.

Most selects in this codebase derive their options from enums (`value={...}`), so they
can't drift. The only hardcoded string literals are the `"true"`/`"false"` Yes/No pairs
in `household-profile-form.tsx` and `foster-capability-form-fields.tsx`, plus the
`"90d"`/`"30d"`/`"7d"` range picker in `chart-area-interactive.tsx`. The Yes/No selects
were checked against a real record — editing and saving both values renders the correct
label, so the string/boolean conversion is handled and there is no live bug there. The
warning above still applies to any *new* select wired to a raw string literal, and to
legacy rows whose stored value predates the current option list.

### Expected noise, not bugs

A logged-out request to `/dashboard` logs three `Access Denied. You do not have
permission to perform this action.` errors from `protected-actions.ts` — one each from
`SectionCards`, `ChartWrapper`, and `AnalyticsTables` — immediately before
`GET /dashboard 307`. Each guarded component calls `protectedAction` independently and
React renders them concurrently, so all three throw before the layout's `redirect()`
lands. Authorization held; the 307 is the proof. It's one message per guarded
component, not per request. Don't try to silence it, and don't read it as a permissions
bug.

## Cleaning up after a UI-driven write

Several action flows in this app sync form data back onto the `Person` row (e.g.
foster/adoption applications overwrite `name`/`phone`/`address`/`city`/`state`/
`zipCode` on submit). If you drive a real submission against seeded data, restore the
mutated `Person` fields from `prisma/seed.ts`'s `personData` afterward, and delete any
application/profile rows your test created, so the local dev DB stays representative of
a fresh seed.