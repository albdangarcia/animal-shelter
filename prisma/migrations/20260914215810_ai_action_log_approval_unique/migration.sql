/*
  Warnings:

  - A unique constraint covering the columns `[approvalId]` on the table `ai_action_logs` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ai_action_logs_approvalId_key" ON "ai_action_logs"("approvalId");
