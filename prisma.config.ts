import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
	schema: "./prisma/schema.prisma",
	migrations: {
		path: "./prisma/migrations",
		seed: "tsx prisma/seed.ts",
	},
	datasource: {
			url: `${process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? env("DATABASE_URL")}`,
	},
});