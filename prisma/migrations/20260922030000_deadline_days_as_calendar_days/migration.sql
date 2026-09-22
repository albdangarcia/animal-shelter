-- These two columns hold a deadline, which is a calendar day, so each stores
-- yyyy-MM-dd text. Existing timestamp values are not converted in place: their
-- intended day cannot be recovered without knowing the timezone used when each
-- value was written. Reset and reseed the database after this migration.
-- See docs/calendar-days.md.
ALTER TABLE "foster_placements" ALTER COLUMN "expected_end_date" SET DATA TYPE TEXT;
ALTER TABLE "tasks" ALTER COLUMN "due_date" SET DATA TYPE TEXT;
