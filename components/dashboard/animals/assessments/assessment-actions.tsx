"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Edit, MoreHorizontal, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteAssessment,
  restoreAssessment,
} from "@/app/lib/actions/animal-assessment.actions";

interface Props {
  assessmentId: string;
  animalId: string;
  isDeleted: boolean;
  canManage: boolean;
}

export function AssessmentActions({
  assessmentId,
  animalId,
  isDeleted,
  canManage,
}: Props) {
  const [isPending, startTransition] = useTransition();

  if (!canManage) return null;

  const onRestore = () => {
    startTransition(async () => {
      const { message } = await restoreAssessment(assessmentId, animalId);
      if (message) toast.success(message);
    });
  };

  const onDelete = () => {
    startTransition(async () => {
      const { message } = await deleteAssessment(assessmentId, animalId);
      if (message) {
        toast.success(message, {
          action: { label: "Undo", onClick: onRestore },
        });
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">Assessment actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link
            href={`/dashboard/animals/${animalId}/assessments/${assessmentId}/edit`}
          >
            <Edit className="mr-2 h-4 w-4" />
            <span>Edit</span>
          </Link>
        </DropdownMenuItem>
        {isDeleted ? (
          <DropdownMenuItem onClick={onRestore} disabled={isPending}>
            <Undo2 className="mr-2 h-4 w-4" />
            <span>Restore</span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={onDelete}
            disabled={isPending}
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Delete</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
