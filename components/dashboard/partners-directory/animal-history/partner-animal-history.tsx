"use client";

import React, { useState } from "react";
import { clsx } from "clsx";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { formatDateOrNA, formatTimeAgo } from "@/app/lib/utils/date-utils";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import Link from "next/link";
import Image from "next/image";
import {
  PartnerAnimalHistoryEntry,
  PartnerTransferDirection,
} from "@/app/lib/data/partners-directory/partner-animal-history.data";

export const transferDirectionColors: Record<PartnerTransferDirection, string> =
  {
    TRANSFER_IN:
      "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900",
    TRANSFER_OUT:
      "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900",
  };

const transferDirectionLabels: Record<PartnerTransferDirection, string> = {
  TRANSFER_IN: "Received From",
  TRANSFER_OUT: "Transferred To",
};

const INITIAL_DISPLAY_COUNT = 10;

interface Props {
  history: PartnerAnimalHistoryEntry[];
}

const PartnerAnimalHistory = ({ history }: Props) => {
  const [showAll, setShowAll] = useState(false);

  const visibleHistory = showAll
    ? history
    : history.slice(0, INITIAL_DISPLAY_COUNT);

  const hasMore = history.length > INITIAL_DISPLAY_COUNT;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Animal History
        </CardTitle>
        <CardDescription>
          Animals received from or transferred to this partner.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {visibleHistory.length > 0 ? (
            visibleHistory.map((entry, index) => {
              const firstImage = entry.animal.animalImages?.[0]?.url;
              const subtype =
                entry.direction === "TRANSFER_IN"
                  ? entry.intakeType
                  : entry.outcomeType;

              return (
                <div
                  key={`${entry.direction}-${entry.animal.id}-${index}`}
                  className="border rounded-lg p-4 relative"
                >
                  <div className="flex items-start gap-4">
                    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-secondary">
                      {firstImage ? (
                        <Image
                          src={firstImage}
                          alt={`Photo of ${entry.animal.name}`}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="text-2xl">🐾</span>
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge
                          variant="outline"
                          className={clsx(
                            "font-semibold",
                            transferDirectionColors[entry.direction],
                          )}
                        >
                          {transferDirectionLabels[entry.direction]}
                        </Badge>
                        <Link
                          href={`/dashboard/animals/${entry.animal.id}`}
                          className="font-medium hover:underline"
                        >
                          {entry.animal.name}
                        </Link>
                        <span className="text-sm text-muted-foreground">
                          {entry.animal.species.name}
                        </span>
                        <Badge variant="secondary">
                          {formatSingleEnumOption(entry.animal.listingStatus)}
                        </Badge>
                      </div>

                      {subtype && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Type:{" "}
                          <span className="font-medium text-foreground">
                            {formatSingleEnumOption(subtype)}
                          </span>
                        </p>
                      )}

                      <div className="text-xs text-muted-foreground mt-3">
                        {entry.date ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="underline decoration-dotted cursor-help">
                                {formatTimeAgo(entry.date)}
                              </span>
                            </TooltipTrigger>

                            <TooltipContent>
                              {formatDateOrNA(entry.date)}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span>—</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center text-muted-foreground py-12 border-2 border-dashed rounded-lg">
              <p className="font-semibold text-lg">No Animal History Found</p>

              <p className="text-sm mt-1">
                No animals have been received from or transferred to this
                partner.
              </p>
            </div>
          )}
        </div>
      </CardContent>

      {hasMore && (
        <CardFooter className="justify-center">
          <Button variant="outline" onClick={() => setShowAll((prev) => !prev)}>
            {showAll
              ? "Show Less"
              : `Show ${history.length - INITIAL_DISPLAY_COUNT} More`}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};

export default PartnerAnimalHistory;
