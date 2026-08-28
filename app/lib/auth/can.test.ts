import { test } from "node:test";
import assert from "node:assert/strict";
import { Role } from "@/prisma/generated/enums";
import { can } from "./can";
import { AppPermissions } from "./permissions";

test("a role holds a permission listed for it", () => {
  assert.equal(can(Role.STAFF, AppPermissions.ANIMAL_TASK_MANAGE), true);
});

test("a role does not hold a permission absent from its list", () => {
  assert.equal(can(Role.VOLUNTEER, AppPermissions.ANIMAL_TASK_MANAGE), false);
});

test("USER holds none of the operational permissions", () => {
  const operational = [
    AppPermissions.ANIMAL_INFO_READ,
    AppPermissions.ANIMAL_TASK_READ,
    AppPermissions.ANIMAL_TASK_MANAGE,
    AppPermissions.ANIMAL_INFO_MANAGE,
    AppPermissions.ANIMAL_VITALS_MANAGE,
    AppPermissions.REPORTS_READ,
  ];

  for (const permission of operational) {
    assert.equal(can(Role.USER, permission), false);
  }
});

test("inheritance holds — a USER permission is present for every higher role", () => {
  for (const role of [Role.VOLUNTEER, Role.STAFF, Role.ADMIN]) {
    assert.equal(can(role, AppPermissions.MY_PROFILE_UPDATE), true);
  }
});

test("ADMIN holds every permission in AppPermissions", () => {
  for (const permission of Object.values(AppPermissions)) {
    assert.equal(can(Role.ADMIN, permission), true);
  }
});

test("the documented volunteer exception: VOLUNTEER holds ANIMAL_VITALS_MANAGE", () => {
  assert.equal(can(Role.VOLUNTEER, AppPermissions.ANIMAL_VITALS_MANAGE), true);
  // ...and it is genuinely an exception: no other MANAGE permission leaks to it.
  assert.equal(can(Role.VOLUNTEER, AppPermissions.ANIMAL_INFO_MANAGE), false);
  assert.equal(can(Role.VOLUNTEER, AppPermissions.ANIMAL_NOTE_MANAGE), false);
});

test("an unknown role string returns false rather than throwing", () => {
  assert.equal(can("SUPERUSER", AppPermissions.ANIMAL_INFO_READ), false);
  assert.equal(can("", AppPermissions.ANIMAL_INFO_READ), false);
});

test("null and undefined return false rather than throwing", () => {
  assert.equal(can(null, AppPermissions.ANIMAL_INFO_READ), false);
  assert.equal(can(undefined, AppPermissions.ANIMAL_INFO_READ), false);
});
