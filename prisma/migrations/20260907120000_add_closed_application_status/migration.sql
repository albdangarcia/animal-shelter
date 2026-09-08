-- AlterEnum
-- Postgres will not let a newly added enum value be used by other statements in
-- the same transaction, so the backfill that moves cascade-rejected rows onto
-- CLOSED lives in the migration that follows this one.
ALTER TYPE "ApplicationStatus" ADD VALUE 'CLOSED';
