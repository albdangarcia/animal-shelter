import type { TransactionClient } from "@/app/lib/prisma";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { lockMedicalItemForUse } from "@/app/lib/services/medical-catalog";
import {
  MedicalEntryRefusal,
  readAnimal,
  scheduleMedicalEntry,
} from "@/app/lib/services/medical-entry";
import { lockMedicalProtocolForUse } from "@/app/lib/services/medical-protocol";
import { dayText } from "@/app/lib/services/medical-entry-text";
import {
  findIntakeProtocols,
  findProtocolRecordFacts,
} from "@/app/lib/data/medical-protocol";
import {
  matchProtocol,
  planProtocol,
  spayNeuterFactsOn,
  type ProtocolPlanProtocol,
  type SkippedProtocolStep,
} from "@/app/lib/utils/medical-protocol-plan";
import {
  notScheduledText,
  protocolTitle,
} from "@/app/lib/utils/medical-protocol-text";
import { stampedAfter } from "@/app/lib/utils/activity-stamp";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import { AnimalActivityType } from "@/prisma/generated/enums";

/**
 * Applying a medical protocol when an animal arrives: the one live protocol
 * that fits its species and its age on the intake day schedules its care, in
 * the intake's transaction. The plan is `planProtocol`'s, the same one the
 * intake forms preview, made from the record as it is behind the animal's
 * lock. Every entry goes through `scheduleMedicalEntry` and its rules, and
 * carries the step that scheduled it. Later changes to the protocol never
 * touch them.
 *
 * The plan leaves out what those rules would refuse (a retired item, a past
 * due day), so a refusal here is a bug: it is thrown, and rolls the intake
 * back with it.
 *
 * Like the entry service, this module has no `next/*` and no auth imports, so
 * the seed and a plain `node:test` can drive it.
 */

export interface AppliedProtocol {
  protocolId: string;
  protocolName: string;
  /** By due day, then by step order. */
  entryIds: string[];
  /** The steps that scheduled nothing, with why, in step order. */
  skipped: SkippedProtocolStep[];
  /** The stamp of its activity row, for a row written after it. */
  loggedAt: Date;
}

/** How many entries a protocol scheduled, as its texts say it. */
const entriesText = (count: number) =>
  count === 0 ? "nothing scheduled" : `${count} ${count === 1 ? "entry" : "entries"} scheduled`;

/**
 * What applying a protocol did, in a sentence: "Puppy protocol: 9 entries
 * scheduled." Said when the intake is saved.
 */
export const protocolAppliedHeadline = (
  applied: Pick<AppliedProtocol, "protocolName" | "entryIds">,
) => `${protocolTitle(applied.protocolName)}: ${entriesText(applied.entryIds.length)}.`;

/**
 * An intake's success message, with what its protocol scheduled when one
 * was applied: "Animal intake created successfully. Puppy protocol: 9
 * entries scheduled."
 */
export const withProtocolHeadline = (
  message: string,
  applied: Pick<AppliedProtocol, "protocolName" | "entryIds"> | null,
) => (applied ? `${message} ${protocolAppliedHeadline(applied)}` : message);

/**
 * Why an intake that leaves out its protocol is refused: only someone who
 * may manage medical care can skip it, and the intake forms offer the choice
 * to them alone.
 */
export const SKIP_PROTOCOL_REFUSAL = "You don't have permission to skip the medical protocol.";

/**
 * The activity row's text: "Puppy protocol applied: 9 entries scheduled, Oct
 * 14, 2026 to Feb 3, 2027. Not scheduled: spay/neuter (sex unknown)."
 */
const appliedText = (
  protocolName: string,
  dueDates: CalendarDay[],
  skipped: SkippedProtocolStep[],
) => {
  const first = dueDates[0];
  const last = dueDates[dueDates.length - 1];
  const when =
    dueDates.length === 0
      ? ""
      : first === last
        ? `, on ${dayText(first)}`
        : `, ${dayText(first)} to ${dayText(last)}`;
  const notScheduled = notScheduledText(skipped);
  return `${protocolTitle(protocolName)} applied: ${entriesText(dueDates.length)}${when}.${
    notScheduled ? ` ${notScheduled}` : ""
  }`;
};

/**
 * The live protocol that fits the animal, locked against changes until the
 * transaction ends, with its live steps as they are behind that lock; or
 * null when none fits. A protocol edited or retired while this waited for
 * its lock is read again, and the animal matched again.
 */
const lockMatchingProtocol = async (
  tx: TransactionClient,
  facts: Parameters<typeof matchProtocol>[1],
): Promise<ProtocolPlanProtocol | null> => {
  let locked: string | null = null;
  for (;;) {
    const protocols = await findIntakeProtocols(tx, { speciesId: facts.speciesId });
    const match = matchProtocol(protocols, facts);
    if (!match || match.id === locked) return match;
    await lockMedicalProtocolForUse(tx, match.id);
    locked = match.id;
  }
};

/**
 * Applies the protocol that fits the animal on `intakeDate`, scheduling its
 * care from `today`. Returns what it wrote, or null when no live protocol
 * fits, having written nothing. One `MEDICAL_PROTOCOL_APPLIED` row names what
 * was scheduled and what wasn't, stamped after `loggedAfter`.
 */
export async function applyIntakeProtocol(
  tx: TransactionClient,
  { animalId, intakeDate }: { animalId: string; intakeDate: CalendarDay },
  actorId: string,
  today: CalendarDay,
  { loggedAfter }: { loggedAfter?: Date | null } = {},
): Promise<AppliedProtocol | null> {
  await lockAnimal(tx, animalId);
  const animal = await readAnimal(tx, animalId);
  if (animal.archived) {
    throw new MedicalEntryRefusal(
      "This animal has left the shelter's care, so nothing can be scheduled for it.",
    );
  }
  const days = { birthDate: animal.birthDate, intakeDate };

  const protocol = await lockMatchingProtocol(tx, { speciesId: animal.speciesId, ...days });
  if (!protocol) return null;

  // Each item is held until commit, so it can't be retired or narrowed
  // between the plan reading it and its entries being written; then the
  // steps are read again, with their items as they are behind those locks.
  const itemIds = [...new Set(protocol.steps.flatMap((step) => step.item?.id ?? []))].sort();
  for (const itemId of itemIds) {
    await lockMedicalItemForUse(tx, itemId);
  }
  const steps =
    itemIds.length === 0
      ? protocol.steps
      : ((await findIntakeProtocols(tx, { speciesId: animal.speciesId })).find(
          (row) => row.id === protocol.id,
        )?.steps ?? protocol.steps);

  const record = await findProtocolRecordFacts(tx, animalId);
  const plan = planProtocol(
    { ...protocol, steps },
    {
      speciesId: animal.speciesId,
      sex: animal.sex,
      ...days,
      ...spayNeuterFactsOn(record.spayNeuterEntries, intakeDate),
      chipped: record.chipped,
      openScheduled: record.openScheduled,
    },
    today,
  );

  const entryIds: string[] = [];
  for (const entry of plan.entries) {
    const { entryId } = await scheduleMedicalEntry(
      tx,
      { animalId, dueDate: entry.dueDate, notes: entry.notes, ...entry.care },
      actorId,
      today,
      { protocolStepId: entry.stepId },
    );
    entryIds.push(entryId);
  }

  const row = await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.MEDICAL_PROTOCOL_APPLIED,
      changedById: actorId,
      changeSummary: appliedText(
        protocol.name,
        plan.entries.map((entry) => entry.dueDate),
        plan.skipped,
      ),
      changedAt: stampedAfter(loggedAfter),
    },
    select: { changedAt: true },
  });

  return {
    protocolId: protocol.id,
    protocolName: protocol.name,
    entryIds,
    skipped: plan.skipped,
    loggedAt: row.changedAt,
  };
}
