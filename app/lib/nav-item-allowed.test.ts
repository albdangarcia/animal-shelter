import { test } from "node:test";
import assert from "node:assert/strict";
import { AppPermissions, type AppPermission } from "@/app/lib/auth/permissions";
import { navMainItems } from "@/components/dashboard/nav/nav-links.config";
import { READINESS_READ_PERMISSIONS } from "@/app/lib/readiness/permissions";
import { navItemAllowed } from "./nav-item-allowed";

const holding = (...held: AppPermission[]) => {
  const set = new Set(held);
  return (permission: AppPermission) => set.has(permission);
};

const { ANIMAL_INFO_READ, MEDICAL_READ, PERSONS_READ } = AppPermissions;

test("an entry with allPermissions shows only when every one is held", async () => {
  const item = { allPermissions: [ANIMAL_INFO_READ, MEDICAL_READ] };
  assert.equal(await navItemAllowed(item, holding(ANIMAL_INFO_READ, MEDICAL_READ)), true);
  assert.equal(await navItemAllowed(item, holding(ANIMAL_INFO_READ)), false);
  assert.equal(await navItemAllowed(item, holding(MEDICAL_READ)), false);
  assert.equal(await navItemAllowed(item, holding()), false);
});

test("anyPermissions wins when an entry also sets allPermissions", async () => {
  const item = {
    anyPermissions: [PERSONS_READ],
    allPermissions: [ANIMAL_INFO_READ, MEDICAL_READ],
  };
  assert.equal(await navItemAllowed(item, holding(PERSONS_READ)), true);
  assert.equal(await navItemAllowed(item, holding(ANIMAL_INFO_READ, MEDICAL_READ)), false);
});

test("allPermissions wins over the single permission", async () => {
  const item = { permission: PERSONS_READ, allPermissions: [ANIMAL_INFO_READ] };
  assert.equal(await navItemAllowed(item, holding(PERSONS_READ)), false);
  assert.equal(await navItemAllowed(item, holding(ANIMAL_INFO_READ)), true);
});

test("an empty allPermissions falls back to the single permission", async () => {
  const item = { permission: PERSONS_READ, allPermissions: [] };
  assert.equal(await navItemAllowed(item, holding()), false);
  assert.equal(await navItemAllowed(item, holding(PERSONS_READ)), true);
});

test("an entry with no permissions is shown to everyone", async () => {
  assert.equal(await navItemAllowed({}, holding()), true);
});

test("the Readiness Board entry needs every readiness read, not just assessments", async () => {
  const entry = navMainItems.find((item) => item.url === "/dashboard/readiness");
  assert.ok(entry);
  assert.equal(
    await navItemAllowed(entry, holding(AppPermissions.ANIMAL_ASSESSMENT_READ)),
    false,
  );
  for (const missing of READINESS_READ_PERMISSIONS) {
    const rest = READINESS_READ_PERMISSIONS.filter((p) => p !== missing);
    assert.equal(await navItemAllowed(entry, holding(...rest)), false, `without ${missing}`);
  }
  assert.equal(await navItemAllowed(entry, holding(...READINESS_READ_PERMISSIONS)), true);
});
