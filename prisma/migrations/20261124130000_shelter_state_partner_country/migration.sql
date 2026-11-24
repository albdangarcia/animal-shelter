-- The shelter's US state, and a partner's country outside the US, so a
-- transfer can be counted as in state, out of state or international.
-- Null country is the US; every existing partner stays there.
ALTER TABLE "shelter_settings" ADD COLUMN "state" TEXT;
ALTER TABLE "partners" ADD COLUMN "country" TEXT;
