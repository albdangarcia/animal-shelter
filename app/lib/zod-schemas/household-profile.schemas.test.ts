import { test } from "node:test";
import assert from "node:assert/strict";
import { LivingSituation } from "@/prisma/generated/enums";
import {
  HouseholdFieldsSchema,
  toHouseholdData,
  type HouseholdFieldsInput,
} from "./household-profile.schemas";

const baseInput: HouseholdFieldsInput = {
  livingSituation: LivingSituation.OWN_HOME,
  hasYard: "true",
  householdSize: 3,
  hasChildren: "true",
  childrenAges: "4, 10",
  otherAnimalsDescription: "",
  animalExperience: "Grew up with dogs.",
};

const issuesFor = (input: HouseholdFieldsInput, path: string) => {
  const result = HouseholdFieldsSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.filter((issue) => issue.path.join(".") === path);
};

test("household: No with ages left over from a profile is accepted and stores no ages", () => {
  // Every form hides Children's Ages unless the answer is Yes, and the hidden
  // field keeps its prefilled value. A refusal here fell on a field nobody
  // could see, so Submit silently did nothing.
  const result = HouseholdFieldsSchema.safeParse({
    ...baseInput,
    hasChildren: "false",
    childrenAges: "10",
  });
  assert.equal(result.success, true);

  const data = toHouseholdData(result.data!);
  assert.equal(data.hasChildren, false);
  assert.deepEqual(data.childrenAges, []);
});

test("household: Yes without ages is still refused on Children's Ages", () => {
  const issues = issuesFor(
    { ...baseInput, hasChildren: "true", childrenAges: "  " },
    "childrenAges",
  );
  assert.deepEqual(
    issues.map((issue) => issue.message),
    ["Please provide the ages of the children if 'Yes' is selected."],
  );
});

test("household: Yes with ages stores them as numbers", () => {
  const result = HouseholdFieldsSchema.safeParse(baseInput);
  assert.equal(result.success, true);
  assert.deepEqual(toHouseholdData(result.data!).childrenAges, [4, 10]);
});

test("household: a non-renter's leftover landlord answer is stored as null", () => {
  // The landlord question is hidden too unless the household rents.
  const result = HouseholdFieldsSchema.safeParse({
    ...baseInput,
    livingSituation: LivingSituation.OWN_HOME,
    landlordPermission: "true",
  });
  assert.equal(result.success, true);
  assert.equal(toHouseholdData(result.data!).landlordPermission, null);
});

test("household: a renter without a landlord answer is refused", () => {
  const issues = issuesFor(
    { ...baseInput, livingSituation: LivingSituation.RENT_APARTMENT },
    "landlordPermission",
  );
  assert.equal(issues.length, 1);
});
