"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
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
import type { MedicalCatalogItem } from "@/app/lib/data/medical-catalog";
import {
  retireMedicalItem,
  unretireMedicalItem,
} from "@/app/lib/actions/medical-catalog.actions";
import { useMenuDialogFocus } from "@/hooks/use-menu-dialog-focus";
import { MedicalItemForm } from "./medical-item-form";

interface Props {
  item: MedicalCatalogItem;
  species: { id: string; name: string }[];
}

export function MedicalItemActions({ item, species }: Props) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { triggerRef, returnFocus } = useMenuDialogFocus();

  const setRetired = (retire: boolean) => {
    startTransition(async () => {
      const result = retire
        ? await retireMedicalItem(item.id)
        : await unretireMedicalItem(item.id);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={`Actions for ${item.name}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DialogTrigger asChild>
            <DropdownMenuItem>Edit</DropdownMenuItem>
          </DialogTrigger>
          {item.retiredAt ? (
            <DropdownMenuItem
              onClick={() => setRetired(false)}
              disabled={isPending}
            >
              Unretire
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setRetired(true)}
              disabled={isPending}
            >
              Retire
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogContent
        className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto"
        onCloseAutoFocus={returnFocus}
      >
        <DialogHeader>
          <DialogTitle>Edit {item.name}</DialogTitle>
          <DialogDescription>
            Changes to the name show on entries already recorded. Changes to
            the defaults apply to new entries only.
          </DialogDescription>
        </DialogHeader>
        <MedicalItemForm
          item={item}
          species={species}
          onFormSubmit={() => setIsDialogOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
