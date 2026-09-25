// Shared by the DB tests of every writer that touches an animal's listing, an
// intake or an outcome. Whatever such a writer did, it must leave the listing
// and the timeline agreeing about whether the animal is here; asserting that
// after each success, and after each refusal, catches a new path that makes
// them disagree the day it is written. Not a test file, so `npm run test:db`
// does not run it.
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import { AnimalListingStatus } from "@/prisma/generated/enums";
import { findListingMismatch } from "@/app/lib/utils/stay-utils";
import { calendarDay } from "@/app/lib/utils/shelter-day";

/**
 * What the animal's stored listing and its stored timeline say, as the
 * mismatch check reads them: every intake, and every outcome that has not been
 * reversed, since a reversed one records a departure that never happened.
 */
export const readListingMismatch = async (animalId: string) => {
  const animal = await prisma.animal.findUniqueOrThrow({
    where: { id: animalId },
    select: {
      listingStatus: true,
      intake: { select: { id: true, intakeDate: true } },
      Outcome: {
        where: { reversedAt: null },
        select: { id: true, outcomeDate: true },
      },
    },
  });
  return findListingMismatch(
    [
      ...animal.intake.map((intake) => ({
        kind: "intake" as const,
        date: calendarDay(intake.intakeDate),
        ref: intake.id,
      })),
      ...animal.Outcome.map((outcome) => ({
        kind: "outcome" as const,
        date: calendarDay(outcome.outcomeDate),
        ref: outcome.id,
      })),
    ],
    animal.listingStatus === AnimalListingStatus.ARCHIVED,
  );
};

export const assertNoListingMismatch = async (animalId: string) => {
  assert.equal(
    await readListingMismatch(animalId),
    null,
    "The animal's listing and its timeline disagree about whether it is here.",
  );
};
