-- Adoption applications that were REJECTED by the outcome cascade rather than
-- by a staff judgment. Before CLOSED existed the cascade wrote REJECTED with
-- one generic reason for all six outcome types, so that exact string is the
-- only thing distinguishing an administrative closure from a real rejection.
--
-- Both the application and its history row move: leaving the history behind
-- would show "Rejected — Application rejected as the animal is no longer
-- available." underneath a "Closed" badge once the timeline ships. The
-- original OutcomeType is not recoverable from the generic string, so the
-- backfilled reason uses the OTHER wording, which is true for every outcome.

-- Move the history rows first, while the old reason string is still there to
-- match on.
UPDATE "application_status_history"
SET
  "status" = 'CLOSED',
  "statusChangeReason" = 'This animal is no longer available for adoption.'
WHERE
  "status" = 'REJECTED'
  AND "statusChangeReason" = 'Application rejected as the animal is no longer available.';

-- Then the applications whose *current* status came from one of those rows.
-- Scoped to the latest history row per application so an application that was
-- cascade-closed and later legitimately rejected is not disturbed.
UPDATE "adoption_applications" AS a
SET "status" = 'CLOSED'
WHERE
  a."status" = 'REJECTED'
  AND EXISTS (
    SELECT 1
    FROM "application_status_history" AS h
    WHERE h."application_id" = a."id"
      AND h."status" = 'CLOSED'
      AND h."changed_at" = (
        SELECT MAX(h2."changed_at")
        FROM "application_status_history" AS h2
        WHERE h2."application_id" = a."id"
      )
  );
