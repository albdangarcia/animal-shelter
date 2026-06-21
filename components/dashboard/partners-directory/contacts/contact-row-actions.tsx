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
import { PartnerContactsPayload, LinkablePersonPayload } from "@/app/lib/types";
import { PartnerContactForm } from "./partner-contact-form";
import {
  setPrimaryContact,
  setContactActive,
} from "@/app/lib/actions/partner-contact.actions";
import { toast } from "sonner";

interface ContactActionsProps {
  contact: PartnerContactsPayload;
  people: LinkablePersonPayload[];
  partnerId: string;
}

export function ContactActions({
  contact,
  people,
  partnerId,
}: ContactActionsProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onSetPrimary = () => {
    startTransition(() => {
      setPrimaryContact(contact.id, partnerId).then((data) => {
        if (!data.success) {
          toast.error(data.message);
          return;
        }
        // Offer undo only when a previous primary was demoted.
        if (data.previousPrimary) {
          const prev = data.previousPrimary;
          toast.success(data.message, {
            action: {
              label: "Undo",
              onClick: () => onUndoPrimary(prev.id, prev.name),
            },
          });
        } else {
          toast.success(data.message);
        }
      });
    });
  };

  const onUndoPrimary = (previousId: string, previousName: string) => {
    startTransition(() => {
      setPrimaryContact(previousId, partnerId).then((data) => {
        if (data.success) {
          toast.success(`Reverted primary to ${previousName}.`);
        } else {
          toast.error("Couldn't undo.");
        }
      });
    });
  };

  const onToggleActive = () => {
    startTransition(() => {
      setContactActive(contact.id, partnerId, !contact.isActive).then(
        (data) => {
          if (data.success) {
            toast.success(data.message);
          } else {
            toast.error(data.message);
          }
        },
      );
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

          {!contact.isPrimary && contact.isActive && (
            <DropdownMenuItem onClick={onSetPrimary} disabled={isPending}>
              Set as primary
            </DropdownMenuItem>
          )}

          {contact.isActive ? (
            <DropdownMenuItem
              variant="destructive"
              onClick={onToggleActive}
              disabled={isPending}
            >
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={onToggleActive} disabled={isPending}>
              Reactivate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Contact</DialogTitle>
          <DialogDescription>
            Update this contact&apos;s role, primary status, or active status.
          </DialogDescription>
        </DialogHeader>
        <PartnerContactForm
          partnerId={partnerId}
          people={people}
          contact={contact}
          onFormSubmit={() => setIsDialogOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}