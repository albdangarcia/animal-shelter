import { test } from "node:test";
import assert from "node:assert/strict";
import { AppPermissions } from "@/app/lib/auth/permissions";
import type { Guide } from "./guides";
import {
  findVisibleGuide,
  heldGuidePermissions,
  helpLinkGuide,
  permissionsShowingGuides,
  sortByTitle,
  visibleGuides,
  visibleRelated,
} from "./visibility";

function guide(slug: string, overrides: Partial<Guide> = {}): Guide {
  return {
    slug,
    title: slug,
    summary: slug,
    permissions: ["MEDICAL_READ"],
    aliases: [],
    related: [],
    verified: "2026-11-09",
    body: "Steps.",
    ...overrides,
  };
}

const read = guide("read", { permissions: ["MEDICAL_READ"] });
const both = guide("both", { permissions: ["MEDICAL_MANAGE", "MEDICAL_ADMINISTER"] });
const foster = guide("foster", { permissions: ["MY_FOSTER_ANIMALS_CARE"] });
const all = [read, both, foster];

const slugs = (guides: Guide[]) => guides.map((g) => g.slug);

test("a reader sees a guide when they hold any one of its permissions", () => {
  assert.deepEqual(slugs(visibleGuides(all, [AppPermissions.MEDICAL_ADMINISTER])), ["both"]);
  assert.deepEqual(slugs(visibleGuides(all, [AppPermissions.MEDICAL_MANAGE])), ["both"]);
  assert.deepEqual(
    slugs(visibleGuides(all, [AppPermissions.MEDICAL_READ, AppPermissions.MY_FOSTER_ANIMALS_CARE])),
    ["read", "foster"],
  );
});

test("a reader holding none of a guide's permissions doesn't see it", () => {
  assert.deepEqual(slugs(visibleGuides(all, [])), []);
  // A permission no guide lists shows nothing either.
  assert.deepEqual(slugs(visibleGuides(all, [AppPermissions.ANIMAL_INFO_READ])), []);
});

test("a guide the reader can't see isn't found by its slug", () => {
  const visible = visibleGuides(all, [AppPermissions.MY_FOSTER_ANIMALS_CARE]);
  assert.equal(findVisibleGuide(visible, "foster")?.slug, "foster");
  assert.equal(findVisibleGuide(visible, "read"), undefined);
  assert.equal(findVisibleGuide(visible, "no-such-guide"), undefined);
});

test("related shows only the related guides the reader can see, in the guide's order", () => {
  const withRelated = guide("main", {
    permissions: ["MEDICAL_READ"],
    related: ["foster", "both", "read"],
  });
  const guides = [withRelated, ...all];

  const volunteer = visibleGuides(guides, [
    AppPermissions.MEDICAL_READ,
    AppPermissions.MY_FOSTER_ANIMALS_CARE,
  ]);
  assert.deepEqual(slugs(visibleRelated(withRelated, volunteer)), ["foster", "read"]);

  const staff = visibleGuides(guides, Object.values(AppPermissions));
  assert.deepEqual(slugs(visibleRelated(withRelated, staff)), ["foster", "both", "read"]);
});

test("the permissions that show a guide are the union of every guide's, as values", () => {
  assert.deepEqual(new Set(permissionsShowingGuides(all)), new Set([
    AppPermissions.MEDICAL_READ,
    AppPermissions.MEDICAL_MANAGE,
    AppPermissions.MEDICAL_ADMINISTER,
    AppPermissions.MY_FOSTER_ANIMALS_CARE,
  ]));
});

test("held permissions ask the check about each guide permission once", async () => {
  const asked: string[] = [];
  const held = await heldGuidePermissions(all, async (permission) => {
    asked.push(permission);
    return permission === AppPermissions.MEDICAL_MANAGE;
  });
  assert.deepEqual(held, [AppPermissions.MEDICAL_MANAGE]);
  assert.equal(asked.length, 4);
  assert.equal(new Set(asked).size, 4);
});

test("a page's \"?\" link gets the guide's slug and title only when the reader can see it", async () => {
  const volunteer = async () => visibleGuides(all, [AppPermissions.MEDICAL_READ]);
  assert.deepEqual(await helpLinkGuide(volunteer, "read"), { slug: "read", title: "read" });
  assert.equal(await helpLinkGuide(volunteer, "both"), null);
  assert.equal(await helpLinkGuide(volunteer, "no-such-guide"), null);
});

test("guides that fail to load give no \"?\" link, and report the error, instead of failing the page", async () => {
  const errors: unknown[] = [];
  const failure = new Error("docs/guides is missing");
  const link = await helpLinkGuide(
    async () => {
      throw failure;
    },
    "read",
    (error) => errors.push(error),
  );
  assert.equal(link, null);
  assert.deepEqual(errors, [failure]);

  // A loader that throws before it returns a promise is caught too.
  const syncErrors: unknown[] = [];
  const syncFailure = new Error("thrown at once");
  const syncLink = await helpLinkGuide(
    () => {
      throw syncFailure;
    },
    "read",
    (error) => syncErrors.push(error),
  );
  assert.equal(syncLink, null);
  assert.deepEqual(syncErrors, [syncFailure]);
});

test("an error the onError rethrows reaches the page, as Next's own errors must", async () => {
  const signal = new Error("NEXT_REDIRECT");
  await assert.rejects(
    helpLinkGuide(
      async () => {
        throw signal;
      },
      "read",
      (error) => {
        throw error;
      },
    ),
    signal,
  );
});

test("guides sort by title, ignoring case", () => {
  const sorted = sortByTitle([
    guide("b", { title: "record an exam" }),
    guide("a", { title: "Glossary" }),
    guide("c", { title: "Print a certificate" }),
  ]);
  assert.deepEqual(sorted.map((g) => g.title), ["Glossary", "Print a certificate", "record an exam"]);
});
