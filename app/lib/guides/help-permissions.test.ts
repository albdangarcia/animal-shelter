import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { HELP_PERMISSIONS } from "@/components/dashboard/nav/nav-links.config";
import { loadGuides } from "./guides";
import { PAGE_HELP_GUIDES } from "./help-paths";
import { permissionsShowingGuides } from "./visibility";

const guidesDir = path.join(process.cwd(), "docs/guides");

test("the Help entry is offered on exactly the permissions that show a guide", async () => {
  const guides = await loadGuides(guidesDir);
  const shown = new Set(permissionsShowingGuides(guides));
  const offered = new Set(HELP_PERMISSIONS);

  const unreachable = [...shown].filter((permission) => !offered.has(permission));
  const empty = [...offered].filter((permission) => !shown.has(permission));
  assert.deepEqual(
    unreachable,
    [],
    "a guide lists a permission HELP_PERMISSIONS (nav-links.config.ts) leaves out, " +
      "so readers holding only it get no Help entry",
  );
  assert.deepEqual(
    empty,
    [],
    "HELP_PERMISSIONS offers Help on a permission no guide lists, so those " +
      "readers would open an empty Help page",
  );
});

test("every page's \"?\" link names a guide", async () => {
  const slugs = new Set((await loadGuides(guidesDir)).map((guide) => guide.slug));
  for (const [page, slug] of Object.entries(PAGE_HELP_GUIDES)) {
    assert.ok(slugs.has(slug), `${page}: "${slug}" is not a guide in docs/guides`);
  }
});
