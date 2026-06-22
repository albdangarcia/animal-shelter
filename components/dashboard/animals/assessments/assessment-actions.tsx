"use client";

import { useTransition } from "react";
import { Edit, MoreHorizontal, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AnimalAssessmentListPayload } from "@/app/lib/data/animals/animal-assessment.data";
import {
  deleteAnimalAssessment,
  restoreAnimalAssessment,
} from "@/app/lib/actions/animal-assessment.actions";
import { toast } from "sonner";
import Link from "next/link";

interface AssessmentActionsProps {
  assessment: AnimalAssessmentListPayload;
  animalId: string;
  canManage: boolean;
}

export function AssessmentActions({
  assessment,
  animalId,
  canManage,
}: AssessmentActionsProps) {
  const [isPending, startTransition] = useTransition();

  const onRestore = () => {
    startTransition(() => {
      restoreAnimalAssessment(assessment.id, animalId).then((data) => {
        if (data?.message) {
          toast.success(data.message);
        }
      });
    });
  };

  const onSoftDelete = () => {
    startTransition(() => {
      deleteAnimalAssessment(assessment.id, animalId).then((data) => {
        if (data?.message) {
          toast.success(data.message, {
            action: {
              label: "Undo",
              onClick: () => onRestore(),
            },
          });
        }
      });
    });
  };

  if (!canManage) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">More options</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link
            href={`/dashboard/animals/${animalId}/assessments/${assessment.id}/edit`}
          >
            <Edit className="mr-2 h-4 w-4" />
            <span>Edit</span>
          </Link>
        </DropdownMenuItem>
        {assessment.deletedAt ? (
          <DropdownMenuItem onClick={onRestore} disabled={isPending}>
            <Undo2 className="mr-2 h-4 w-4" />
            <span>Restore</span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={onSoftDelete}
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
