-- Records who last wrote a household profile and when. Both columns are
-- nullable: rows that predate them have no recorded editor, and NULL says so
-- rather than guessing.

-- AlterTable
ALTER TABLE "household_profiles" ADD COLUMN     "last_edited_at" TIMESTAMP(3),
ADD COLUMN     "last_edited_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "household_profiles" ADD CONSTRAINT "household_profiles_last_edited_by_id_fkey" FOREIGN KEY ("last_edited_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
