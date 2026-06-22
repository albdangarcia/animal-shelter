"use client";

import React, { useState, useMemo, useTransition, useCallback } from "react";
import { CharacteristicCategory } from "@prisma/client";
import { clsx } from "clsx";
import {
  X,
  PlusCircle,
  Pencil,
  HeartPulse,
  Stethoscope,
  Home,
  FileText,
  ChevronsUpDown,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CharacteristicWithAssignment } from "@/app/lib/data/animals/animal-characteristics.data";
import { updateAnimalCharacteristics } from "@/app/lib/actions/animal-characteristics.actions";
import { toast } from "sonner";

type CategoryUIDefinition = {
  label: string;
  color: string;
  icon: React.ElementType;
};

const CATEGORIES: Record<CharacteristicCategory, CategoryUIDefinition> = {
  [CharacteristicCategory.BEHAVIOR]: {
    label: "Behavior",
    color:
      "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900 dark:hover:bg-blue-950",
    icon: HeartPulse,
  },
  [CharacteristicCategory.MEDICAL]: {
    label: "Medical",
    color:
      "bg-red-100 text-red-800 border-red-200 hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:border-red-900 dark:hover:bg-red-950",
    icon: Stethoscope,
  },
  [CharacteristicCategory.ENVIRONMENT]: {
    label: "Environment",
    color:
      "bg-green-100 text-green-800 border-green-200 hover:bg-green-100 dark:bg-green-950 dark:text-green-300 dark:border-green-900 dark:hover:bg-green-950",
    icon: Home,
  },
  [CharacteristicCategory.ADMINISTRATIVE]: {
    label: "Administrative",
    color:
      "bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-800",
    icon: FileText,
  },
  [CharacteristicCategory.OTHER]: {
    label: "Other",
    color:
      "bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-900 dark:hover:bg-yellow-950",
    icon: PlusCircle,
  },
};

const CATEGORY_KEYS = Object.values(CharacteristicCategory);

interface Props {
  animalCharacteristics: CharacteristicWithAssignment[];
  animalId: string;
  canManage: boolean;
}

const AnimalCharacteristicsManager = ({
  animalCharacteristics,
  animalId,
  canManage,
}: Props) => {
  const [isPending, startTransition] = useTransition();

  // Component state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [stagedChanges, setStagedChanges] = useState<Set<string>>(new Set());
  const [openCombobox, setOpenCombobox] = useState(false);

  const initialAssignedIds = useMemo(
    () =>
      new Set(
        animalCharacteristics
          .filter((char) => char.isAssigned)
          .map((char) => char.id),
      ),
    [animalCharacteristics],
  );

  // Use stagedChanges if dialog is open, otherwise use initial data
  const assignedCharacteristics = useMemo(
    () => animalCharacteristics.filter((char) => stagedChanges.has(char.id)),
    [animalCharacteristics, stagedChanges],
  );

  const savedGroupedCharacteristics = useMemo(() => {
    const savedChars = animalCharacteristics.filter((char) =>
      initialAssignedIds.has(char.id),
    );
    return savedChars.reduce<
      Record<CharacteristicCategory, CharacteristicWithAssignment[]>
    >(
      (acc, char) => {
        const categoryKey = char.category;
        (acc[categoryKey] = acc[categoryKey] || []).push(char);
        return acc;
      },
      {} as Record<CharacteristicCategory, CharacteristicWithAssignment[]>,
    );
  }, [animalCharacteristics, initialAssignedIds]);

  const availableForAdding = useMemo(
    () => animalCharacteristics.filter((char) => !stagedChanges.has(char.id)),
    [animalCharacteristics, stagedChanges],
  );

  const handleOpenDialog = useCallback(() => {
    setStagedChanges(new Set(initialAssignedIds));
    setIsDialogOpen(true);
  }, [initialAssignedIds]);

  const handleCancel = useCallback(() => {
    setStagedChanges(new Set());
    setIsDialogOpen(false);
  }, []);

  const handleSave = useCallback(() => {
    startTransition(async () => {
      const result = await updateAnimalCharacteristics({
        animalId,
        characteristicIds: Array.from(stagedChanges),
      });

      if (result.success) {
        toast.success(
          result.message || "Characteristics updated successfully!",
        );
        setStagedChanges(new Set());
        setIsDialogOpen(false);
      } else {
        toast.error(result.message || "An unexpected error occurred.");
      }
    });
  }, [animalId, stagedChanges]);

  const handleTagRemove = useCallback(
    (charId: string) => {
      const newStagedChanges = new Set(stagedChanges);
      newStagedChanges.delete(charId);
      setStagedChanges(newStagedChanges);
    },
    [stagedChanges],
  );

  const handleTagAdd = useCallback(
    (charId: string) => {
      const newStagedChanges = new Set(stagedChanges);
      newStagedChanges.add(charId);
      setStagedChanges(newStagedChanges);
      setOpenCombobox(false);
    },
    [stagedChanges],
  );

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        if (isPending) return; // block close during save
        if (!open) handleCancel();
        else handleOpenDialog();
      }}
    >
      <Card className="@container/card">
        <CardHeader>
          <CardTitle className="@[650px]/card:text-xl">
            Characteristics
          </CardTitle>
          <CardDescription>
            Unique behavioral and medical traits for this animal.
          </CardDescription>
          <CardAction>
            <DialogTrigger asChild>
              <Button
                variant={canManage ? "default" : "outline"}
                size="sm"
                onClick={handleOpenDialog}
                className="disabled:pointer-events-auto disabled:cursor-not-allowed"
                disabled={!canManage}
              >
                Edit
              </Button>
            </DialogTrigger>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {CATEGORY_KEYS.map((key) => {
              const Icon = CATEGORIES[key].icon;
              const characteristicsForCategory =
                savedGroupedCharacteristics[key];
              return (
                characteristicsForCategory &&
                characteristicsForCategory.length > 0 && (
                  <div key={key} className="border rounded-lg p-4 bg-card">
                    <h4 className="font-medium mb-3 flex items-center gap-2 text-foreground">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      {CATEGORIES[key].label}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {characteristicsForCategory.map((char) => (
                        <Badge
                          key={char.id}
                          variant="secondary"
                          className={clsx(
                            "font-medium text-sm py-1 px-2.5",
                            CATEGORIES[char.category]?.color,
                          )}
                        >
                          {char.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )
              );
            })}
            {initialAssignedIds.size === 0 && (
              <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg">
                <p className="text-muted-foreground text-sm">
                  This animal has no characteristics assigned.
                </p>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={handleOpenDialog}
                  >
                    <PlusCircle className="size-4 mr-2" />
                    Add Characteristics
                  </Button>
                </DialogTrigger>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <DialogContent className="sm:max-w-156.25">
        <DialogHeader>
          <DialogTitle>Edit Characteristics</DialogTitle>
          <DialogDescription>
            Add or remove characteristics for this animal. Click save when
            you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="p-3 border rounded-lg space-y-3 bg-muted/50">
            <Label>Selected Characteristics</Label>
            <div className="flex flex-wrap gap-2 min-h-8 max-h-40 overflow-y-auto">
              {assignedCharacteristics.map((char) => (
                <Badge
                  key={char.id}
                  variant="secondary"
                  className={clsx(
                    "flex items-center gap-1.5 py-1",
                    CATEGORIES[char.category]?.color,
                  )}
                >
                  <span>{char.name}</span>
                  <button
                    onClick={() => handleTagRemove(char.id)}
                    className="rounded-full hover:bg-black/10 dark:hover:bg-white/10 p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {assignedCharacteristics.length === 0 && (
                <p className="text-muted-foreground text-sm p-2">
                  Search below to add characteristics.
                </p>
              )}
            </div>
          </div>

          <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={openCombobox}
                className="w-full justify-between font-normal text-muted-foreground"
              >
                Add a characteristic...
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
              <Command>
                <CommandInput placeholder="Search characteristics..." />
                <CommandList>
                  <CommandEmpty>No characteristic found.</CommandEmpty>
                  <CommandGroup>
                    {availableForAdding.map((char) => (
                      <CommandItem
                        key={char.id}
                        value={char.name}
                        onSelect={() => handleTagAdd(char.id)}
                      >
                        <div className="grow">{char.name}</div>
                        <Badge variant="outline" className="ml-2">
                          {CATEGORIES[char.category]?.label}
                        </Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={handleCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AnimalCharacteristicsManager;
