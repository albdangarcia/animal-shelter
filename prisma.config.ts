import dotenv from "dotenv";
import { defineConfig } from "prisma/config";
import { resolveDatabaseUrl } from "./app/lib/db-url";

// db:reset and db have no `dotenv run -f ...` npm-script prefix, so this is the
// only place they pick up .env.local / .env.development precedence. Every
// prisma-spawned process (migrate, reset, seed, generate) shares this.
//
// The list keeps all three here, unlike the `dotenv run -f` scripts in
// package.json, which name `.env` alone. Not an oversight: the library call
// below reports a missing file and carries on, so layering costs nothing,
// while the CLI treats one as fatal and would break every clone that followed
// the README (which creates `.env` and nothing else).
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
