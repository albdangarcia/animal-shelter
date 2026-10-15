"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  MedicalProtocolListing,
  ProtocolStepItem,
} from "@/app/lib/data/medical-protocol";
import {
  retireMedicalProtocol,
  unretireMedicalProtocol,
} from "@/app/lib/actions/medical-protocol.actions";
import { useConfirmedOpenChange } from "@/hooks/use-confirmed-open-change";
import { useMenuDialogFocus } from "@/hooks/use-menu-dialog-focus";
import { DiscardChangesDialog } from "@/components/dashboard/animals/medical/discard-changes-dialog";
import {
  MedicalProtocolForm,
  type MedicalProtocolFormHandle,
} from "./medical-protocol-form";

interface FormOptions {
  species: { id: string; name: string }[];
  items: ProtocolStepItem[];
}

/** The protocol form in a dialog, which asks before losing changes. */
function ProtocolFormDialog({
  open,
  onOpenChange,
  protocol,
  species,
  items,
  onCloseAutoFocus,
}: FormOptions & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  protocol?: MedicalProtocolListing;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const formRef = useRef<MedicalProtocolFormHandle>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(() => formRef.current?.isDirty() ?? false, onOpenChange);

  return (
    <>
      {/* Not closed under a save: its result closes the dialog, which would
          otherwise be a new draft opened since. */}
      <Dialog
        open={open}
        onOpenChange={(next) => !formRef.current?.isPending() && guardedOnOpenChange(next)}
      >
        <DialogContent
          className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <DialogHeader>
            <DialogTitle>{protocol ? `Edit ${protocol.name}` : "Add Protocol"}</DialogTitle>
            <DialogDescription>
              {protocol
                ? "Care already scheduled from this protocol stays as it was. A step you change or remove is retired; animals admitted afterwards get the steps as saved."
                : "The care animals of one species and age range are scheduled when they arrive."}
            </DialogDescription>
          </DialogHeader>
          <MedicalProtocolForm
            ref={formRef}
            protocol={protocol}
            species={species}
            items={items}
            onFormSubmit={() => onOpenChange(false)}
          />
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={isConfirmOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
        subject="protocol"
      />
    </>
  );
}

export function AddMedicalProtocolButton({ species, items }: FormOptions) {
  const [isOpen, setIsOpen] = useState(false);
  // The dialog isn't opened by a trigger of its own, so it hands focus back
  // to this button when it closes.
  const buttonRef = useRef<HTMLButtonElement>(null);
  const returnFocus = (event: Event) => {
    event.preventDefault();
    buttonRef.current?.focus();
  };
  return (
    <>
      <Button ref={buttonRef} size="sm" onClick={() => setIsOpen(true)}>
        <PlusCircle className="size-4 mr-2" />
        Add Protocol
      </Button>
      <ProtocolFormDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        species={species}
        items={items}
        onCloseAutoFocus={returnFocus}
      />
    </>
  );
}

interface Props extends FormOptions {
  protocol: MedicalProtocolListing;
}

/** Edit and Retire for a live protocol; Unretire for a retired one. */
export function MedicalProtocolActions({ protocol, species, items }: Props) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { triggerRef, returnFocus } = useMenuDialogFocus();

  const setRetired = (retire: boolean) => {
    startTransition(async () => {
      const result = retire
        ? await retireMedicalProtocol(protocol.id)
        : await unretireMedicalProtocol(protocol.id);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
        // Most likely someone else retired or unretired it first; refreshing
        // shows the row, and the actions it now offers, as they are.
        router.refresh();
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label={`Actions for ${protocol.name}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {protocol.retired ? (
            <DropdownMenuItem onClick={() => setRetired(false)} disabled={isPending}>
              Unretire
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem onSelect={() => setIsDialogOpen(true)}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setRetired(true)}
                disabled={isPending}
              >
                Retire
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ProtocolFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        protocol={protocol}
        species={species}
        items={items}
        onCloseAutoFocus={returnFocus}
      />
    </>
  );
}
