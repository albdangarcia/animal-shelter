"use client";

import { useState } from "react";
import type { CharacteristicCategory } from "@/prisma/generated/enums";
import type { CharacteristicModel } from "@/prisma/generated/models/Characteristic";
import { clsx } from "clsx";
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
import { PlusCircle } from "lucide-react";
import {
  CATEGORIES,
  CATEGORY_KEYS,
} from "@/app/lib/constants/characteristic-categories";
import { CharacteristicForm } from "./characteristic-form";
import { CharacteristicActions } from "./characteristic-actions";

interface Props {
  characteristics: CharacteristicModel[];
}

const CharacteristicsCatalog = ({ characteristics }: Props) => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const groupedCharacteristics = characteristics.reduce
    <Record<CharacteristicCategory, CharacteristicModel[]>
    >(
      (acc, char) => {
        (acc[char.category] = acc[char.category] || []).push(char);
        return acc;
      },
      {} as Record<CharacteristicCategory, CharacteristicModel[]>,
    );

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Characteristics
        </CardTitle>
        <CardDescription>
          Manage the catalog of tags used to describe animals across the
          shelter.
        </CardDescription>
        <CardAction>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusCircle className="size-4 mr-2" />
                Add Characteristic
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Add Characteristic</DialogTitle>
                <DialogDescription>
                  Create a new characteristic for the catalog. Click create when
                  you&apos;re done.
                </DialogDescription>
              </DialogHeader>
              <CharacteristicForm
                onFormSubmit={() => setIsAddDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {CATEGORY_KEYS.map((key) => {
            const Icon = CATEGORIES[key].icon;
            const characteristicsForCategory = groupedCharacteristics[key];
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
                      <div
                        key={char.id}
                        className={clsx(
                          "flex items-center gap-1 rounded-md border pl-2.5 pr-1 py-0.5",
                          char.deletedAt
                            ? "opacity-50 border-dashed"
                            : CATEGORIES[char.category]?.color,
                        )}
                      >
                        <span className="text-sm font-medium">
                          {char.name}
                        </span>
                        {char.deletedAt && (
                          <Badge
                            variant="destructive"
                            className="ml-1 text-[10px] px-1 py-0"
                          >
                            Deleted
                          </Badge>
                        )}
                        <CharacteristicActions characteristic={char} />
                      </div>
                    ))}
                  </div>
                </div>
              )
            );
          })}

          {characteristics.length === 0 && (
            <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg">
              <p className="text-muted-foreground text-sm">
                No characteristics have been created yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setIsAddDialogOpen(true)}
              >
                <PlusCircle className="size-4 mr-2" />
                Add Characteristic
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default CharacteristicsCatalog;