"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NoteCategory } from "@/prisma/generated/enums";
import { NotePayload } from "@/app/lib/data/animals/animal-note.data";
import { noteCategoryOptions } from "@/app/lib/utils/enum-formatter";
import { formatDateOrNA } from "@/app/lib/utils/date-utils";
import { TimeAgo } from "@/components/common/time-ago";
import { NoteForm } from "./note-form";
import { NoteActions } from "./note-actions";
import { SimplePagination } from "../../../simple-pagination";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { ServerSideSort } from "@/components/table-common/server-side-sort";

export const noteCategoryColors: Record<NoteCategory, string> = {
  [NoteCategory.BEHAVIORAL]:
    "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900",
  [NoteCategory.MEDICAL]:
    "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
  [NoteCategory.FEEDING]:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  [NoteCategory.GENERAL]:
    "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
  [NoteCategory.ADOPTION_UPDATE]:
    "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-900",
  [NoteCategory.FOSTER_UPDATE]:
    "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900",
};

const noteStatusOptions = [
  { value: "active", label: "Active" },
  { value: "deleted", label: "Deleted" },
];

interface Props {
  notes: NotePayload[];
  totalPages: number;
  animalId: string;
  canManage: boolean;
}

const AnimalNotes = ({ notes, totalPages, animalId, canManage }: Props) => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <>
      <Card className="@container/card">
        <CardHeader>
          <CardTitle className="@[650px]/card:text-xl">
            Animal Notes
          </CardTitle>

          <CardDescription>
            Keep track of important notes about this animal.
          </CardDescription>

          <CardAction>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant={canManage ? "default" : "outline"}
                  size="sm"
                  className="disabled:pointer-events-auto disabled:cursor-not-allowed"
                  disabled={!canManage}
                >
                  Add Note
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-150">
                <DialogHeader>
                  <DialogTitle>Add Note</DialogTitle>
                  <DialogDescription>
                    Add a new note for this animal. Click create note when
                    you&apos;re done.
                  </DialogDescription>
                </DialogHeader>
                <NoteForm
                  animalId={animalId}
                  onFormSubmit={() => setIsAddDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </CardAction>

          {/* Filter and Sort Controls */}
          <div className="mt-4 flex flex-row flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <ServerSideFacetedFilter
                title="Category"
                paramKey="category"
                options={noteCategoryOptions}
              />
            </div>

            <div className="flex items-center gap-2">
              <ServerSideFacetedFilter
                title="Status"
                paramKey="status"
                options={noteStatusOptions}
              />
            </div>

            <div className="flex items-center gap-2">
              <ServerSideSort
                paramKey="sort"
                placeholder="Select order"
                options={[
                  { label: "Newest First", value: "createdAt.desc" },
                  { label: "Oldest First", value: "createdAt.asc" },
                ]}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            {notes.length > 0 ? (
              notes.map((note) => (
                <div
                  key={note.id}
                  className="border rounded-lg p-4 relative group"
                >
                  {canManage && (
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <NoteActions note={note} animalId={animalId} />
                    </div>
                  )}

                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className={clsx(
                            "font-semibold",
                            noteCategoryColors[note.category],
                          )}
                        >
                          {note.category}
                        </Badge>
                        {note.deletedAt && (
                          <Badge variant="destructive">Deleted</Badge>
                        )}
                      </div>

                      <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">
                        {note.content}
                      </p>

                      <div className="text-xs text-muted-foreground mt-3">
                        <span>{note.author?.name ?? "Unknown User"}</span>{" "}
                        &middot;{" "}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <TimeAgo
                              date={note.createdAt}
                              className="underline decoration-dotted cursor-help"
                            />
                          </TooltipTrigger>

                          <TooltipContent>
                            {formatDateOrNA(note.createdAt)}
                          </TooltipContent>
                        </Tooltip>
                      </div>

                      {note.lastEditedAt && (
                        <div className="text-xs text-muted-foreground mt-1">
                          <span>
                            edited by{" "}
                            {note.lastEditedBy?.name ?? "Unknown User"}
                          </span>{" "}
                          &middot;{" "}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <TimeAgo
                                date={note.lastEditedAt}
                                className="underline decoration-dotted cursor-help"
                              />
                            </TooltipTrigger>

                            <TooltipContent>
                              {formatDateOrNA(note.lastEditedAt)}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-muted-foreground py-12 border-2 border-dashed rounded-lg">
                <p className="font-semibold text-lg">No Matching Notes Found</p>

                <p className="text-sm mt-1">
                  Try adjusting your filters or creating a new note.
                </p>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <SimplePagination totalPages={totalPages} />
        </CardFooter>
      </Card>
    </>
  );
};

export default AnimalNotes;
