"use client";

import { Row } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
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
import { Role } from "@prisma/client";
import { updateUserRole } from "@/app/lib/actions/role-management.actions";

interface DataTableRowActionsProps {
  row: Row<RoleManagementPayload>;
}

const assignableRoles: Role[] = [Role.STAFF, Role.USER, Role.VOLUNTEER];

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const user = row.original;
  const [isPending, startTransition] = useTransition();

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

  return (
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
