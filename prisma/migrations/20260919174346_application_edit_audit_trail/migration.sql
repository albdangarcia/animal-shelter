-- Adds the content-edit audit columns and the flow an application came from.
--
-- `source` is NOT NULL with no schema-level default, so every create site has
-- to say which flow it came from. Existing rows need a value before that can
-- hold, so the column arrives with a temporary DEFAULT, is backfilled, and the
-- default is then dropped.

-- CreateEnum
CREATE TYPE "ApplicationSource" AS ENUM ('SELF', 'STAFF');

-- AlterTable
ALTER TABLE "adoption_applications" ADD COLUMN     "last_edited_at" TIMESTAMP(3),
ADD COLUMN     "last_edited_by_id" TEXT,
ADD COLUMN     "source" "ApplicationSource" NOT NULL DEFAULT 'SELF';

-- AddForeignKey
ALTER TABLE "adoption_applications" ADD CONSTRAINT "adoption_applications_last_edited_by_id_fkey" FOREIGN KEY ("last_edited_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill `source`. The submission row of an application's status history —
-- its earliest one — records who entered it, so an application whose submitter
-- is not its applicant was entered by staff.
--
-- The id comparison alone cannot classify every row: `changed_by_id` is
-- ON DELETE SET NULL, so a departed staff member's submission rows read as
-- NULL and are indistinguishable from an applicant's by id. For those, the
-- exact reason string the staff create action writes is the only remaining
-- evidence. Rows with no history at all keep the DEFAULT 'SELF' above.
UPDATE "adoption_applications" AS a
SET "source" = 'STAFF'
FROM (
  SELECT DISTINCT ON (h."application_id")
    h."application_id",
    h."changed_by_id",
    h."statusChangeReason"
  FROM "application_status_history" AS h
  ORDER BY h."application_id", h."changed_at" ASC, h."id" ASC
) AS submitted
WHERE submitted."application_id" = a."id"
  AND (
    (
      submitted."changed_by_id" IS NOT NULL
      AND submitted."changed_by_id" <> a."applicant_id"
    )
    OR (
      submitted."changed_by_id" IS NULL
      AND submitted."statusChangeReason" = 'Application submitted by staff on behalf of applicant.'
    )
  );

-- The default was only ever for the rows that predate the column.
ALTER TABLE "adoption_applications" ALTER COLUMN "source" DROP DEFAULT;
