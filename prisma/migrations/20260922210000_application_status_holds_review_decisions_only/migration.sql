-- An adoption application's status column holds only review decisions from
-- here on. Whether an application was adopted, or closed because its animal
-- left the shelter, follows from the animal's outcomes and is derived from
-- them, so ADOPTED and CLOSED leave the enum. Foster applications share the
-- enum and never held either.
--
-- Before the type can change, every row holding one has to go:
--
-- 1. Applications whose status is a consequence go back to the review decision
--    they held before it, read from their history. Those are the ADOPTED and
--    CLOSED applications, and the ones a foster-to-adopt conversion marked
--    REJECTED: nobody assessed those applicants, the conversion closed their
--    applications the way any outcome does.
-- 2. A check that each of them still derives what it was: adopted where it was
--    ADOPTED, closed otherwise. The migration refuses to go on if one would
--    not, rather than quietly reopening an application for an animal that has
--    gone.
-- 3. The history rows recording those consequences are deleted. The status
--    history now shows the outcome itself in their place — who recorded it,
--    when, and the reason its type gives — which is what these rows copied.

BEGIN;

-- The rejections a foster-to-adopt conversion wrote. Its reason is free text a
-- member of staff could also type for a real rejection, so the text alone does
-- not identify one. The row must also have been written by the staff member
-- who recorded a conversion's outcome for the same animal, in the minute after
-- that outcome. The conversion wrote the outcome first and its rejections next,
-- in one transaction, with timestamps from the application's clock statement by
-- statement: close, but not equal. A rejection typed by hand before the
-- conversion is therefore excluded, and after it there was nothing open left to
-- reject, since the conversion rejected every open application. A conversion
-- rejection this misses, say because the clock stepped between the two writes,
-- stays REJECTED, as every one of them was before this migration.
CREATE TEMP TABLE conversion_rejection ON COMMIT DROP AS
SELECT h."id", h."application_id"
FROM "application_status_history" AS h
JOIN "adoption_applications" AS a ON a."id" = h."application_id"
WHERE h."status" = 'REJECTED'
  AND h."statusChangeReason" = 'Application rejected as the animal is no longer available.'
  AND EXISTS (
    SELECT 1
    FROM "outcomes" AS o
    JOIN "foster_placements" AS fp ON fp."outcome_id" = o."id"
    WHERE o."animalId" = a."animal_id"
      AND o."staffMemberId" = h."changed_by_id"
      AND h."changed_at" >= o."createdAt"
      AND h."changed_at" < o."createdAt" + interval '1 minute'
  );

CREATE TEMP TABLE consequence_backfill ON COMMIT DROP AS
SELECT a."id", a."status"::text AS "was"
FROM "adoption_applications" AS a
WHERE a."status" IN ('ADOPTED', 'CLOSED')
  OR (
    a."status" = 'REJECTED'
    AND EXISTS (
      SELECT 1
      FROM conversion_rejection AS c
      JOIN "application_status_history" AS h ON h."id" = c."id"
      WHERE c."application_id" = a."id"
        AND h."changed_at" = (
          SELECT MAX(h2."changed_at")
          FROM "application_status_history" AS h2
          WHERE h2."application_id" = a."id"
        )
    )
  );

-- The latest history row that records a decision. Rows stamped in the same
-- millisecond are told apart by id. Every id is a cuid, which begins with the
-- millisecond it was generated and a counter the generating process increments,
-- so of two rows written by one process the larger id was written later. Two
-- decisions on one application in the same millisecond from different
-- processes would need two people acting on it in that same millisecond.
--
-- With no decision in the history at all, ADOPTED falls back to APPROVED, the
-- only status an adoption is ever recorded against. Anything else falls back
-- to PENDING. Every open status derives closed the same way, so the choice
-- only shows if the outcome is ever voided, and then PENDING puts the
-- application back in front of a reviewer rather than claiming an approval
-- nothing records.
UPDATE "adoption_applications" AS a
SET "status" = COALESCE(
  (
    SELECT h."status"::text
    FROM "application_status_history" AS h
    WHERE h."application_id" = a."id"
      AND h."status" NOT IN ('ADOPTED', 'CLOSED')
      AND h."id" NOT IN (SELECT c."id" FROM conversion_rejection AS c)
    ORDER BY h."changed_at" DESC, h."id" DESC
    LIMIT 1
  ),
  CASE WHEN b."was" = 'ADOPTED' THEN 'APPROVED' ELSE 'PENDING' END
)::"ApplicationStatus"
FROM consequence_backfill AS b
WHERE b."id" = a."id";

-- Mirrors `deriveApplicationStatus`: adopted by a linked adoption outcome for
-- the application's own animal; otherwise closed by any outcome for the animal
-- recorded at or after the application was submitted, unless the review
-- decision is a settled one.
DO $$
DECLARE
  changed integer;
BEGIN
  SELECT count(*) INTO changed
  FROM consequence_backfill AS b
  JOIN "adoption_applications" AS a ON a."id" = b."id"
  WHERE CASE
    WHEN b."was" = 'ADOPTED' THEN NOT EXISTS (
      SELECT 1
      FROM "outcomes" AS o
      WHERE o."adoptionApplicationId" = a."id"
        AND o."type" = 'ADOPTION'
        AND o."animalId" = a."animal_id"
    )
    ELSE a."status" IN ('REJECTED', 'WITHDRAWN')
      OR EXISTS (
        SELECT 1
        FROM "outcomes" AS o
        WHERE o."adoptionApplicationId" = a."id"
          AND o."type" = 'ADOPTION'
          AND o."animalId" = a."animal_id"
      )
      OR NOT EXISTS (
        SELECT 1
        FROM "outcomes" AS o
        WHERE o."animalId" = a."animal_id"
          AND o."createdAt" >= a."submitted_at"
      )
  END;

  IF changed > 0 THEN
    RAISE EXCEPTION
      '% adoption application(s) would no longer read as adopted or closed once their stored consequence is removed. Compare each one''s history with its animal''s outcomes before migrating.',
      changed;
  END IF;
END $$;

DELETE FROM "application_status_history"
WHERE "status" IN ('ADOPTED', 'CLOSED')
  OR "id" IN (SELECT c."id" FROM conversion_rejection AS c);

-- AlterEnum
CREATE TYPE "ApplicationStatus_new" AS ENUM ('PENDING', 'REVIEWING', 'WAITLISTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');
ALTER TABLE "adoption_applications" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "foster_applications" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "adoption_applications" ALTER COLUMN "status" TYPE "ApplicationStatus_new" USING ("status"::text::"ApplicationStatus_new");
ALTER TABLE "application_status_history" ALTER COLUMN "status" TYPE "ApplicationStatus_new" USING ("status"::text::"ApplicationStatus_new");
ALTER TABLE "foster_applications" ALTER COLUMN "status" TYPE "ApplicationStatus_new" USING ("status"::text::"ApplicationStatus_new");
ALTER TABLE "foster_application_status_history" ALTER COLUMN "status" TYPE "ApplicationStatus_new" USING ("status"::text::"ApplicationStatus_new");
ALTER TYPE "ApplicationStatus" RENAME TO "ApplicationStatus_old";
ALTER TYPE "ApplicationStatus_new" RENAME TO "ApplicationStatus";
DROP TYPE "ApplicationStatus_old";
ALTER TABLE "adoption_applications" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "foster_applications" ALTER COLUMN "status" SET DEFAULT 'PENDING';

COMMIT;
