-- An outcome that archives an animal cancels its open tasks, and records
-- which outcome did and the status each task had, so reversing the outcome
-- can put them back. Existing tasks have neither.
ALTER TABLE "tasks" ADD COLUMN "canceled_by_outcome_id" TEXT;
ALTER TABLE "tasks" ADD COLUMN "status_before_outcome" "TaskStatus";

CREATE INDEX "tasks_canceled_by_outcome_id_idx" ON "tasks"("canceled_by_outcome_id");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_canceled_by_outcome_id_fkey" FOREIGN KEY ("canceled_by_outcome_id") REFERENCES "outcomes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
