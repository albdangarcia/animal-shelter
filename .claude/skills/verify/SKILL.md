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
  (`passwordToHash = "7dJbys5@?tMA"` — check the file, it may change).
- Seed source of truth for a given person's original field values (name/phone/address/
  etc.) is the `peopleData` array in `prisma/seed.ts` — use it to restore a Person row
  after a test mutates it via a form that syncs back to `Person` (e.g. the foster/
  adoption application actions do this).

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
`next.config.js` first.

## Logging in as a test user without fighting the UI

The `/sign-in` page's credentials form can be flaky to drive via Playwright (timing
around the NextAuth server action). It's more reliable to authenticate via the API and
inject the session cookie directly:

```bash
CSRF=$(curl -s -c cookies.txt http://localhost:3000/api/auth/csrf | node -pe 'JSON.parse(require("fs").readFileSync(0)).csrfToken' 2>/dev/null)
# or parse the curl output directly
curl -s -i -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/auth/callback/credentials \
  --data-urlencode "email=<user>@example.com" \
  --data-urlencode "password=<password>" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "callbackUrl=http://localhost:3000" \
  --data-urlencode "json=true"
# grabs a Set-Cookie: authjs.session-token=... — inject that into Playwright via
# context.addCookies([{ name: "authjs.session-token", value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }])
```

This exercises the same NextAuth Credentials backend as the UI, so it's not a bypass of
app logic — just a more reliable way to get an authenticated Playwright context.

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

## Cleaning up after a UI-driven write

Several action flows in this app sync form data back onto the `Person` row (e.g.
foster/adoption applications overwrite `name`/`phone`/`address`/`city`/`state`/
`zipCode` on submit). If you drive a real submission against seeded data, restore the
mutated `Person` fields from `prisma/seed.ts`'s `peopleData` afterward, and delete any
application/profile rows your test created, so the local dev DB stays representative of
a fresh seed.
