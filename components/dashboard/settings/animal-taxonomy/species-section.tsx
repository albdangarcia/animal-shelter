"use client";

import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { MoreHorizontal, PlusCircle } from "lucide-react";
import { Species } from "@prisma/client";
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
import { SpeciesForm } from "./species-form";
import {
  deleteSpecies,
  restoreSpecies,
} from "@/app/lib/actions/species-catalog.actions";
import { toast } from "sonner";

function SpeciesActions({ species }: { species: Species }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onSoftDelete = () => {
    startTransition(() => {
      deleteSpecies(species.id).then((data) => {
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
      restoreSpecies(species.id).then((data) => {
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
          {species.deletedAt ? (
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
          <DialogTitle>Edit Species</DialogTitle>
          <DialogDescription>
            Update the name for this species. Click update when you&apos;re
            done.
          </DialogDescription>
        </DialogHeader>
        <SpeciesForm
          onFormSubmit={() => setIsDialogOpen(false)}
          species={species}
        />
      </DialogContent>
    </Dialog>
  );
}

interface Props {
  species: Species[];
}

export const SpeciesSection = ({ species }: Props) => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Species</CardTitle>
        <CardDescription>
          Manage the species of animals your shelter handles.
        </CardDescription>
        <CardAction>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusCircle className="size-4 mr-2" />
                Add Species
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Add Species</DialogTitle>
                <DialogDescription>
                  Create a new species. Click create when you&apos;re done.
                </DialogDescription>
              </DialogHeader>
              <SpeciesForm onFormSubmit={() => setIsAddDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        {species.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {species.map((s) => (
              <div
                key={s.id}
                className={clsx(
                  "flex items-center gap-1 rounded-md border pl-2.5 pr-1 py-0.5",
                  s.deletedAt && "opacity-50 border-dashed",
                )}
              >
                <span className="text-sm font-medium">{s.name}</span>
                {s.deletedAt && (
                  <Badge
                    variant="destructive"
                    className="ml-1 text-[10px] px-1 py-0"
                  >
                    Deleted
                  </Badge>
                )}
                <SpeciesActions species={s} />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground text-sm">
              No species have been created yet.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setIsAddDialogOpen(true)}
            >
              <PlusCircle className="size-4 mr-2" />
              Add Species
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};