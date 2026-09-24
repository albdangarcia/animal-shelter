import type { TransactionClient } from "@/app/lib/prisma";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { checkTimelineChange } from "@/app/lib/data/animal-timeline.data";
import { AnimalActivityType, IntakeType } from "@/prisma/generated/enums";
import { NotFoundError } from "@/app/lib/utils/errors";
import {
  calendarDay,
  formatShelterDay,
  parseCalendarDay,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import type { IntakeCorrectionFormOutput } from "@/app/lib/zod-schemas/intake.schema";

/**
 * Correcting a detail of an intake that was recorded wrong: the day, the type,
 * who surrendered the animal or which partner sent it, where a stray was
 * found, or the notes. The arrival happened; one of its details was typed
 * wrong. The row is edited in place and an INTAKE_CORRECTED row, naming every
 * column that moved and what it held before, explains the change. The
 * INTAKE_PROCESSED row written at the time is left as it was: it records what
 * was entered then.
 *
 * The animal and who recorded the intake are not correctable. A different
 * animal arriving is a different event, and the recorder is a fact the system
 * captured from the session, not something staff typed.
 *
 * Unlike an outcome, an intake's type can be corrected in place. An outcome's
 * type carries the adoption link to the winning application, the archive
 * reason and per-type fields, and retyping one would have to rewire all of
 * that. An intake's type carries only its own per-type fields (the partner of
 * a transfer, the person of a surrender, the address of a stray): no other row
 * links to an intake by its type and the archive reason is not derived from
 * it. Its per-type count in the intake report moves, but moving that figure is
 * the point of the correction, and reversing and re-recording the intake would
 * move it by exactly as much. So the type is corrected here, with the new
 * type's fields required by the schema and the other types' fields cleared.
 *
 * Like `outcome-reversal`, this module has no `next/*` and no auth imports, so
 * a plain `node:test` can drive it. It runs inside the caller's
 * `prisma.$transaction`.
 */

/** The correctable columns of an intake, as they are stored. */
export interface IntakeCorrectionValues {
  intakeDate: CalendarDay;
  type: IntakeType;
  notes: string | null;
  sourcePartnerId: string | null;
  surrenderingPersonId: string | null;
  foundAddress: string | null;
  foundCity: string | null;
  foundState: string | null;
}

export type IntakeCorrection =
  | { status: "corrected"; animalId: string; changeSummary: string }
  | { status: "unchanged"; animalId: string }
  /** The new day would break the animal's timeline, or is in the future. */
  | { status: "refused"; animalId: string; message: string };

/**
 * The columns a validated submission writes. An untouched optional field
 * arrives as "", which is stored as null. A field that belongs to another type
 * is stored as null too, the way the create paths leave it unset, so a former
 * stray's found address does not survive a correction to owner surrender.
 */
export const toIntakeCorrectionValues = (
  data: IntakeCorrectionFormOutput,
): IntakeCorrectionValues => {
  const type = data.intakeType;
  const isStray = type === IntakeType.STRAY;
  return {
    intakeDate: data.intakeDate,
    type,
    notes: data.notes || null,
    sourcePartnerId:
      type === IntakeType.TRANSFER_IN ? data.sourcePartnerId || null : null,
    surrenderingPersonId:
      type === IntakeType.OWNER_SURRENDER
        ? data.surrenderingPersonId || null
        : null,
    foundAddress: isStray ? data.foundAddress || null : null,
    foundCity: isStray ? data.foundCity || null : null,
    foundState: isStray ? data.foundState || null : null,
  };
};

const humanise = (type: IntakeType) => type.replace(/_/g, " ").toLowerCase();

// The stray columns no form writes. They are not correctable, but they belong
// to a stray like the found address does, so a correction to another type
// clears them with it, and says so.
type UnexposedStrayColumns = {
  dateLost: string | null;
  foundZipCode: string | null;
  foundByPersonId: string | null;
};

type IntakeColumns = IntakeCorrectionValues & UnexposedStrayColumns;

// "a", "a and b", "a, b and c".
const joinList = (items: string[]) =>
  items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

// Names the columns that differ between the stored intake and the corrected
// one, in the register of the other activity summaries, with what each held
// before, so the old value is not lost. Returns null when nothing differs, so
// the caller can skip the write and the log row together. Partner and person
// ids are resolved to names; the notes themselves are not echoed, since they
// can be long and the intake still holds them.
//
// A column emptied because the new type does not carry it reads as cleared
// rather than as changed to "none", so the summary says why it moved.
const describeIntakeCorrection = async (
  tx: TransactionClient,
  before: IntakeColumns,
  after: IntakeColumns,
): Promise<string | null> => {
  const changes: string[] = [];
  const fromTo = (label: string, from: string | null, to: string | null) =>
    `the ${label} changed from ${from ?? "none"} to ${to ?? "none"}`;

  if (before.intakeDate !== after.intakeDate) {
    changes.push(
      fromTo(
        "date",
        formatShelterDay(before.intakeDate),
        formatShelterDay(after.intakeDate),
      ),
    );
  }

  if (before.type !== after.type) {
    changes.push(fromTo("type", humanise(before.type), humanise(after.type)));
  }

  if (before.sourcePartnerId !== after.sourcePartnerId) {
    const ids = [before.sourcePartnerId, after.sourcePartnerId].filter(
      (id): id is string => !!id,
    );
    const partners = await tx.partner.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameOf = (id: string | null) =>
      partners.find((partner) => partner.id === id)?.name ?? null;
    changes.push(
      after.type !== IntakeType.TRANSFER_IN
        ? `the source partner was cleared (was ${nameOf(before.sourcePartnerId) ?? "none"})`
        : fromTo(
            "source partner",
            nameOf(before.sourcePartnerId),
            nameOf(after.sourcePartnerId),
          ),
    );
  }

  const personIds = [
    before.surrenderingPersonId,
    after.surrenderingPersonId,
    before.foundByPersonId,
  ].filter((id): id is string => !!id);
  const people =
    before.surrenderingPersonId !== after.surrenderingPersonId ||
    before.foundByPersonId !== after.foundByPersonId
      ? await tx.person.findMany({
          where: { id: { in: personIds } },
          select: { id: true, name: true },
        })
      : [];
  const personName = (id: string | null) =>
    people.find((person) => person.id === id)?.name ?? null;

  if (before.surrenderingPersonId !== after.surrenderingPersonId) {
    changes.push(
      after.type !== IntakeType.OWNER_SURRENDER
        ? `the surrendering person was cleared (was ${personName(before.surrenderingPersonId) ?? "none"})`
        : fromTo(
            "surrendering person",
            personName(before.surrenderingPersonId),
            personName(after.surrenderingPersonId),
          ),
    );
  }

  const foundFields = [
    ["address", "foundAddress"],
    ["city", "foundCity"],
    ["state", "foundState"],
    ["zip code", "foundZipCode"],
  ] as const;
  if (after.type === IntakeType.STRAY) {
    // The zip code is not correctable, so for a stray it never differs.
    for (const [label, key] of foundFields) {
      if (before[key] !== after[key]) {
        changes.push(fromTo(`found ${label}`, before[key], after[key]));
      }
    }
  } else {
    // All of these describe one place, so clearing them is one clause, naming
    // only the columns that held something.
    const cleared = foundFields.filter(([, key]) => before[key] !== null);
    if (cleared.length > 0) {
      const labels = joinList(cleared.map(([label]) => label));
      const values = cleared.map(([, key]) => before[key]).join(", ");
      changes.push(
        cleared.length === 1
          ? `the found ${labels} was cleared (was ${values})`
          : `the found ${labels} were cleared (were ${values})`,
      );
    }
  }

  if (before.dateLost !== after.dateLost) {
    const day = before.dateLost && parseCalendarDay(before.dateLost);
    changes.push(
      `the date lost was cleared (was ${day ? formatShelterDay(day) : before.dateLost})`,
    );
  }

  if (before.foundByPersonId !== after.foundByPersonId) {
    changes.push(
      `the person who found the animal was cleared (was ${personName(before.foundByPersonId) ?? "none"})`,
    );
  }

  if (before.notes !== after.notes) {
    changes.push(
      !before.notes
        ? "notes were added"
        : !after.notes
          ? "notes were removed"
          : "notes were edited",
    );
  }

  return changes.length > 0
    ? `Intake was corrected: ${changes.join("; ")}.`
    : null;
};

// A stored "" is read as empty, the same way `toIntakeCorrectionValues` reads
// a submitted one. Without this, an untouched blank field would compare as
// changed, and a blank a type change clears would compare as unchanged.
const blankToNull = (value: string | null) => value || null;

/**
 * Corrects one intake, and logs the correction against its animal.
 *
 * A save that changes nothing writes neither. A new day is checked against the
 * animal's other intakes and outcomes (`checkTimelineChange`) and refused when
 * it would put them out of order; a correction that leaves the day alone never
 * moves an event, so it is not checked. Because an accepted day keeps the
 * timeline as well formed as it was, whether the animal is in care does not
 * change, and neither does its listing status.
 *
 * Two corrections of the same intake at once both land, the later one on top.
 * Each logs its own row, so neither is lost from the history.
 */
export async function recordIntakeCorrection(
  tx: TransactionClient,
  intakeId: string,
  next: IntakeCorrectionValues,
  changedById: string,
): Promise<IntakeCorrection> {
  // An intake's animal is never corrected, so it can be read before the lock.
  const located = await tx.intake.findUnique({
    where: { id: intakeId },
    select: { animalId: true },
  });
  if (!located) {
    throw new NotFoundError("Error: Intake record not found.");
  }
  const { animalId } = located;

  // Held until commit, so the other events the new day is checked against are
  // still the animal's when it is written. Recording or reversing an outcome
  // holds the same row.
  await lockAnimal(tx, animalId);

  const stored = await tx.intake.findUniqueOrThrow({
    where: { id: intakeId },
    select: {
      intakeDate: true,
      type: true,
      notes: true,
      sourcePartnerId: true,
      surrenderingPersonId: true,
      foundAddress: true,
      foundCity: true,
      foundState: true,
      dateLost: true,
      foundZipCode: true,
      foundByPersonId: true,
    },
  });
  const before: IntakeColumns = {
    intakeDate: calendarDay(stored.intakeDate),
    type: stored.type,
    notes: blankToNull(stored.notes),
    sourcePartnerId: stored.sourcePartnerId,
    surrenderingPersonId: stored.surrenderingPersonId,
    foundAddress: blankToNull(stored.foundAddress),
    foundCity: blankToNull(stored.foundCity),
    foundState: blankToNull(stored.foundState),
    dateLost: blankToNull(stored.dateLost),
    foundZipCode: blankToNull(stored.foundZipCode),
    foundByPersonId: stored.foundByPersonId,
  };
  const isStray = next.type === IntakeType.STRAY;
  const after: IntakeColumns = {
    ...next,
    dateLost: isStray ? before.dateLost : null,
    foundZipCode: isStray ? before.foundZipCode : null,
    foundByPersonId: isStray ? before.foundByPersonId : null,
  };

  // Re-picking the day already on record submits the same day back, so it
  // compares equal and is not logged. The picker cannot express anything
  // finer than a day, which is what makes the comparison exact.
  const changeSummary = await describeIntakeCorrection(tx, before, after);
  if (!changeSummary) {
    return { status: "unchanged", animalId };
  }

  if (before.intakeDate !== after.intakeDate) {
    const refusal = await checkTimelineChange(tx, animalId, {
      kind: "moveIntake",
      intakeId,
      day: after.intakeDate,
    });
    if (refusal) {
      return { status: "refused", animalId, message: refusal };
    }
  }

  // A weigh-in recorded when the animal was created is dated to the start of
  // its intake day, and is deliberately left where it is when that day is
  // corrected. It is its own record, of a weigh-in, with its own edit path.
  await tx.intake.update({ where: { id: intakeId }, data: after });

  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.INTAKE_CORRECTED,
      changedById,
      changeSummary,
    },
  });

  return { status: "corrected", animalId, changeSummary };
}
