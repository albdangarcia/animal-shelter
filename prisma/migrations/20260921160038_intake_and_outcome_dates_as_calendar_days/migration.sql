-- An intake date and an outcome date are calendar days, not instants, so both
-- columns become `yyyy-MM-dd` text. See docs/calendar-days.md.
--
-- Nothing is converted in place. The day an existing instant falls on depends
-- on the timezone it was written for, which this migration cannot read, and a
-- value guessed wrong here would be a plausible-looking wrong day rather than
-- a visible one. Every environment rebuilds its data from prisma/seed.ts.

-- AlterTable
ALTER TABLE "intakes" ALTER COLUMN "intakeDate" DROP DEFAULT,
ALTER COLUMN "intakeDate" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "outcomes" ALTER COLUMN "outcomeDate" DROP DEFAULT,
ALTER COLUMN "outcomeDate" SET DATA TYPE TEXT;
