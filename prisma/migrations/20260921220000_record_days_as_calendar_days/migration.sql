-- These columns record calendar days, so each stores yyyy-MM-dd text. Existing
-- timestamp values are not converted in place: their intended day cannot be
-- recovered without knowing the timezone used when each value was written.
-- Reset and reseed the database after this migration. See docs/calendar-days.md.
ALTER TABLE "animals" ALTER COLUMN "birth_date" SET DATA TYPE TEXT;
ALTER TABLE "intakes" ALTER COLUMN "dateLost" SET DATA TYPE TEXT;
ALTER TABLE "medical_records" ALTER COLUMN "date_of_record" SET DATA TYPE TEXT;
ALTER TABLE "foster_placements" ALTER COLUMN "start_date" DROP DEFAULT,
  ALTER COLUMN "start_date" SET DATA TYPE TEXT,
  ALTER COLUMN "end_date" SET DATA TYPE TEXT;
