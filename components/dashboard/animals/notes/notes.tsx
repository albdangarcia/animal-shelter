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
import { NoteCategory } from "@prisma/client";
import { NotePayload } from "@/app/lib/data/animals/animal-note.data";
import { noteCategoryOptions } from "@/app/lib/utils/enum-formatter";
import { formatDateOrNA, formatTimeAgo } from "@/app/lib/utils/date-utils";
import { NoteForm } from "./note-form";
import { NoteActions } from "./note-actions";
import { SimplePagination } from "../../../simple-pagination";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { ServerSideSort } from "@/components/table-common/server-side-sort";
import { ServerSideSwitch } from "@/components/table-common/server-side-switch";

export const noteCategoryColors: Record<NoteCategory, string> = {
  [NoteCategory.BEHAVIORAL]: "bg-blue-100 text-blue-800 border-blue-200",
  [NoteCategory.MEDICAL]: "bg-red-100 text-red-800 border-red-200",
  [NoteCategory.FEEDING]: "bg-amber-100 text-amber-800 border-amber-200",
  [NoteCategory.GENERAL]: "bg-gray-100 text-gray-800 border-gray-200",
  [NoteCategory.ADOPTION_UPDATE]:
    "bg-purple-100 text-purple-800 border-purple-200",
  [NoteCategory.FOSTER_UPDATE]: "bg-green-100 text-green-800 border-green-200",
};

interface Props {
  notes: NotePayload[];
  totalPages: number;
  animalId: string;
}

const AnimalNotes = ({ notes, totalPages, animalId }: Props) => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <>
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Animal Notes</CardTitle>

          <CardDescription>
            Keep track of important notes about this animal.
          </CardDescription>

          <CardAction>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-8">
                  Add Note
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
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
              <ServerSideSort
                paramKey="sort"
                placeholder="Select order"
                options={[
                  { label: "Newest First", value: "createdAt.desc" },
                  { label: "Oldest First", value: "createdAt.asc" },
                ]}
              />
            </div>

            <ServerSideSwitch paramKey="showDeleted" label="Show Deleted" />
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
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <NoteActions note={note} animalId={animalId} />
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className={clsx(
                            "font-semibold",
                            noteCategoryColors[note.category]
                          )}
                        >
                          {note.category}
                        </Badge>
                        {note.deletedAt && (
                          <Badge variant="destructive">Deleted</Badge>
                        )}
                      </div>

                      <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                        {note.content}
                      </p>

                      <div className="text-xs text-gray-500 mt-3">
                        <span>{note.author?.name ?? "Unknown User"}</span> &middot;{" "}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="underline decoration-dotted cursor-help">
                              {formatTimeAgo(note.createdAt)}
                            </span>
                          </TooltipTrigger>

                          <TooltipContent>
                            {formatDateOrNA(note.createdAt)}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-gray-500 py-12 border-2 border-dashed rounded-lg">
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
