-- Data migration: an animal that has left the shelter is not in a kennel.
-- Before this, `_createOutcome` archived animals without clearing
-- `current_unit_id`, so adopted / transferred-out / deceased animals kept
-- occupying their unit indefinitely. The action is fixed going forward; this
-- clears the stale assignments already in the table.
UPDATE "animals"
SET "current_unit_id" = NULL
WHERE "listing_status" = 'ARCHIVED'
  AND "current_unit_id" IS NOT NULL;
