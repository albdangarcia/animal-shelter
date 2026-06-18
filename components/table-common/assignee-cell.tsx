"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface AssigneeOption {
  id: string;
  name: string | null;
}

export interface AssigneeCellProps {
  /** Currently assigned option, or null/undefined if unassigned */
  currentAssignee: AssigneeOption | null | undefined;
  /** Full list of selectable assignees (excluding the synthetic "Unassigned" entry, which is added automatically) */
  assigneeList: AssigneeOption[];
  /** Whether the current user is allowed to change the assignee */
  canManage: boolean;
  /**
   * Called when the user selects a new assignee. Receives the new assignee id,
   * or null if "Unassigned" was selected. Should return a result indicating
   * success/failure so the cell can show the right toast.
   */
  onAssigneeChange: (
    newAssigneeId: string | null,
  ) => Promise<{ success: boolean; message?: string }>;
  /** Optional copy overrides */
  unassignedLabel?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  successMessage?: string;
}

export function AssigneeCell({
  currentAssignee,
  assigneeList,
  canManage,
  onAssigneeChange,
  unassignedLabel = "Unassigned",
  searchPlaceholder = "Search name...",
  emptyLabel = "No one found.",
  successMessage = "Assignee updated successfully.",
}: AssigneeCellProps) {
  const [open, setOpen] = useState(false);
  const currentAssigneeId = currentAssignee?.id ?? "unassigned";
  const currentName = currentAssignee?.name ?? unassignedLabel;

  const options: AssigneeOption[] = [
    { id: "unassigned", name: unassignedLabel },
    ...assigneeList.map((a) => ({ id: a.id, name: a.name ?? "Unknown" })),
  ];

  const handleAssigneeChange = async (newAssigneeId: string) => {
    setOpen(false);
    const result = await onAssigneeChange(
      newAssigneeId === "unassigned" ? null : newAssigneeId,
    );

    if (!result.success) {
      toast.error(result.message ?? "Failed to update assignee.");
    } else {
      toast.success(successMessage);
    }
  };

  return (
    <Popover open={open} onOpenChange={(next) => canManage && setOpen(next)}>
      <PopoverTrigger asChild>
        <span
          className={cn(
            "inline-block w-full max-w-45",
            !canManage && "cursor-not-allowed",
          )}
        >
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={!canManage}
            className="w-full max-w-45 justify-between font-normal disabled:pointer-events-none disabled:opacity-100"
          >
            <span className="truncate">{currentName}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-45 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {options.map((assignee) => (
                <CommandItem
                  key={assignee.id}
                  value={assignee.name ?? ""}
                  onSelect={() => handleAssigneeChange(assignee.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      currentAssigneeId === assignee.id
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  {assignee.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}