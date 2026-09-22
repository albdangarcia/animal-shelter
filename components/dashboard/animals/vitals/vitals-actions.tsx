"use client";

import { useRef, useState, useTransition } from "react";
import { Edit, MoreHorizontal, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import type { WeightUnitSystem } from "@/app/lib/utils/shelter-settings";
import { VitalsForm } from "./vitals-form";
import { toast } from "sonner";
import {
  DirtyFormHandle,
  useConfirmedOpenChange,
} from "@/hooks/use-confirmed-open-change";

interface VitalsActionsProps {
  vitalsLog: AnimalVitalsListPayload;
  unitSystem: WeightUnitSystem;
  animalId: string;
  canManage: boolean;
  previousWeightGrams: number | null;
}

export function VitalsActions({
  vitalsLog,
  unitSystem,
  animalId,
  canManage,
  previousWeightGrams,
}: VitalsActionsProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<DirtyFormHandle>(null);

  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(
      () => formRef.current?.isDirty() ?? false,
      setIsDialogOpen,
    );

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
    <Dialog open={isDialogOpen} onOpenChange={guardedOnOpenChange}>
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
          unitSystem={unitSystem}
          animalId={animalId}
          vitalsLog={vitalsLog}
          previousWeightGrams={previousWeightGrams}
          onFormSubmit={() => setIsDialogOpen(false)}
          ref={formRef}
        />
      </DialogContent>

      <AlertDialog
        open={isConfirmOpen}
        onOpenChange={(open) => !open && cancelDiscard()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved vitals entry?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes will be lost if you leave without saving.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDiscard}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
