"use client";

import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { MoreHorizontal, PlusCircle } from "lucide-react";
import type { UnitModel } from "@/prisma/generated/models/Unit";
import { LocationWithUnits } from "@/app/lib/data/locations/locations.data";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
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
import { LocationForm } from "./location-form";
import { UnitForm } from "./unit-form";
import {
  deleteLocation,
  restoreLocation,
  deleteUnit,
  restoreUnit,
} from "@/app/lib/actions/locations.actions";
import { toast } from "sonner";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";

const locationStatusOptions = [
  { value: "active", label: "Active" },
  { value: "deleted", label: "Deleted" },
];

function LocationActions({ location }: { location: LocationWithUnits }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onSoftDelete = () => {
    startTransition(() => {
      deleteLocation(location.id).then((data) => {
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
      restoreLocation(location.id).then((data) => {
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
          {location.deletedAt ? (
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
          <DialogTitle>Edit Location</DialogTitle>
          <DialogDescription>
            Update the name or type for this location. Click update when
            you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <LocationForm
          onFormSubmit={() => setIsDialogOpen(false)}
          location={location}
        />
      </DialogContent>
    </Dialog>
  );
}

function UnitActions({ unit, locationId }: { unit: UnitModel; locationId: string }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onSoftDelete = () => {
    startTransition(() => {
      deleteUnit(unit.id).then((data) => {
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
      restoreUnit(unit.id).then((data) => {
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
          {unit.deletedAt ? (
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
          <DialogTitle>Edit Unit</DialogTitle>
          <DialogDescription>
            Update the name or capacity for this unit. Click update when
            you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <UnitForm
          onFormSubmit={() => setIsDialogOpen(false)}
          locationId={locationId}
          unit={unit}
        />
      </DialogContent>
    </Dialog>
  );
}

function LocationBlock({ location }: { location: LocationWithUnits }) {
  const [isAddUnitOpen, setIsAddUnitOpen] = useState(false);

  return (
    <div
      className={clsx(
        "border rounded-lg p-4 bg-card",
        location.deletedAt && "opacity-50 border-dashed",
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-foreground">{location.name}</h4>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {formatSingleEnumOption(location.type)}
          </Badge>
          {location.deletedAt && (
            <Badge
              variant="destructive"
              className="text-[10px] px-1 py-0"
            >
              Deleted
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Dialog open={isAddUnitOpen} onOpenChange={setIsAddUnitOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 disabled:pointer-events-auto disabled:cursor-not-allowed"
                disabled={!!location.deletedAt}
                title={
                  location.deletedAt
                    ? "Restore this location before adding units."
                    : undefined
                }
              >
                <PlusCircle className="size-4 mr-1" />
                Add Unit
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Add Unit</DialogTitle>
                <DialogDescription>
                  Create a new unit under {location.name}. Click create when
                  you&apos;re done.
                </DialogDescription>
              </DialogHeader>
              <UnitForm
                onFormSubmit={() => setIsAddUnitOpen(false)}
                locationId={location.id}
              />
            </DialogContent>
          </Dialog>
          <LocationActions location={location} />
        </div>
      </div>

      {location.units.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {location.units.map((unit) => (
            <div
              key={unit.id}
              className={clsx(
                "flex items-center gap-1 rounded-md border pl-2.5 pr-1 py-0.5",
                unit.deletedAt && "opacity-50 border-dashed",
              )}
            >
              <span className="text-sm font-medium">
                {unit.name} · cap {unit.capacity}
              </span>
              {unit.deletedAt && (
                <Badge
                  variant="destructive"
                  className="ml-1 text-[10px] px-1 py-0"
                >
                  Deleted
                </Badge>
              )}
              <UnitActions unit={unit} locationId={location.id} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>No units yet.</span>
          {!location.deletedAt && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => setIsAddUnitOpen(true)}
            >
              <PlusCircle className="size-4 mr-1" />
              Add Unit
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  locations: LocationWithUnits[];
}

export const LocationsSection = ({ locations }: Props) => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Locations</CardTitle>
        <CardDescription>
          Manage the kennel locations and the units within each one.
        </CardDescription>
        <CardAction>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusCircle className="size-4 mr-2" />
                Add Location
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Add Location</DialogTitle>
                <DialogDescription>
                  Create a new location. Click create when you&apos;re done.
                </DialogDescription>
              </DialogHeader>
              <LocationForm onFormSubmit={() => setIsAddDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </CardAction>

        <div className="mt-4 flex flex-row flex-wrap items-center gap-3">
          <ServerSideFacetedFilter
            title="Status"
            paramKey="status"
            options={locationStatusOptions}
          />
        </div>
      </CardHeader>
      <CardContent>
        {locations.length > 0 ? (
          <div className="space-y-4">
            {locations.map((location) => (
              <LocationBlock key={location.id} location={location} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground text-sm">
              No locations have been created yet.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setIsAddDialogOpen(true)}
            >
              <PlusCircle className="size-4 mr-2" />
              Add Location
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
