// What the Shelter Animals Count monthly report reads: every animal of a
// species reported to SAC, with its intakes, its outcomes that are not
// reversed, and its foster placements, up to the month's last day. The
// counting is `buildSacReport` (app/lib/utils/sac-report.ts).
//
// No auth or `next/*` imports, so database tests can call it; the report's
// data module (sac-report.data.ts) wraps it with the reports permission.

import type prisma from "@/app/lib/prisma";
import type { SacSpeciesCategory } from "@/prisma/generated/enums";
import {
  buildSacReport,
  sacMonthDays,
  type SacMonth,
  type SacReport,
} from "@/app/lib/utils/sac-report";

type Db = typeof prisma;

const PARTNER = { select: { name: true, state: true, country: true } } as const;

/**
 * The SAC report for `month`. Species with no SAC category are left out.
 * Nothing after the month's last day is read: whether an animal is in care
 * at the end of a day depends only on the records up to that day.
 */
export async function querySacReport(
  db: Db,
  { month, shelterState }: { month: SacMonth; shelterState: string | null },
): Promise<SacReport> {
  const { last } = sacMonthDays(month);

  const [species, animals] = await Promise.all([
    db.species.findMany({
      where: { sacCategory: { not: null }, deletedAt: null },
      select: { sacCategory: true },
      distinct: ["sacCategory"],
    }),
    db.animal.findMany({
      where: {
        species: { sacCategory: { not: null } },
        OR: [
          { intake: { some: { intakeDate: { lte: last } } } },
          {
            Outcome: {
              some: { reversedAt: null, outcomeDate: { lte: last } },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        birthDate: true,
        species: { select: { sacCategory: true } },
        // Ordered, so same-day records pair the same way on every read: the
        // pairing keeps a day's intakes (and outcomes) in the order given,
        // and the first intake of the day is the one that opens the stay.
        intake: {
          where: { intakeDate: { lte: last } },
          orderBy: [{ intakeDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            intakeDate: true,
            type: true,
            sourcePartner: PARTNER,
          },
        },
        Outcome: {
          where: { reversedAt: null, outcomeDate: { lte: last } },
          orderBy: [{ outcomeDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            outcomeDate: true,
            type: true,
            destinationPartner: PARTNER,
          },
        },
        fosterPlacements: {
          where: { startDate: { lte: last } },
          select: { startDate: true, endDate: true },
        },
      },
    }),
  ]);

  return buildSacReport({
    month,
    shelterState,
    categories: species.map((s) => s.sacCategory as SacSpeciesCategory),
    animals: animals.map((animal) => ({
      id: animal.id,
      name: animal.name,
      birthDate: animal.birthDate,
      // The `where` above keeps only species with a category.
      category: animal.species.sacCategory as SacSpeciesCategory,
      intakes: animal.intake.map((intake) => ({
        id: intake.id,
        date: intake.intakeDate,
        type: intake.type,
        partner: intake.sourcePartner,
      })),
      outcomes: animal.Outcome.map((outcome) => ({
        id: outcome.id,
        date: outcome.outcomeDate,
        type: outcome.type,
        partner: outcome.destinationPartner,
      })),
      fosterPlacements: animal.fosterPlacements,
    })),
  });
}
