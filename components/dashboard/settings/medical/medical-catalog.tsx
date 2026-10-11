"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { PlusCircle } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MedicalItemKind } from "@/prisma/generated/enums";
import type { MedicalCatalogItem } from "@/app/lib/data/medical-catalog";
import {
  MEDICAL_ITEM_KIND_PLURALS,
  MEDICAL_ROUTE_LABELS,
  formatDose,
} from "@/app/lib/constants/medical";
import { MedicalItemForm } from "./medical-item-form";
import { MedicalItemActions } from "./medical-item-actions";

interface Props {
  items: MedicalCatalogItem[];
  species: { id: string; name: string }[];
}

/** What a row says under its name: who it's for and what it defaults to. */
const describe = (item: MedicalCatalogItem): string[] => {
  const parts = [
    item.species.length > 0
      ? item.species.map((species) => species.name).join(", ")
      : "All species",
  ];
  if (item.manufacturer) parts.push(item.manufacturer);
  if (item.defaultRoute) parts.push(MEDICAL_ROUTE_LABELS[item.defaultRoute]);
  if (item.defaultDoseAmount !== null && item.defaultDoseUnit) {
    parts.push(formatDose(item.defaultDoseAmount, item.defaultDoseUnit));
  }
  if (item.repeatIntervalDays) {
    parts.push(`Repeats every ${item.repeatIntervalDays} days`);
  }
  const liveAnalytes = item.analytes.filter((analyte) => !analyte.retiredAt);
  if (liveAnalytes.length > 0) {
    parts.push(`Reports ${liveAnalytes.map((a) => a.name).join(", ")}`);
  }
  return parts;
};

const MedicalCatalog = ({ items, species }: Props) => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // An item may be limited to a species that has since been retired; it
  // stays tickable on that item so saving the item doesn't drop it.
  const speciesFor = (item?: MedicalCatalogItem) => {
    const extra = (item?.species ?? []).filter(
      (own) => !species.some((option) => option.id === own.id),
    );
    return [...species, ...extra];
  };

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Medical</CardTitle>
        <CardDescription>
          The vaccines, tests and treatments staff pick from when they record
          care. Retired items can&apos;t be picked for new entries; entries
          that already use them keep them.
        </CardDescription>
        <CardAction>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusCircle className="size-4 mr-2" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Item</DialogTitle>
                <DialogDescription>
                  Add a vaccine, test or treatment to the catalog.
                </DialogDescription>
              </DialogHeader>
              <MedicalItemForm
                species={speciesFor()}
                onFormSubmit={() => setIsAddDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Object.values(MedicalItemKind).map((kind) => {
            const ofKind = items.filter((item) => item.kind === kind);
            if (ofKind.length === 0) return null;
            return (
              <section
                key={kind}
                aria-label={MEDICAL_ITEM_KIND_PLURALS[kind]}
                className="border rounded-lg p-4 bg-card"
              >
                <h4 className="font-medium mb-3 text-foreground">
                  {MEDICAL_ITEM_KIND_PLURALS[kind]}
                </h4>
                <ul className="divide-y">
                  {ofKind.map((item) => (
                    <li
                      key={item.id}
                      className={clsx(
                        "flex items-start justify-between gap-2 py-2",
                        item.retiredAt && "opacity-60",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {item.name}
                          </span>
                          {item.isRabies && (
                            <Badge variant="secondary">Rabies</Badge>
                          )}
                          {item.retiredAt && (
                            <Badge variant="outline">Retired</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {describe(item).join(" · ")}
                        </p>
                      </div>
                      <MedicalItemActions
                        item={item}
                        species={speciesFor(item)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {items.length === 0 && (
            <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg">
              <p className="text-muted-foreground text-sm">
                The catalog is empty.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setIsAddDialogOpen(true)}
              >
                <PlusCircle className="size-4 mr-2" />
                Add Item
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default MedicalCatalog;
