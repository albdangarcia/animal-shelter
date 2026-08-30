-- CreateEnum
CREATE TYPE "AiActionTargetType" AS ENUM ('TASK');

-- CreateTable
CREATE TABLE "ai_action_logs" (
    "id" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolCallId" TEXT NOT NULL,
    "approvalId" TEXT,
    "targetType" "AiActionTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "actor_id" TEXT NOT NULL,
    "undone_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_action_logs_targetType_targetId_idx" ON "ai_action_logs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ai_action_logs_actor_id_idx" ON "ai_action_logs"("actor_id");

-- AddForeignKey
ALTER TABLE "ai_action_logs" ADD CONSTRAINT "ai_action_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
