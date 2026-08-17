"use client";

import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { MoreHorizontal, PlusCircle } from "lucide-react";
import type { SpeciesModel } from "@/prisma/generated/models/Species";
import { BreedWithSpecies } from "@/app/lib/data/breeds/breeds-catalog.data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { BreedForm } from "./breed-form";
import {
  deleteBreed,
  restoreBreed,
} from "@/app/lib/actions/breeds-catalog.actions";
import { sizeOptions } from "@/components/dashboard/animals/table/animal-options";
import { toast } from "sonner";

const sizeLabels = Object.fromEntries(
  sizeOptions.map((option) => [option.value, option.label]),
);

function BreedActions({
  breed,
  species,
}: {
  breed: BreedWithSpecies;
  species: SpeciesModel[];
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onSoftDelete = () => {
    startTransition(() => {
      deleteBreed(breed.id).then((data) => {
        if (data?.success) {
          toast.success(data.message, {
            action: { label: "Undo", onClick: () => onRestore() },
          });
        } else if (data?.message) {
          toast.error(data.message);
        }
      });
    });
  };

  const onRestore = () => {
    startTransition(() => {
      restoreBreed(breed.id).then((data) => {
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
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DialogTrigger asChild>
            <DropdownMenuItem>Edit</DropdownMenuItem>
          </DialogTrigger>
          {breed.deletedAt ? (
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
          <DialogTitle>Edit Breed</DialogTitle>
          <DialogDescription>
            Update the name or species for this breed. Click update when
            you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <BreedForm
          onFormSubmit={() => setIsDialogOpen(false)}
          species={species}
          breed={breed}
        />
      </DialogContent>
    </Dialog>
  );
}

interface Props {
  breeds: BreedWithSpecies[];
  species: SpeciesModel[];
}

export const BreedsSection = ({ breeds, species }: Props) => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Only active species can receive new breeds.
  const activeSpecies = species.filter((s) => !s.deletedAt);

  // Group breeds by species name (data arrives pre-sorted from the fetcher).
  const grouped = breeds.reduce<Record<string, BreedWithSpecies[]>>(
    (acc, breed) => {
      const key = breed.species.name;
      (acc[key] = acc[key] || []).push(breed);
      return acc;
    },
    {},
  );
  const speciesNames = Object.keys(grouped);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Breeds</CardTitle>
        <CardDescription>
          Manage the breeds available within each species.
        </CardDescription>
        <CardAction>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={activeSpecies.length === 0}>
                <PlusCircle className="size-4 mr-2" />
                Add Breed
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Add Breed</DialogTitle>
                <DialogDescription>
                  Create a new breed under a species. Click create when
                  you&apos;re done.
                </DialogDescription>
              </DialogHeader>
              <BreedForm
                onFormSubmit={() => setIsAddDialogOpen(false)}
                species={activeSpecies}
              />
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        {breeds.length > 0 ? (
          <div className="space-y-4">
            {speciesNames.map((name) => (
              <div key={name} className="border rounded-lg p-4 bg-card">
                <h4 className="font-medium mb-3 text-foreground">{name}</h4>
                <div className="flex flex-wrap gap-2">
                  {grouped[name].map((breed) => (
                    <div
                      key={breed.id}
                      className={clsx(
                        "flex items-center gap-1 rounded-md border pl-2.5 pr-1 py-0.5",
                        breed.deletedAt && "opacity-50 border-dashed",
                      )}
                    >
                      <span className="text-sm font-medium">{breed.name}</span>
                      {breed.typicalSize ? (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          {sizeLabels[breed.typicalSize]}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1 py-0 text-muted-foreground"
                        >
                          No typical size
                        </Badge>
                      )}
                      {breed.deletedAt && (
                        <Badge
                          variant="destructive"
                          className="ml-1 text-[10px] px-1 py-0"
                        >
                          Deleted
                        </Badge>
                      )}
                      <BreedActions breed={breed} species={activeSpecies} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground text-sm">
              {activeSpecies.length === 0
                ? "Create a species first before adding breeds."
                : "No breeds have been created yet."}
            </p>
            {activeSpecies.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setIsAddDialogOpen(true)}
              >
                <PlusCircle className="size-4 mr-2" />
                Add Breed
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};