"use client";

import type { Row, StockFeatures } from "@tanstack/react-table";
import { Loader2, MoreHorizontal } from "lucide-react";
import { useState, useTransition } from "react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { RoleManagementPayload } from "@/app/lib/types";
import { Role } from "@/prisma/generated/enums";
import {
  deactivateUser,
  reactivateUser,
  updateUserRole,
} from "@/app/lib/actions/role-management.actions";

interface DataTableRowActionsProps {
  row: Row<StockFeatures, RoleManagementPayload>;
}

const assignableRoles: Role[] = [Role.STAFF, Role.USER, Role.VOLUNTEER];

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const user = row.original;
  const [isPending, startTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const isDeactivated = !!user.deactivatedAt;
  const accountLabel = user.person?.name ?? user.email;

  const handleRoleChange = (newRole: Role) => {
    startTransition(async () => {
      const result = await updateUserRole(user.id, newRole);

      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    });
  };

  // Deactivating needs a reason — it is what the next admin reads to learn why
  // this account is barred — reactivating does not, since undoing a mistake
  // should not take a form.
  const handleAccountState = () => {
    startTransition(async () => {
      const result = await (isDeactivated ? reactivateUser : deactivateUser)(
        user.id,
        reason,
      );

      if (result.success) {
        toast.success(result.message);
        setIsDialogOpen(false);
        setReason("");
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <AlertDialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        if (isPending) return;
        setIsDialogOpen(open);
        if (!open) setReason("");
      }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0"
            disabled={isPending}
          >
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {assignableRoles.map((role) => (
            <DropdownMenuItem
              key={role}
              disabled={user.role === role || isPending}
              onSelect={() => handleRoleChange(role)}
              className="capitalize"
            >
              Set as {role.toLowerCase()}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <AlertDialogTrigger asChild>
            <DropdownMenuItem
              disabled={isPending}
              variant={isDeactivated ? "default" : "destructive"}
            >
              {isDeactivated ? "Reactivate" : "Deactivate"}
            </DropdownMenuItem>
          </AlertDialogTrigger>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isDeactivated ? "Reactivate" : "Deactivate"} {accountLabel}&apos;s
            account?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {isDeactivated ? (
                <p>
                  <span className="font-medium">{user.email}</span> will be able
                  to sign in again.
                </p>
              ) : (
                <>
                  <p>
                    <span className="font-medium">{user.email}</span> will be
                    signed out everywhere and unable to sign in until an admin
                    reactivates it. Their record, applications and history are
                    kept.
                  </p>
                  <p>
                    This bars the account, not the person: they can still
                    register again with a different sign-in account.
                  </p>
                </>
              )}
              <p>The reason is saved as a note on their record.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            isDeactivated ? "Reason (optional)" : "Why is this account being deactivated?"
          }
          aria-label="Reason"
          maxLength={500}
          disabled={isPending}
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleAccountState();
            }}
            disabled={isPending || (!isDeactivated && reason.trim() === "")}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isDeactivated ? "Reactivate" : "Deactivate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
