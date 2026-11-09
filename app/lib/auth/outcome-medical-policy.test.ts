import { test } from "node:test";
import assert from "node:assert/strict";
import { canWriteOutcomeMedical } from "./outcome-medical-policy";
import { can } from "./can";
import { AppPermissions } from "./permissions";
import { Role } from "@/prisma/generated/enums";

for (const role of [...Object.values(Role), null, undefined, "unknown"]) {
  test(`outcome clinical policy derives all capabilities for ${role}`, () => {
    const manage = can(role, AppPermissions.OUTCOMES_MANAGE);
    const medical = manage && can(role, AppPermissions.MEDICAL_MANAGE);
    for (const type of ["EUTHANIZED", "DECEASED"] as const) {
      assert.equal(canWriteOutcomeMedical(role, { type, creating: true }), medical);
      assert.equal(canWriteOutcomeMedical(role, { type, linked: true, dayChanges: true }), medical);
      assert.equal(canWriteOutcomeMedical(role, { type, medicalSupplied: true }), medical);
      assert.equal(canWriteOutcomeMedical(role, { type, linked: false, dayChanges: true }), manage);
      assert.equal(canWriteOutcomeMedical(role, { type, linked: true }), manage);
    }
    assert.equal(canWriteOutcomeMedical(role, { type: "TRANSFER_OUT", creating: true }), manage);
  });
}
