"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
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
import { PersonNotePayload } from "@/app/lib/types";
import {
  deletePersonNote,
  restorePersonNote,
} from "@/app/lib/actions/person-note.actions";
import { toast } from "sonner";
import { PersonNoteForm } from "./person-note-form";

interface PersonNoteActionsProps {
  note: PersonNotePayload;
  personId: string;
}

export function PersonNoteActions({ note, personId }: PersonNoteActionsProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onSoftDelete = () => {
    startTransition(() => {
      deletePersonNote(note.id, personId).then((data) => {
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

  const onRestore = () => {
    startTransition(() => {
      restorePersonNote(note.id, personId).then((data) => {
        if (data?.message) {
          toast.success(data.message);
        }
      });
    });
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DialogTrigger asChild>
            <DropdownMenuItem>Edit</DropdownMenuItem>
          </DialogTrigger>
          {note.deletedAt ? (
            <DropdownMenuItem onClick={onRestore} disabled={isPending}>
              Restore
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              variant="destructive"
              onClick={onSoftDelete}
              disabled={isPending}
            >
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Note</DialogTitle>
          <DialogDescription>
            Update the details for this note. Click update when you&apos;re
            done.
          </DialogDescription>
        </DialogHeader>
        <PersonNoteForm
          personId={personId}
          onFormSubmit={() => setIsDialogOpen(false)}
          note={note}
        />
      </DialogContent>
    </Dialog>
  );
}