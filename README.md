<p align="center">
  <img src="./docs/assets/repoimage.png" alt="Repo Image" />
</p>

<p align="center">
  <b><a href="https://animal-shelter-zeta.vercel.app/">Live Demo</a></b> | 
  <b><a href="#-ai-staff-assistant">AI Assistant</a></b> | 
  <b><a href="#getting-started">Setup</a></b> | 
  <b><a href="contributing.md">Contributing</a></b>
</p>

---

> ### 🚧 Active development — expect breaking changes
>
> This project is still evolving quickly. Despite the `v1.0.0` tag, it has **not** reached a stable API/schema — breaking changes to the database schema, environment variables, and features should be expected between releases until noted otherwise. Pin to a specific tag/commit rather than tracking `main` if you need stability.

An open-source, end-to-end platform for animal shelters and rescue organizations — covering the full animal lifecycle from intake to outcome. A public portal lets adopters browse and apply; a permission-controlled staff dashboard handles day-to-day operations, backed by a built-in AI assistant.

## 🤖 AI Staff Assistant

A chat assistant in the staff dashboard that answers from **live shelter data**.

- **Ask naturally**: "What needs attention today?", "Is Buddy ready for adoption?", "Does Juniper have open tasks?"
- **Grounded, not hallucinated**: every answer comes from a real lookup — animal summaries, adoption-readiness blockers, the attention queue — never invented.
- **Can act, not just answer**: staff can ask it to update a task (e.g. "Mark Daisy's post-op recheck done"), gated behind an approval step before anything changes.
- **Fully auditable**: every AI-initiated change is logged with before/after values and an approval ID, so nothing happens silently.
- **Stateless by design**: nothing is saved between sessions — refreshing clears the conversation.

## Core Features

### Animal Lifecycle Management

- **Intake**: Owner surrenders, strays, and partner transfers, each capturing the relevant origin details.
- **Re-Intake**: A returning animal reactivates its archived profile and keeps its full prior history instead of starting fresh.
- **Outcomes**: Adoptions, transfers, and returns-to-owner are processed atomically — approving one application automatically rejects the animal's other open applications.

### Comprehensive Animal Profiles

- **Core details**: name, species, breed, age, weight, photos, microchip number, and more.
- **Characteristics tagging**: filterable tags (e.g. "Good with Kids," "Heartworm Positive") to help match animals with suitable adopters.
- **Dynamic assessments**: standardized, template-driven evaluations (behavioral, medical intake, etc.) with consistent data capture.
- **Notes & history**: categorized notes plus an automatic log of an animal's status changes and key events.
- **Task management**: create, assign, and track animal-specific tasks with status, priority, and due dates.

### Adoption Application Workflow

- **Public portal**: browse published animals, like favorites, and apply directly.
- **Applicant dashboard**: view, edit, or withdraw an application, or reactivate one if the animal becomes available again.
- **Staff review**: change an application's status with a required reason for a clear audit trail. Approving one reserves the animal and auto-rejects its other open applications; rejecting or withdrawing makes the animal available again automatically. Staff can also add internal notes during review.

### User & Data Integrity

- **Role-based access control**: sensitive actions (updating animal records, managing applications) are gated by a permission system, not just role.
- **Transactional integrity**: multi-step operations like adoption and intake run in database transactions — all steps succeed or none do.
- **Soft deletes**: notes and assessments are archived rather than erased, preserving history for auditing.

## Tech Stack

### Core Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Backend**: [Node.js](https://nodejs.org/)
- **Database**: [PostgreSQL](https://www.postgresql.org/)
- **File Storage**: [Vercel Blob](https://vercel.com/docs/vercel-blob/)
- **ORM**: [Prisma](https://www.prisma.io/)
- **Authentication**: [Better Auth](https://better-auth.com/)

### UI & Styling

- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Component Library**: [shadcn/ui](https://ui.shadcn.com/) (built on [Radix UI](https://www.radix-ui.com/))
- **Forms**: [React Hook Form](https://react-hook-form.com/) with [Zod](https://zod.dev/) for validation
- **Data Visualization**: [Recharts](https://recharts.org/)
- **File Uploads**: [Uppy](https://uppy.io/) with [Vercel Blob](https://vercel.com/storage/blob)
- **Containerization**: [Docker](https://www.docker.com/)

## Environment Variables

Add the following variables to your `.env` file. See `.env.example` for a full reference.

### Authentication

| Variable                     | Required    | Description                                                                                                           |
| ---------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`         | ✅ Required | Signs session cookies. [See generation instructions below.](#generating-better_auth_secret) Use a different value in each environment. |
| `BETTER_AUTH_ALLOWED_HOSTS`  | ✅ Required | Comma-separated allowlist of hosts the app may be served from. The host is read from the incoming request and matched against this list, which is what lets preview deployments work despite changing URLs. Hosts only — no scheme, no path. Supports exact matches, wildcards, and port wildcards (`localhost:*`). |
| `BETTER_AUTH_URL`            | ✅ Required | Fallback base URL, used when a request has no host to derive one from. Full URL with scheme, no trailing slash, and no `/api/auth` suffix — Better Auth appends its own base path. |
| `GITHUB_CLIENT_ID`           | ⚪ Optional | GitHub OAuth client ID, from your [GitHub Developer settings](https://github.com/settings/developers).                |
| `GITHUB_CLIENT_SECRET`       | ⚪ Optional | GitHub OAuth client secret, from your [GitHub Developer settings](https://github.com/settings/developers).            |
| `GOOGLE_CLIENT_ID`           | ⚪ Optional | Google OAuth client ID, from your [Google Cloud Console](https://console.cloud.google.com/apis/credentials).          |
| `GOOGLE_CLIENT_SECRET`       | ⚪ Optional | Google OAuth client secret, from your [Google Cloud Console](https://console.cloud.google.com/apis/credentials).      |
| `ADMIN_PASSWORD`             | ✅ Required | Password for the default admin user, used when seeding the database. Also the password for all other seeded accounts. |

Typical values per environment:

| Environment | `BETTER_AUTH_ALLOWED_HOSTS`                          | `BETTER_AUTH_URL`            |
| ----------- | ---------------------------------------------------- | ---------------------------- |
| Local       | `localhost:*`                                        | `http://localhost:3000`      |
| Preview     | `your-app-*-your-vercel-scope.vercel.app`            | your production URL          |
| Production  | `your-app.vercel.app`                                | `https://your-app.vercel.app`|

> **Keep preview host patterns scoped to your own Vercel team.** A bare `*.vercel.app` would trust every application on the platform, not just yours. Your Vercel scope suffix (visible in any preview URL) is the part nobody else can reproduce.

> **GitHub OAuth callback URL** — register `http://localhost:3000/api/auth/callback/github` on your OAuth App for local development. A GitHub OAuth App accepts only one callback URL, so use a separate OAuth App per environment. Preview deployments get a new URL per deploy, so GitHub sign-in does not work there; email and password sign-in does.

### Database

| Variable                | Required       | Description                                                                                                                                                                                                                                            |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | ✅ Required    | The **pooled** connection the running app uses. Running `npm run dev` directly on your host, point this at `127.0.0.1:5432`. Under `docker compose`, the `nextjs` service overrides this to point at the `postgres` service instead — see Option 1 below. On a provider (Vercel/Neon), use the pooled URL, which carries a `-pooler` suffix in the host. |
| `DATABASE_URL_UNPOOLED` | ✅ Required    | The **direct** connection migrations and seeding require — Prisma Migrate breaks against a PgBouncer transaction-mode pooler. Identical to `DATABASE_URL` for local Postgres, which has no pooler; on a provider, use the direct URL (no `-pooler` suffix). |
| `POSTGRES_USER`         | 🐳 Docker only | PostgreSQL username. Used by Docker Compose to initialize the `postgres` service's container.                                                                                                                                                            |
| `POSTGRES_PASSWORD`     | 🐳 Docker only | PostgreSQL password. Used by Docker Compose to initialize the `postgres` service's container.                                                                                                                                                            |
| `POSTGRES_DB`           | 🐳 Docker only | PostgreSQL database name. Used by Docker Compose to initialize the `postgres` service's container.                                                                                                                                                       |
| `POSTGRES_PORT`         | 🐳 Docker only | Host port the `postgres` service's container publishes to. Change if `5432` is already in use on your machine. Defaults to `5432`.                                                                                                                       |

> **These `POSTGRES_*` rows are the `postgres` Docker image's own initialization variables** — unrelated to the similarly-named `POSTGRES_*` family Vercel's Neon integration injects (`POSTGRES_URL`, `POSTGRES_DATABASE`, etc.). They merely rhyme: Neon injects `POSTGRES_DATABASE`, but the Docker `postgres` image's contract wants `POSTGRES_DB`. This confusion between the two unrelated families is what produced the original, since-removed resolver fallback chain — don't reintroduce it.

### Storage

| Variable                | Required    | Description                                                      |
| ----------------------- | ----------- | ---------------------------------------------------------------- |
| `BLOB_READ_WRITE_TOKEN` | ✅ Required | Read/write token for Vercel Blob Storage (stores animal images). |

### Shelter settings

The `shelter_settings` row with id `shelter` holds the timezone, weight unit
system, and default phone country. Seeding creates it if missing. Changes to
that row take effect on the next request without a rebuild. Changing the default
phone country also rebuilds existing phone search indexes before the next
indexed phone lookup. If the row is
missing, the server uses these environment values, then their defaults:

| Variable | Default |
| --- | --- |
| `SHELTER_TIMEZONE` | `America/New_York` |
| `WEIGHT_UNIT_SYSTEM` | `metric` |
| `DEFAULT_PHONE_COUNTRY` | `US` |

### AI Staff Chat

| Variable                       | Required    | Description                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GROQ_API_KEY`                 | ⚪ Optional | API key for the AI staff chat provider (`@ai-sdk/groq`). Get one from [console.groq.com/keys](https://console.groq.com/keys). Unset ⇒ the chat feature is unavailable.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `AI_PROVIDER_TIER`             | ⚪ Optional | `free` (default, and unset), `paid`, or `free-synthetic`. Free provider tiers retain prompts and tool results for training/human review, so on `free` the provider module refuses to start unless `DATABASE_URL` points at a local/private database — derived from the URL, the only path that verifies anything. `paid` (a key whose traffic is not retained) allows any database. `free-synthetic` allows a networked database on the operator's word that it holds only seeded data; nothing verifies it, so set it only on a demo deployment. |

### Seeding

| Variable              | Required    | Description                                                                                                                                                                                                    |
| ---------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEV_LINK_TEST_EMAIL` | ⚪ Optional | Local development only. When set, gives one seeded walk-in person this email address, so signing in with an OAuth account whose verified email matches will exercise the account-to-person linking rule. Leave unset in any shared or deployed environment. |
| `SEED_RANDOM_SEED` | ⚪ Optional | Seeds the PRNG the seed script uses, so the same value produces the same fixture data on every run — which is what stops e2e specs from depending on a lucky draw. Defaults to a fixed value, so leave it unset for reproducible seeding; set it only to deliberately generate a different, still-reproducible dataset. Dates still anchor to the current date, so runs on different days differ regardless. |

### Generating `BETTER_AUTH_SECRET`

Run the following command to generate a secure secret key:

```bash
openssl rand -base64 32
```

Run it once per environment. A session cookie signed with one secret is valid anywhere that secret is used, so sharing a value between preview and production means a preview deployment can mint a valid production session.

- **macOS / Linux** — OpenSSL is usually pre-installed. Verify with `openssl version`.
- **Windows** — Install via the [OpenSSL website](https://www.openssl.org/) or Chocolatey: `choco install openssl`.

## Admin Dashboard Access

These credentials are created when you seed the database (`npx prisma db seed`, or `npm run db:reset` to reset and reseed in one step).

Sign-in supports email and password as well as GitHub OAuth. There is no self-serve registration — application accounts are created by seeding, or on first sign-in with GitHub.

### Admin

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Email    | `admin@example.com`                                        |
| Password | The value you set for `ADMIN_PASSWORD` in your `.env` file |

### Other Seeded Accounts

All non-admin accounts use the same password as `ADMIN_PASSWORD`.

| Email                      | Name            | Role      |
| -------------------------- | --------------- | --------- |
| `staff1@example.com`       | Olivia Chen     | Staff     |
| `staff2@example.com`       | Benjamin Carter | Staff     |
| `surrenderer1@example.com` | Jane Doe        | User      |
| `finder1@example.com`      | John Smith      | User      |
| `volunteer1@example.com`   | Sam Rivera      | Volunteer |

> **Live demo password:** `7dJbys5@?tMA`

## Getting Started

To run this project, you will need to have the following installed:

- [Node.js](https://nodejs.org/) (v22.22 or later — see `engines` in `package.json`)
- [Docker](https://www.docker.com/) and Docker Compose
- A free [Vercel](https://vercel.com/) account to use Vercel Blob for image storage.

### 1\. Initial Configuration

First, clone the repository and set up your environment variables.

1.  Clone the repository:

```sh
    git clone https://github.com/albdangarcia/animal-shelter.git
    cd animal-shelter
```

2.  Create your local environment file:

```sh
    cp .env.example .env
```

3.  **Fill out the `.env` file**:
    - `DATABASE_URL` and `DATABASE_URL_UNPOOLED` are already set to matching local values in `.env.example`, which work as-is for both the Docker setup and a host-run `npm run dev` (see Option 1 below).
    - Set `ADMIN_PASSWORD` to a password of your choice. This will be the password for all seeded accounts.
    - Generate a `BETTER_AUTH_SECRET` by running `openssl rand -base64 32`.
    - Set `BETTER_AUTH_URL` to `http://localhost:3000` and leave `BETTER_AUTH_ALLOWED_HOSTS` as `localhost:*`.
    - Log into your Vercel account, create a new Blob store, and get your `BLOB_READ_WRITE_TOKEN`. **This is required for all image upload/delete functionality.**

## Running the App

You have two main options for running the application, depending on your goal.

### Option 1: Recommended Local Development (Docker)

This is the fastest way for contributors to get the application running on their local machine. This setup uses **Docker** to run the Next.js app and a PostgreSQL container, but still connects to **Vercel Blob** for image storage.

This is a local-dev/demo image, not a production build: it runs `next dev` under `NODE_ENV=development`, the same as running the app on your host.

1.  Build and run the Docker containers:

    ```sh
    docker compose build
    docker compose up
    ```

2.  Open your browser and navigate to `http://localhost:3000`.

If port `5432` is already in use on your machine (e.g. by a local Postgres install), set `POSTGRES_PORT` in `.env` to a free port before running `docker compose up` — the `postgres` container's own `5432` inside the Docker network is unaffected, only the host-side publish changes.

**What happens on start:** the `postgres` container initializes (if its named volume is new) and must report healthy before `nextjs` starts. `nextjs` then runs `prisma db push` unconditionally (idempotent — safe to run on every start) and seeds the database **only if it's empty** (checked with a row count against the `animals` table), so restarting the stack never wipes data you've created through the app.

**Resetting to a clean, reseeded database:**

```sh
docker compose down -v
docker compose up -d
```

`-v` drops the named Postgres volume, so the next `up` starts from an empty database and seeds it from scratch.

> #### ⚠️ **A Note on Local Image Seeding**
>
> The database seeding script (`npx prisma db seed`) will populate the database with sample animals whose images are served from the local `/public` folder. This is done to provide a quick visual setup without requiring you to upload dozens of images manually.
>
> - **Functionality:** You can view these seeded animals perfectly.
> - **Limitation:** You **cannot delete** a seeded animal's image through the dashboard, as it only exists locally and not in your Vercel Blob store. Any **new animals and images you create** through the application UI will be uploaded to Vercel Blob correctly and will be fully manageable.

### Option 2: Deploying on Vercel (Fully Serverless)

This method mirrors the live production environment. It's ideal for testing the full serverless architecture or deploying your own version of the platform.

1.  **Fork the Repository** on GitHub.
2.  **Create a New Vercel Project** and connect it to your forked repository.
3.  **Set up Vercel Integrations**:
    - Add the **Vercel Postgres** integration to create a serverless database.
    - Add the **Vercel Blob** integration for image storage.
4.  **Connect Environment Variables**: the Vercel Postgres (Neon) integration provides several `POSTGRES_*` variables, but the app reads `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) — set both explicitly, per environment scope (Production and Preview each need their own). **Give Preview its own Neon branch**, rather than pointing it at the Production database: Preview and Production previously shared one database, which meant every preview migration was also a production migration. Copy the remaining variables from your `.env` file into the **Environment Variables** section of your Vercel project settings.
5.  **Set the auth variables per environment scope.** `BETTER_AUTH_SECRET` needs its own value in Production and in Preview — see the table in [Environment Variables](#environment-variables) for `BETTER_AUTH_ALLOWED_HOSTS` and `BETTER_AUTH_URL`. Preview deployments get a new URL per deploy, which is why the allowlist is a pattern rather than a single URL.
6.  **GitHub sign-in needs its own OAuth App per environment**, with that environment's `/api/auth/callback/github` registered on it. It will not work on preview deployments, since their URLs change per deploy; email and password sign-in is unaffected.
7.  **Deploy**: Trigger a new deployment on Vercel. Your application will be live.

## Tests

| Command | What it runs | Database |
|---|---|---|
| `npm test` | Unit tests (`app/**/*.test.ts`) via `node:test` | None |
| `npm run test:db` | Prisma query-extension tests (`prisma/**/*.test.ts`) via `node:test` | Throwaway `docker-compose.playwright.yml` container on port 55432 — **never** the dev database |
| `npm run test:all` | `npm test` then `npm run test:db` | As above |
| `npm run e2e` | Playwright suite (see [End-to-End Tests](#end-to-end-tests)) | Same throwaway container, reset and seeded |

`npm run test:db` (`scripts/test-db.ts`) needs Docker with `docker compose` — the same requirement as `npm run e2e`. It brings the container up (idempotent), runs `prisma db push`, then the tests, and leaves the container running;
`npm run e2e`'s teardown removes it. Set `PLAYWRIGHT_DATABASE_URL` to point the tests somewhere else. CI runs the equivalent steps directly in the `e2e` job.

## End-to-End Tests

Playwright is configured for a Chromium-only E2E workflow that mirrors the local Prisma setup without reusing your normal development database.

### What the Playwright setup does

- Starts an isolated PostgreSQL container from `docker-compose.playwright.yml`
- Overrides only auth/database-related environment variables for the E2E process
- Resets the database schema, runs `prisma db push`, and seeds data with `prisma/seed.ts`
- Starts the Next.js app on `http://127.0.0.1:3001`
- Runs a login smoke test using the seeded admin account (`admin@example.com`)

### Requirements

- Docker with `docker compose`
- A populated `.env` file with at least `BETTER_AUTH_SECRET` and `ADMIN_PASSWORD` (these are the only vars `playwright/env.ts` throws on; it pins everything else it needs — `BETTER_AUTH_URL`, `BETTER_AUTH_ALLOWED_HOSTS`, the database URLs, and the OAuth vars — so don't re-add them here)

### Install the browser once

```sh
npm run e2e:install
```

### Run the E2E suite

```sh
npm run e2e
```

Optional local variants:

```sh
npm run e2e:headed
npm run e2e:ui
```

## Credits

Credit for the royalty-free images used in this project is given below:

- **All pet images:** from [Unsplash](https://unsplash.com/) (used under the [Unsplash License](https://unsplash.com/license)), [Pixabay](https://pixabay.com/), and [Pexels](https://www.pexels.com/)
