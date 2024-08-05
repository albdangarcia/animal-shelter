FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy prisma directory and generate prisma client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy package.json and package-lock.json
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Development image, copy all the files
FROM base AS runner
WORKDIR /app

ENV NODE_ENV development

# Create system group and user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the application
COPY . .

# Set permissions
RUN chown -R nextjs:nodejs /app

# Install wait-for-it
RUN apk add --no-cache bash
RUN wget -O /usr/local/bin/wait-for-it https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh
RUN chmod +x /usr/local/bin/wait-for-it

# Set user to nextjs
USER nextjs

# Expose port 3000
EXPOSE 3000

# Set environment variables
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Command to wait for the PostgreSQL database to be ready, then run Prisma migrations and seed the database, and finally start the application in development mode
CMD wait-for-it postgres:5432 --timeout=30 --strict -- \
    sh -c "npx prisma db push && npx prisma db seed && npm run dev"