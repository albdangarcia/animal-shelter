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
import type { CharacteristicModel } from "@/prisma/generated/models/Characteristic";
import { CharacteristicForm } from "./characteristic-form";
import {
  deleteCharacteristic,
  restoreCharacteristic,
} from "@/app/lib/actions/characteristics-catalog.actions";
import { toast } from "sonner";

interface Props {
  characteristic: CharacteristicModel;
}

export function CharacteristicActions({ characteristic }: Props) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onSoftDelete = () => {
    startTransition(() => {
      deleteCharacteristic(characteristic.id).then((data) => {
        if (data?.success) {
          toast.success(data.message, {
            action: {
              label: "Undo",
              onClick: () => onRestore(),
            },
          });
        } else if (data?.message) {
          toast.error(data.message);
        }
      });
    });
  };

  const onRestore = () => {
    startTransition(() => {
      restoreCharacteristic(characteristic.id).then((data) => {
        if (data?.success) {
          toast.success(data.message);
        } else if (data?.message) {
          toast.error(data.message);
        }
      });
    });
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={`Actions for ${characteristic.name}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DialogTrigger asChild>
            <DropdownMenuItem>Edit</DropdownMenuItem>
          </DialogTrigger>
          {characteristic.deletedAt ? (
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

      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit Characteristic</DialogTitle>
          <DialogDescription>
            Update the name or category for this characteristic. Click update
            when you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <CharacteristicForm
          onFormSubmit={() => setIsDialogOpen(false)}
          characteristic={characteristic}
        />
      </DialogContent>
    </Dialog>
  );
}