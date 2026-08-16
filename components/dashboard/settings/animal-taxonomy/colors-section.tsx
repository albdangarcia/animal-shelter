"use client";

import { useState } from "react";
import type { ColorModel } from "@/prisma/generated/models/Color";
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
import { ColorForm } from "./color-form";
import { ColorActions } from "./color-actions";

interface Props {
  colors: ColorModel[];
}

export const ColorsSection = ({ colors }: Props) => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Colors</CardTitle>
        <CardDescription>
          Manage the colors used to describe animals&apos; coats and markings.
        </CardDescription>
        <CardAction>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusCircle className="size-4 mr-2" />
                Add Color
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Add Color</DialogTitle>
                <DialogDescription>
                  Create a new color for the catalog. Click create when
                  you&apos;re done.
                </DialogDescription>
              </DialogHeader>
              <ColorForm onFormSubmit={() => setIsAddDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        {colors.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {colors.map((color) => (
              <div
                key={color.id}
                className={clsx(
                  "flex items-center gap-1 rounded-md border pl-2.5 pr-1 py-0.5",
                  color.deletedAt && "opacity-50 border-dashed",
                )}
              >
                <span className="text-sm font-medium">{color.name}</span>
                {color.deletedAt && (
                  <Badge
                    variant="destructive"
                    className="ml-1 text-[10px] px-1 py-0"
                  >
                    Deleted
                  </Badge>
                )}
                <ColorActions color={color} />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground text-sm">
              No colors have been created yet.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setIsAddDialogOpen(true)}
            >
              <PlusCircle className="size-4 mr-2" />
              Add Color
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};