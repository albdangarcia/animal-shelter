import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  AnimalEditFormSchema,
  CreateAnimalFormSchema,
} from "./animal.schemas";
import {
  AnimalHealthStatus,
  AnimalListingStatus,
  IntakeType,
  Sex,
} from "@/prisma/generated/enums";

const baseInput = {
  animalName: "Biscuit",
  species: "cmtn2bxpz00gancgsd6hyf79q",
  breed: "cmtn2bxpz00gancgsd6hyf79r",
  primaryColor: "cmtn2bxpz00gancgsd6hyf79s",
  additionalColors: [],
  sex: Sex.FEMALE,
  estimatedBirthDate: "2024-01-01",
  healthStatus: AnimalHealthStatus.AWAITING_VET_EXAM,
  listingStatus: AnimalListingStatus.DRAFT as AnimalListingStatus,
  heightCm: null,
  weightGrams: null,
  isSpayedNeutered: false,
  intakeType: IntakeType.SEIZE,
  intakeDate: "2026-01-01",
};

test("CreateAnimalFormSchema: a new animal can be a draft or published", () => {
  for (const listingStatus of [
    AnimalListingStatus.DRAFT,
    AnimalListingStatus.PUBLISHED,
  ]) {
    const result = CreateAnimalFormSchema.safeParse({
      ...baseInput,
      listingStatus,
    });
    assert.equal(result.success, true, listingStatus);
  }
});

test("CreateAnimalFormSchema: a new animal cannot be archived or pending adoption", () => {
  // The form only offers the two above, but the action takes whatever the
  // schema lets through. An animal created ARCHIVED has an intake and no
  // outcome, so the timeline says it is here and the listing says it left.
  for (const listingStatus of [
    AnimalListingStatus.ARCHIVED,
    AnimalListingStatus.PENDING_ADOPTION,
  ]) {
    const result = CreateAnimalFormSchema.safeParse({
      ...baseInput,
      listingStatus,
    });
    assert.equal(result.success, false, listingStatus);
    if (result.success) continue;
    assert.deepEqual(z.flattenError(result.error).fieldErrors.listingStatus, [
      "A new animal can only be a draft or published.",
    ]);
  }
});

test("CreateAnimalFormSchema: a missing listing status still asks for one", () => {
  const { listingStatus: _omitted, ...withoutListing } = baseInput;
  const result = CreateAnimalFormSchema.safeParse(withoutListing);
  assert.equal(result.success, false);
  if (result.success) return;
  assert.deepEqual(z.flattenError(result.error).fieldErrors.listingStatus, [
    "Listing status is required.",
  ]);
});

test("AnimalEditFormSchema: the edit form still resubmits a locked listing", () => {
  // Only creation is restricted. An archived or pending animal's edit form
  // sends its listing back unchanged, and that has to keep parsing.
  const { intakeType: _t, intakeDate: _d, weightGrams: _w, ...editInput } =
    baseInput;
  for (const listingStatus of [
    AnimalListingStatus.ARCHIVED,
    AnimalListingStatus.PENDING_ADOPTION,
  ]) {
    const result = AnimalEditFormSchema.safeParse({
      ...editInput,
      listingStatus,
    });
    assert.equal(result.success, true, listingStatus);
  }
});
