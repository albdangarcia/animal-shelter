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
  PersonAnimalHistoryEntry,
  PersonAnimalHistoryRole,
} from "@/app/lib/data/people-directory/person-animal-history.data";

export const historyRoleColors: Record<PersonAnimalHistoryRole, string> = {
  SURRENDERER: "bg-amber-100 text-amber-800 border-amber-200",
  FINDER: "bg-blue-100 text-blue-800 border-blue-200",
  OWNER_RECLAIMED: "bg-purple-100 text-purple-800 border-purple-200",
  APPLICANT: "bg-green-100 text-green-800 border-green-200",
  FOSTER_CARER: "bg-teal-100 text-teal-800 border-teal-200",
};

const INITIAL_DISPLAY_COUNT = 10;

interface Props {
  history: PersonAnimalHistoryEntry[];
}

const PersonAnimalHistory = ({ history }: Props) => {
  const [showAll, setShowAll] = useState(false);

  const visibleHistory = showAll
    ? history
    : history.slice(0, INITIAL_DISPLAY_COUNT);

  const hasMore = history.length > INITIAL_DISPLAY_COUNT;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Animal History</CardTitle>
        <CardDescription>
          Animals this person has been involved with, as a surrenderer, finder,
          owner, applicant, or foster carer.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {visibleHistory.length > 0 ? (
            visibleHistory.map((entry, index) => {
              const firstImage = entry.animal.animalImages?.[0]?.url;

              return (
                <div
                  key={`${entry.role}-${entry.animal.id}-${index}`}
                  className="border rounded-lg p-4 relative"
                >
                  <div className="flex items-start gap-4">
                    <div className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-secondary">
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
                            historyRoleColors[entry.role],
                          )}
                        >
                          {formatSingleEnumOption(entry.role)}
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

                      {entry.role === "APPLICANT" &&
                        entry.applicationStatus && (
                          <p className="text-sm text-muted-foreground mt-2">
                            Application status:{" "}
                            <span className="font-medium text-foreground">
                              {formatSingleEnumOption(entry.applicationStatus)}
                            </span>
                          </p>
                        )}

                      <div className="text-xs text-gray-500 mt-3">
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
                          <span>Currently fostering</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center text-gray-500 py-12 border-2 border-dashed rounded-lg">
              <p className="font-semibold text-lg">No Animal History Found</p>

              <p className="text-sm mt-1">
                This person has no recorded history with animals.
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

export default PersonAnimalHistory;
