import type prisma from "@/app/lib/prisma";
import type { TransactionClient } from "@/app/lib/prisma";
import type { ColorPayload, SpeciesPayload } from "@/app/lib/types";

/**
 * The species, breeds and colors the animal form offers: only those not
 * deleted in Settings → Animal Taxonomy. The save checks the same rule
 * (`assertLiveTaxonomy`), for a form opened before a delete.
 *
 * No auth or `next/*` imports, so database tests drive it directly;
 * `animal.data.ts` wraps it for the pages.
 */
type Db = TransactionClient | typeof prisma;

export const findColorOptions = (db: Db): Promise<ColorPayload[]> =>
  db.color.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

export const findSpeciesOptions = (db: Db): Promise<SpeciesPayload[]> =>
  db.species.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      breeds: {
        where: { deletedAt: null },
        select: { id: true, name: true, typicalSize: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
