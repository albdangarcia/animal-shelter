-- Two outcomes from Shelter Animals Count's form: Return to Field (a live
-- outcome) and Lost in Care (escaped or unknown, a non-live outcome). From now
-- on OTHER means "other live outcome".
ALTER TYPE "OutcomeType" ADD VALUE 'RETURN_TO_FIELD';
ALTER TYPE "OutcomeType" ADD VALUE 'LOST_IN_CARE';
