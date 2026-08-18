"use client";

import { useState, useTransition } from "react";
import { Edit, MoreHorizontal, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AnimalVitalsListPayload } from "@/app/lib/data/animals/animal-vitals.data";
import {
  deleteVitalsEntry,
  restoreVitalsEntry,
} from "@/app/lib/actions/animal-vitals.actions";
import { VitalsForm } from "./vitals-form";
import { toast } from "sonner";

interface VitalsActionsProps {
  vitalsLog: AnimalVitalsListPayload;
  animalId: string;
  canManage: boolean;
  previousWeightGrams: number | null;
}

export function VitalsActions({
  vitalsLog,
  animalId,
  canManage,
  previousWeightGrams,
}: VitalsActionsProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onRestore = () => {
    startTransition(() => {
      restoreVitalsEntry(vitalsLog.id, animalId).then((data) => {
        if (data?.message) {
          toast.success(data.message);
        }
      });
    });
  };

  const onSoftDelete = () => {
    startTransition(() => {
      deleteVitalsEntry(vitalsLog.id, animalId).then((data) => {
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
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">More options</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DialogTrigger asChild>
            <DropdownMenuItem>
              <Edit className="mr-2 h-4 w-4" />
              <span>Edit</span>
            </DropdownMenuItem>
          </DialogTrigger>
          {vitalsLog.deletedAt ? (
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

      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Vitals Entry</DialogTitle>
          <DialogDescription>
            Update the details for this vitals entry.
          </DialogDescription>
        </DialogHeader>
        <VitalsForm
          animalId={animalId}
          vitalsLog={vitalsLog}
          previousWeightGrams={previousWeightGrams}
          onFormSubmit={() => setIsDialogOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
