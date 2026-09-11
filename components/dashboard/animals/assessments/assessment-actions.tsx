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

function useAssessmentDeletion(assessmentId: string, animalId: string) {
  const [isPending, startTransition] = useTransition();

  const onRestore = () => {
    startTransition(async () => {
      const result = await restoreAssessment(assessmentId, animalId);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  };

  const onDelete = () => {
    startTransition(async () => {
      const result = await deleteAssessment(assessmentId, animalId);
      if (!result.ok) {
        // Nothing was deleted, so there is nothing to undo.
        toast.error(result.message);
        return;
      }
      toast.success(result.message, {
        action: { label: "Undo", onClick: onRestore },
      });
    });
  };

  return { isPending, onDelete, onRestore };
}

const editHref = (animalId: string, assessmentId: string) =>
  `/dashboard/animals/${animalId}/assessments/${assessmentId}/edit`;

/** Row menu on the assessments list. */
export function AssessmentActions({
  assessmentId,
  animalId,
  isDeleted,
  canManage,
}: Props) {
  const { isPending, onDelete, onRestore } = useAssessmentDeletion(
    assessmentId,
    animalId,
  );

  if (!canManage) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">Assessment actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isDeleted ? (
          <DropdownMenuItem onClick={onRestore} disabled={isPending}>
            <Undo2 className="mr-2 h-4 w-4" />
            <span>Restore</span>
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link href={editHref(animalId, assessmentId)}>
                <Edit className="mr-2 h-4 w-4" />
                <span>Edit</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              disabled={isPending}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span>Delete</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Header buttons on an assessment's own page. */
export function AssessmentDetailActions({
  assessmentId,
  animalId,
  isDeleted,
  canManage,
}: Props) {
  const { isPending, onDelete, onRestore } = useAssessmentDeletion(
    assessmentId,
    animalId,
  );

  if (!canManage) return null;

  if (isDeleted) {
    return (
      <Button size="sm" onClick={onRestore} disabled={isPending}>
        <Undo2 className="mr-2 h-4 w-4" />
        Restore
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm">
        <Link href={editHref(animalId, assessmentId)}>
          <Edit className="mr-2 h-4 w-4" />
          Edit
        </Link>
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onDelete}
        disabled={isPending}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Delete
      </Button>
    </div>
  );
}
