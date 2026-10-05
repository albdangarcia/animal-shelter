import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

// Component tests run in real Chromium (Vitest browser mode), in the shelter's
// zone, as the browser specs do: DayField reads and writes local dates, so the
// zone decides which day a click picks.
const SHELTER_ZONE = process.env.SHELTER_TIMEZONE || "America/New_York";

export default defineConfig({
  // The app builds with reactCompiler: true (next.config.ts), so the
  // components under test run through the same compiler.
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  resolve: { tsconfigPaths: true },
  // next/link reads process.env.__NEXT_* when it loads, and a browser has no
  // process. This is a fixed stand-in, replaced at build time: a widget that
  // reads any other process.env value gets undefined here.
  define: { "process.env": JSON.stringify({ NODE_ENV: "test" }) },
  test: {
    // .test.tsx only: `npm test` (node:test) owns app/**/*.test.ts.
    include: ["components/**/*.test.tsx", "app/**/*.test.tsx"],
    setupFiles: ["vitest.setup.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ contextOptions: { timezoneId: SHELTER_ZONE } }),
      instances: [{ browser: "chromium" }],
    },
  },
});
