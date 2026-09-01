import type { Prisma } from "@/prisma/generated/client";

// The one ordering for an animal's photos, used at every read site. `sortOrder`
// is the gallery position (see AnimalImage in schema.prisma); "primary" is
// whichever row has the lowest one. `sortOrder` is not unique per animal —
// two concurrent uploads can race to the same value, and a write path could
// forget to set one and leave it on the `@default(0)` — so `createdAt` breaks
// the tie and keeps the result deterministic across queries. Postgres makes no
// promise about tie order otherwise.
//
// Every query that resolves "the animal's photos" or "the primary photo" MUST
// use this exact clause, never `sortOrder` alone.
export const ANIMAL_IMAGE_ORDER: Prisma.AnimalImageOrderByWithRelationInput[] = [
  { sortOrder: "asc" },
  { createdAt: "asc" },
];
