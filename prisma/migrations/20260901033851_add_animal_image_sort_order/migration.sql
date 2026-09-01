-- AlterTable
ALTER TABLE "animal_images" ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- Backfill: number each animal's existing photos by creation order so the
-- apparent gallery order is preserved and nothing visibly shifts. New rows keep
-- the DEFAULT 0 until a write path assigns max(sort_order) + 1.
-- Note: the timestamp column is "createdAt" (camelCase, unmapped), not created_at.
UPDATE "animal_images" ai
SET "sort_order" = sub.rn - 1
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "animal_id" ORDER BY "createdAt") AS rn
  FROM "animal_images"
) sub
WHERE ai."id" = sub."id";

-- CreateIndex
CREATE INDEX "animal_images_animal_id_sort_order_idx" ON "animal_images"("animal_id", "sort_order");
