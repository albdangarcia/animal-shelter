"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CharacteristicCategory } from "@/prisma/generated/enums";
import { clsx } from "clsx";
import { X, PlusCircle, ChevronsUpDown, Loader2 } from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { CATEGORIES } from "@/app/lib/constants/characteristic-categories";
import { formatDateToLongString } from "@/app/lib/utils/date-utils";
import { FindingsAgainst } from "./findings-against";
import { useConfirmedOpenChange } from "@/hooks/use-confirmed-open-change";

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

  const initialAssignedIds = new Set(
    animalCharacteristics
      .filter((char) => char.isAssigned)
      .map((char) => char.id),
  );

  // stagedChanges is seeded from initialAssignedIds on open (handleOpenDialog),
  // so dirty means the staged set has actually diverged from what's saved —
  // not just that it's non-empty.
  const isDirty =
    stagedChanges.size !== initialAssignedIds.size ||
    [...stagedChanges].some((id) => !initialAssignedIds.has(id));

  // Use stagedChanges if dialog is open, otherwise use initial data
  const assignedCharacteristics = animalCharacteristics.filter((char) =>
    stagedChanges.has(char.id),
  );

  const savedChars = animalCharacteristics.filter((char) =>
    initialAssignedIds.has(char.id),
  );
  const savedGroupedCharacteristics = savedChars.reduce<
    Record<CharacteristicCategory, CharacteristicWithAssignment[]>
  >(
    (acc, char) => {
      const categoryKey = char.category;
      (acc[categoryKey] = acc[categoryKey] || []).push(char);
      return acc;
    },
    {} as Record<CharacteristicCategory, CharacteristicWithAssignment[]>,
  );

  const availableForAdding = animalCharacteristics.filter(
    (char) => !stagedChanges.has(char.id),
  );

  const handleOpenDialog = () => {
    setStagedChanges(new Set(initialAssignedIds));
    setIsDialogOpen(true);
  };

  const handleCancel = () => {
    setStagedChanges(new Set());
    setIsDialogOpen(false);
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateAnimalCharacteristics({
        animalId,
        characteristicIds: Array.from(stagedChanges),
      });

      if (result.ok) {
        toast.success(
          result.message || "Characteristics updated successfully!",
        );
        setStagedChanges(new Set());
        setIsDialogOpen(false);
      } else {
        toast.error(result.message || "An unexpected error occurred.");
      }
    });
  };

  const handleTagRemove = (charId: string) => {
    const newStagedChanges = new Set(stagedChanges);
    newStagedChanges.delete(charId);
    setStagedChanges(newStagedChanges);
  };

  const handleTagAdd = (charId: string) => {
    const newStagedChanges = new Set(stagedChanges);
    newStagedChanges.add(charId);
    setStagedChanges(newStagedChanges);
    setOpenCombobox(false);
  };

  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(() => isDirty, (open) => {
      if (!open) handleCancel();
      else handleOpenDialog();
    });

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        if (isPending) return; // block close during save
        guardedOnOpenChange(open);
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
                    <div className="flex flex-col gap-2">
                      {characteristicsForCategory.map((char) => (
                        <div
                          key={char.id}
                          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                        >
                          <Badge
                            variant="secondary"
                            className={clsx(
                              "font-medium text-sm py-1 px-2.5",
                              CATEGORIES[char.category]?.color,
                            )}
                          >
                            {char.name}
                          </Badge>
                          <AssignmentProvenance
                            animalId={animalId}
                            char={char}
                          />
                        </div>
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
                    aria-label={`Remove ${char.name}`}
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
          <Button
            variant="outline"
            onClick={() => guardedOnOpenChange(false)}
            disabled={isPending}
          >
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

      <AlertDialog
        open={isConfirmOpen}
        onOpenChange={(open) => !open && cancelDiscard()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes to this animal&apos;s characteristics will be lost
              if you leave without saving.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDiscard}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};

/**
 * Who put a trait on the animal and on what basis, plus any live finding
 * arguing against it — a warning, computed fresh on every load, never a gate.
 */
const AssignmentProvenance = ({
  animalId,
  char,
}: {
  animalId: string;
  char: CharacteristicWithAssignment;
}) => {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {char.assignment && (
        <span className="text-xs text-muted-foreground">
          Added by {char.assignment.assignedByName ?? "a staff member"} on{" "}
          {formatDateToLongString(new Date(char.assignment.assignedAt))}
          {char.assignment.sourceAssessment && (
            <>
              {" — from the "}
              <Link
                href={`/dashboard/animals/${animalId}/assessments/${char.assignment.sourceAssessment.id}`}
                className="font-medium underline underline-offset-2 hover:text-foreground"
              >
                {char.assignment.sourceAssessment.templateName} assessment of{" "}
                {formatDateToLongString(
                  new Date(char.assignment.sourceAssessment.observedAt),
                )}
              </Link>
              {char.assignment.sourceAssessment.deletedAt ? (
                <span className="text-destructive"> (deleted)</span>
              ) : (
                !char.assignment.sourceAssessment.stillSupports && (
                  <span className="text-destructive">
                    {" (no longer supports it)"}
                  </span>
                )
              )}
            </>
          )}
        </span>
      )}
      {char.contradictedBy.length > 0 && (
        <span className="text-xs text-destructive">
          <FindingsAgainst animalId={animalId} findings={char.contradictedBy} />
        </span>
      )}
    </div>
  );
};

export default AnimalCharacteristicsManager;
