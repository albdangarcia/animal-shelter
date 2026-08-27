import dotenv from "dotenv";
import { defineConfig } from "prisma/config";
import { resolveDatabaseUrl } from "./app/lib/db-url";

// db:reset and db have no `dotenv -e ...` npm-script prefix, so this is the
// only place they pick up .env.local / .env.development precedence. Every
// prisma-spawned process (migrate, reset, seed, generate) shares this.
dotenv.config({ path: [".env.local", ".env.development", ".env"], quiet: true });

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: resolveDatabaseUrl("direct"),
  },
});
