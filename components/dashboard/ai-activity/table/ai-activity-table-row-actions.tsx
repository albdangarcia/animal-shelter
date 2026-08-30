"use client";

import type { Row, StockFeatures } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { undoAiAction } from "@/app/lib/actions/ai-activity.actions";
import type { AiActivityLogRow } from "@/app/lib/data/ai-activity.data";

interface Props {
  row: Row<StockFeatures, AiActivityLogRow>;
  canManage: boolean;
}

export function AiActivityRowActions({ row, canManage }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Everything in this menu is a mutation. The page is gated on
  // AI_ACTIVITY_READ (staff/admin), who also hold ANIMAL_TASK_MANAGE, but keep
  // the guard for defense in depth and to match the other tables.
  if (!canManage) {
    return null;
  }

  const alreadyUndone = row.original.undoneAt !== null;

  const onUndo = () => {
    startTransition(async () => {
      const result = await undoAiAction(row.original.id);
      if (result.success) {
        // Matches the toast-with-undo idiom already in task-table-row-actions.
        toast.success(result.message);
        router.refresh();
      } else {
        // A staleness refusal is information, not a failure.
        toast.error(result.message);
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          disabled={isPending}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onSelect={onUndo}
          disabled={alreadyUndone || isPending}
        >
          {alreadyUndone ? "Already undone" : "Undo this change"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
