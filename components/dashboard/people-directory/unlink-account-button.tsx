"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Unlink } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { unlinkPersonAccount } from "@/app/lib/actions/person-account.actions";

/**
 * The repair for an account linked to the wrong person's record. Rare, not
 * reversible from the UI, and it moves somebody's login — so it is confirmed,
 * it names the address being moved, and it says in advance what stays behind.
 */
export const UnlinkAccountButton = ({
  personId,
  personName,
  accountEmail,
}: {
  personId: string;
  personName: string;
  accountEmail: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const onConfirm = () => {
    startTransition(async () => {
      const result = await unlinkPersonAccount(personId);

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setIsOpen(false);
      // Straight to the record the account now has, which is where whoever
      // did this has to go next: it holds a name copied off the account and
      // no contact details at all.
      if (result.data) {
        router.push(`/dashboard/people-directory/${result.data.replacementPersonId}`);
      }
    });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        disabled={isPending}
      >
        <Unlink className="mr-2 h-4 w-4" />
        Unlink Account
      </Button>

      <AlertDialog
        open={isOpen}
        onOpenChange={(open) => !isPending && setIsOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Unlink this login from {personName}&apos;s record?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Do this only when the login for{" "}
                  <span className="font-medium">{accountEmail}</span> belongs to
                  someone other than {personName}. It does not help a person who
                  has lost access to their own account — staff can edit this
                  record for them without unlinking anything.
                </p>
                <p>
                  The login keeps working and gets a new, empty person record.
                  This record keeps its applications, notes and history, and
                  becomes staff-editable again. Both records are noted.
                </p>
                <p>There is no way to put the link back from here.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }}
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unlink Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
