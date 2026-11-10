// The guides this server serves, read from docs/guides/ once per process.
//
// No auth and no next/* imports. The folder ships with the routes that read
// it through `outputFileTracingIncludes` in next.config.ts: keep the path
// here and the glob there in step.
import path from "node:path";
import { loadGuides, type Guide } from "./guides";

export const GUIDES_DIR = path.join(process.cwd(), "docs", "guides");

let cached: Promise<Guide[]> | undefined;

/**
 * Every guide, parsed and validated. Parsed once per server process, except
 * under `next dev`, where an author's edit shows on the next request. A
 * failed load isn't kept, so the next request tries again.
 */
export function getGuides(): Promise<Guide[]> {
  if (process.env.NODE_ENV === "development") return loadGuides(GUIDES_DIR);
  cached ??= loadGuides(GUIDES_DIR).catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}
