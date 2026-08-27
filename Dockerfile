FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json* ./

# --ignore-scripts skips postinstall's `prisma generate`, which needs
# app/lib/db-url.ts — not copied into this stage. Keeping this layer keyed on
# only the lockfile (not app code or prisma/) is what makes it cache well.
# Generation happens in the runner stage instead, once the full source is in.
# This also skips @prisma/engines' postinstall — if the container ever fails
# with a missing engine binary after a dependency bump, suspect this first.
RUN npm ci --ignore-scripts

# Development image, copy all the files
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=development

# Create system group and user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# WORKDIR created /app as root; COPY --chown below only chowns what it
# copies in, not the /app entry itself, so without this nextjs can't create
# new top-level paths (e.g. next dev's own .next/dev). Non-recursive, so it
# doesn't reintroduce the full-tree walk COPY --chown avoids.
RUN chown nextjs:nodejs /app

# Copy node_modules from deps stage
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy the rest of the application, owned by the runtime user directly —
# avoids a second full-tree walk via `chown -R`.
COPY --chown=nextjs:nodejs . .

# Used only for `prisma generate` below, which never connects — a dummy value
# is fine, but direct mode throws if DATABASE_URL_UNPOOLED is absent.
ARG DATABASE_URL=postgresql://postgres:mysecretpassword@postgres:5432/postgres
ARG DATABASE_URL_UNPOOLED=postgresql://postgres:mysecretpassword@postgres:5432/postgres
ENV DATABASE_URL=$DATABASE_URL
ENV DATABASE_URL_UNPOOLED=$DATABASE_URL_UNPOOLED
RUN npx prisma generate

RUN chmod +x /app/docker-entrypoint.sh

# Set user to nextjs
USER nextjs

# Expose port 3000
EXPOSE 3000

# Set environment variables
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Push the schema (idempotent), seed only if the database is empty, then
# start the dev server. Waiting for Postgres to be reachable is handled by
# compose's healthcheck-gated depends_on, not here.
CMD ["./docker-entrypoint.sh"]