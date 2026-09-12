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
import { PartnerNotePayload } from "@/app/lib/types";
import { formatDateOrNA } from "@/app/lib/utils/date-utils";
import { TimeAgo } from "@/components/common/time-ago";
import { PartnerNoteForm } from "./partner-note-form";
import { SimplePagination } from "../../../simple-pagination";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { ServerSideSort } from "@/components/table-common/server-side-sort";
import { PartnerNoteActions } from "@/components/dashboard/partners-directory/notes/partner-note-actions"

const noteStatusOptions = [
  { value: "active", label: "Active" },
  { value: "deleted", label: "Deleted" },
];

interface Props {
  notes: PartnerNotePayload[];
  totalPages: number;
  totalRows: number;
  partnerId: string;
  canManage: boolean;
}

const PartnerNotes = ({ notes, totalPages, partnerId, canManage }: Props) => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Partner Notes</CardTitle>
        <CardDescription>
          Keep track of important notes about this partner.
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
                  Add a new note for this partner. Click create note when
                  you&apos;re done.
                </DialogDescription>
              </DialogHeader>
              <PartnerNoteForm
                partnerId={partnerId}
                onFormSubmit={() => setIsAddDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </CardAction>

        {/* Filter and Sort Controls */}
        <div className="mt-4 flex flex-row flex-wrap items-center gap-3">
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
                className={clsx(
                  "border rounded-lg p-4 relative group",
                  note.deletedAt && "opacity-60",
                )}
              >
                {canManage && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <PartnerNoteActions note={note} partnerId={partnerId} />
                  </div>
                )}

                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    {note.deletedAt && (
                      <div className="mb-2">
                        <Badge variant="destructive">Deleted</Badge>
                      </div>
                    )}

                    <p className="text-sm text-foreground whitespace-pre-wrap">
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
              <p className="font-semibold text-lg">No Notes Found</p>

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
  );
};

export default PartnerNotes;
