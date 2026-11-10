import { randomUUID } from "node:crypto";
import type { TransactionClient } from "@/app/lib/prisma";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { findOpenScheduledEntryIdsByItem } from "@/app/lib/data/animals/medical-entry";
import {
  MedicalEntryKind,
  MedicalEntrySource,
} from "@/prisma/generated/enums";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "@/app/lib/utils/errors";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import {
  MAX_BATCH_SIZE,
  type CatalogEntryKind,
} from "@/app/lib/constants/medical";
import {
  MedicalEntryRefusal,
  checkOutsideVetNamed,
  recordMedicalEntry,
  recordScheduledMedicalEntry,
  scheduleMedicalEntry,
  type MedicalBatchTag,
  type ScheduleNextInput,
  type TreatmentEntryInput,
  type VaccineEntryInput,
} from "@/app/lib/services/medical-entry";

/**
 * The same vaccine or treatment for several animals at once: given to a
 * litter or a room, or scheduled for them. Each animal gets its own entry,
 * written by the single-entry functions in `medical-entry`, so every rule,
 * event and activity row is the one a single entry gets. The entries share a
 * `batchId`, which is provenance only.
 *
 * A batch is all-or-nothing. Every animal is tried; if any is refused,
 * nothing is written, and one `MedicalBatchRefusal` names each refused
 * animal and why, so the form can show them all at once rather than one per
 * submit.
 *
 * Tests aren't batched: their results differ from animal to animal.
 *
 * Like `medical-entry`, this module has **no `next/*` and no auth imports**,
 * so the seed and database tests can drive it. It runs inside the caller's
 * `prisma.$transaction`.
 */

/** One animal a batch couldn't write for, and why. */
export interface MedicalBatchAnimalRefusal {
  animalId: string;
  animalName: string;
  /** The scheduled entry, when recording scheduled care. */
  entryId?: string;
  message: string;
}

/** Every animal a batch was refused for. Nothing was written. `message`
 * replaces the summary, for a batch whose refusals aren't one per animal. */
export class MedicalBatchRefusal extends PreconditionFailedError {
  readonly refusals: MedicalBatchAnimalRefusal[];

  constructor(refusals: MedicalBatchAnimalRefusal[], message?: string) {
    super(
      message ??
        (refusals.length === 1
          ? `Nothing was saved: ${refusals[0].animalName} was refused.`
          : `Nothing was saved: ${refusals.length} animals were refused.`),
    );
    this.name = "MedicalBatchRefusal";
    this.refusals = refusals;
  }
}

/** Where a batch's rabies vaccine leaves each animal's own tag number. */
type WithoutTag<T> = Omit<T, "rabiesTagNumber">;

/** Care given in a batch: the shared values, with no item-free fields. */
export type MedicalBatchGiven =
  | WithoutTag<VaccineEntryInput>
  | TreatmentEntryInput;

export type MedicalBatchInput =
  | {
      mode: "RECORD";
      /** Each animal, with its own rabies tag when the vaccine is rabies. */
      animals: { animalId: string; rabiesTagNumber?: string | null }[];
      entry: MedicalBatchGiven;
      /** The next dose, for every animal that doesn't have one planned. */
      scheduleNext?: ScheduleNextInput | null;
    }
  | {
      mode: "SCHEDULE";
      animals: { animalId: string }[];
      entry: {
        kind: CatalogEntryKind;
        itemId: string;
        dueDate: CalendarDay;
        notes?: string | null;
      };
    };

/** What care given to scheduled entries shares: everything but the item. */
export type MedicalScheduledBatchGiven =
  | Omit<WithoutTag<VaccineEntryInput>, "itemId">
  | Omit<TreatmentEntryInput, "itemId">;

export interface MedicalScheduledBatchInput {
  /** Each entry, with its animal's own rabies tag when the vaccine is rabies. */
  entries: { entryId: string; rabiesTagNumber?: string | null }[];
  details: MedicalScheduledBatchGiven;
  /** The next dose, for every animal that doesn't have another planned. */
  scheduleNext?: ScheduleNextInput | null;
}

export interface MedicalBatchResult {
  batchId: string;
  entries: { animalId: string; entryId: string; nextEntryId: string | null }[];
}

const BATCH_KINDS: readonly MedicalEntryKind[] = [
  MedicalEntryKind.VACCINE,
  MedicalEntryKind.TREATMENT,
];

const checkKind = (kind: MedicalEntryKind) => {
  if (!BATCH_KINDS.includes(kind)) {
    throw new MedicalEntryRefusal(
      kind === MedicalEntryKind.TEST
        ? "Tests aren't recorded in a batch, since each animal has its own results. Record them one at a time."
        : "Only vaccines and treatments are recorded in a batch. Record anything else one at a time.",
      "kind",
    );
  }
};

const checkSize = (ids: string[], field: string) => {
  if (ids.length === 0) {
    throw new MedicalEntryRefusal("Pick at least one animal.", field);
  }
  if (ids.length > MAX_BATCH_SIZE) {
    throw new MedicalEntryRefusal(
      `A batch can cover at most ${MAX_BATCH_SIZE} animals. Split it into smaller batches.`,
      field,
    );
  }
  if (new Set(ids).size !== ids.length) {
    throw new MedicalEntryRefusal("An animal is listed more than once.", field);
  }
};

const checkTags = (
  kind: MedicalEntryKind,
  tags: (string | null | undefined)[],
  field: string,
) => {
  if (kind !== MedicalEntryKind.VACCINE && tags.some((tag) => tag?.trim())) {
    throw new MedicalEntryRefusal(
      "Only a rabies vaccine has a tag number.",
      field,
    );
  }
};

/**
 * Locks every animal in ascending id order, so two batches over the same
 * animals take their locks in the same order and can't deadlock. The
 * single-entry functions take each lock again, which a transaction that
 * holds it passes straight through.
 */
const lockAnimals = async (tx: TransactionClient, animalIds: string[]) => {
  for (const animalId of [...new Set(animalIds)].sort()) {
    await lockAnimal(tx, animalId);
  }
};

/** A refusal one animal's entry can meet, as opposed to a failure. */
const isRefusal = (error: unknown): error is Error =>
  error instanceof PreconditionFailedError ||
  error instanceof ConflictError ||
  error instanceof NotFoundError;

/**
 * Runs `write` for each animal in turn, collecting refusals instead of
 * stopping at the first. Any refusal undoes the lot: the batch throws, and
 * the caller's transaction rolls back whatever the animals before it wrote.
 * Anything that isn't a refusal is thrown at once.
 */
const writeEach = async <
  T extends { animalId: string; animalName: string; entryId?: string },
  R,
>(
  subjects: T[],
  write: (subject: T) => Promise<R>,
): Promise<R[]> => {
  const written: R[] = [];
  const refusals: MedicalBatchAnimalRefusal[] = [];
  for (const subject of subjects) {
    try {
      written.push(await write(subject));
    } catch (error) {
      if (!isRefusal(error)) throw error;
      refusals.push({
        animalId: subject.animalId,
        animalName: subject.animalName,
        ...(subject.entryId && { entryId: subject.entryId }),
        message: error.message,
      });
    }
  }
  if (refusals.length > 0) {
    throw new MedicalBatchRefusal(refusals);
  }
  return written;
};

/** Whether the animal has an open scheduled entry for the item, other than
 * `except`: then its next dose is already planned. */
const hasOtherOpen = async (
  tx: TransactionClient,
  animalId: string,
  itemId: string,
  except?: string,
) =>
  ((await findOpenScheduledEntryIdsByItem(tx, animalId)).get(itemId) ?? []).some(
    (id) => id !== except,
  );

/**
 * Gives, or schedules, one vaccine or treatment for every animal listed.
 *
 * Given care follows the single-entry rules for each animal, with one
 * difference: a batch is care given together at one time, so it is given in
 * house or by an outside vet, never before intake. A rabies vaccine shares
 * its duration, and each animal carries its own optional tag. With
 * `scheduleNext`, every animal that doesn't already have the item scheduled
 * gets its next dose on that day; one that has it is left as it is, as the
 * single form doesn't offer the next dose then.
 */
export async function recordMedicalBatch(
  tx: TransactionClient,
  input: MedicalBatchInput,
  actorId: string,
  today: CalendarDay,
): Promise<MedicalBatchResult> {
  const animalIds = input.animals.map((animal) => animal.animalId);
  checkSize(animalIds, "animals");
  checkKind(input.entry.kind);
  if (input.mode === "RECORD") {
    checkTags(
      input.entry.kind,
      input.animals.map((animal) => animal.rabiesTagNumber),
      "animals",
    );
    if (input.entry.source === MedicalEntrySource.BEFORE_INTAKE) {
      throw new MedicalEntryRefusal(
        "Care given in a batch is given in house or by an outside vet, not before intake.",
        "source",
      );
    }
    // The vet is shared, so it is refused once, on its field, rather than
    // once for every animal.
    checkOutsideVetNamed(input.entry.source, input.entry.vetPartnerId, input.entry.vetName);
  }

  await lockAnimals(tx, animalIds);
  const names = await readAnimalNames(tx, animalIds);
  const batch: MedicalBatchTag = { batchId: randomUUID(), size: animalIds.length };

  const entries = await writeEach(
    input.animals.map((animal) => ({
      animalId: animal.animalId,
      animalName: names.get(animal.animalId) ?? "An animal",
      rabiesTagNumber:
        "rabiesTagNumber" in animal ? (animal.rabiesTagNumber ?? null) : null,
    })),
    async (animal) => {
      if (!names.has(animal.animalId)) {
        throw new NotFoundError("Animal not found.");
      }
      if (input.mode === "SCHEDULE") {
        const { entryId } = await scheduleMedicalEntry(
          tx,
          { ...input.entry, animalId: animal.animalId },
          actorId,
          today,
          { batch },
        );
        return { animalId: animal.animalId, entryId, nextEntryId: null };
      }
      const planned =
        !!input.scheduleNext &&
        (await hasOtherOpen(tx, animal.animalId, input.entry.itemId));
      const { entryId, nextEntryId } = await recordMedicalEntry(
        tx,
        {
          ...input.entry,
          ...(input.entry.kind === MedicalEntryKind.VACCINE && {
            rabiesTagNumber: animal.rabiesTagNumber,
          }),
          animalId: animal.animalId,
          scheduleNext: planned ? null : input.scheduleNext,
        } as Parameters<typeof recordMedicalEntry>[1],
        actorId,
        today,
        { batch },
      );
      return { animalId: animal.animalId, entryId, nextEntryId };
    },
  );

  return { batchId: batch.batchId, entries };
}

/**
 * Records several scheduled entries as given, with the same details. They
 * must all be for one item, so one lot, dose and route fit them all; each
 * keeps its item, and a rabies vaccine's animals each carry their own tag.
 *
 * Notes left empty keep the notes each entry was scheduled with; notes given
 * replace them on every entry. With `scheduleNext`, each animal that has no
 * other open entry for the item gets its next dose on that day.
 */
export async function recordScheduledMedicalBatch(
  tx: TransactionClient,
  input: MedicalScheduledBatchInput,
  actorId: string,
  today: CalendarDay,
): Promise<MedicalBatchResult> {
  const entryIds = input.entries.map((entry) => entry.entryId);
  checkSize(entryIds, "entries");
  checkKind(input.details.kind);
  checkTags(
    input.details.kind,
    input.entries.map((entry) => entry.rabiesTagNumber),
    "entries",
  );
  checkOutsideVetNamed(input.details.source, input.details.vetPartnerId, input.details.vetName);

  // An entry's animal and, while it is scheduled, its item never change, so
  // they can be read before the locks. Each entry's status is read again
  // behind its animal's lock when it is recorded.
  const scheduled = await tx.medicalEntry.findMany({
    where: { id: { in: entryIds } },
    select: {
      id: true,
      animalId: true,
      itemId: true,
      notes: true,
      animal: { select: { name: true } },
    },
  });
  if (scheduled.length !== entryIds.length) {
    throw new NotFoundError(
      "Some of the entries no longer exist. Refresh the list and try again.",
    );
  }
  const itemIds = new Set(scheduled.map((entry) => entry.itemId));
  if (itemIds.size > 1) {
    throw new MedicalEntryRefusal(
      "The entries are for different items. Record entries for one item at a time, so the same lot and dose fit them all.",
      "entries",
    );
  }
  const [itemId] = itemIds;
  if (!itemId) {
    throw new MedicalEntryRefusal(
      "Surgeries, microchips and exams aren't recorded in a batch. Record them one at a time.",
      "entries",
    );
  }

  await lockAnimals(
    tx,
    scheduled.map((entry) => entry.animalId),
  );
  const byId = new Map(scheduled.map((entry) => [entry.id, entry]));
  // How many animals the batch gave care to: an animal can have two entries
  // in it.
  const size = new Set(scheduled.map((entry) => entry.animalId)).size;
  const batch: MedicalBatchTag = { batchId: randomUUID(), size };
  const notes = input.details.notes?.trim() ? input.details.notes : null;

  const entries = await writeEach(
    input.entries.map((given) => {
      const entry = byId.get(given.entryId)!;
      return {
        ...given,
        animalId: entry.animalId,
        animalName: entry.animal.name,
        notes: entry.notes,
      };
    }),
    async (entry) => {
      // Read just before it is recorded, after the batch's earlier entries,
      // so of two entries for one item on one animal, the last recorded
      // schedules the next one.
      const planned =
        !!input.scheduleNext &&
        (await hasOtherOpen(tx, entry.animalId, itemId, entry.entryId));
      const { nextEntryId } = await recordScheduledMedicalEntry(
        tx,
        entry.entryId,
        {
          ...input.details,
          itemId,
          ...(input.details.kind === MedicalEntryKind.VACCINE && {
            rabiesTagNumber: entry.rabiesTagNumber ?? null,
          }),
          notes: notes ?? entry.notes,
          scheduleNext: planned ? null : input.scheduleNext,
        } as Parameters<typeof recordScheduledMedicalEntry>[2],
        actorId,
        today,
        { batch },
      );
      return { animalId: entry.animalId, entryId: entry.entryId, nextEntryId };
    },
  );

  return { batchId: batch.batchId, entries };
}

const readAnimalNames = async (tx: TransactionClient, animalIds: string[]) => {
  const animals = await tx.animal.findMany({
    where: { id: { in: animalIds } },
    select: { id: true, name: true },
  });
  return new Map(animals.map((animal) => [animal.id, animal.name]));
};
