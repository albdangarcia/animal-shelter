"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FileText,
  LogIn,
  LogOut,
  ClipboardList,
  ClipboardCheck,
  LucideProps,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PersonActivityEntry } from "@/app/lib/data/people-directory/person-activity.data";
import { formatTimeAgo } from "@/app/lib/utils/date-utils";
import {
  formatSingleEnumOption,
  noteCategoryOptions,
} from "@/app/lib/utils/enum-formatter";

const activityConfig: Record<
  PersonActivityEntry["kind"],
  {
    icon: React.ComponentType<LucideProps>;
    text: string;
  }
> = {
  INTAKE_PROCESSED: {
    icon: LogIn,
    text: "processed an intake for",
  },
  OUTCOME_PROCESSED: {
    icon: LogOut,
    text: "processed an outcome for",
  },
  TASK_CREATED: {
    icon: ClipboardList,
    text: "created a task for",
  },
  TASK_ASSIGNED: {
    icon: ClipboardList,
    text: "was assigned a task for",
  },
  NOTE_AUTHORED: {
    icon: FileText,
    text: "added a note for",
  },
  ASSESSMENT_CONDUCTED: {
    icon: ClipboardCheck,
    text: "conducted an assessment for",
  },
};

interface Props {
  entry: PersonActivityEntry;
}

export default function PersonActivityFeedItem({ entry }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  const config = activityConfig[entry.kind];
  const Icon = config.icon;

  const canExpand =
    entry.kind === "NOTE_AUTHORED" ||
    entry.kind === "ASSESSMENT_CONDUCTED" ||
    entry.kind === "INTAKE_PROCESSED" ||
    entry.kind === "OUTCOME_PROCESSED";

  return (
    <div className="relative flex items-start space-x-4">
      {/* Icon */}
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 ring-4 ring-white">
        <Icon className="h-5 w-5 text-gray-500" />
      </div>

      {/* Activity Details */}
      <div className="min-w-0 flex-grow">
        <div className="flex flex-wrap items-center text-sm text-gray-600">
          <p className="truncate">
            {config.text}{" "}
            <Link
              href={`/dashboard/animals/${entry.animal.id}`}
              className="font-semibold text-gray-900 hover:underline"
            >
              {entry.animal.name}
            </Link>{" "}
            <span className="text-gray-400 capitalize">
              ({entry.animal.species.name})
            </span>
          </p>

          <span className="ml-2 text-gray-400 whitespace-nowrap">
            &bull; {formatTimeAgo(entry.date)}
          </span>
        </div>

        {/* Inline summary for task entries */}
        {(entry.kind === "TASK_CREATED" || entry.kind === "TASK_ASSIGNED") && (
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span className="text-gray-700">{entry.title}</span>
            <Badge variant="outline">
              {formatSingleEnumOption(entry.status)}
            </Badge>
          </div>
        )}

        {/* Collapsible/expandable section */}
        {canExpand && (
          <div className="mt-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              {isExpanded ? "Hide details" : "Show details"}
            </button>
            {isExpanded && (
              <div className="details-box mt-2 p-3 bg-slate-50 border rounded-md text-sm text-gray-700">
                {entry.kind === "INTAKE_PROCESSED" && (
                  <p>Intake type: {formatSingleEnumOption(entry.intakeType)}</p>
                )}

                {entry.kind === "OUTCOME_PROCESSED" && (
                  <p>
                    Outcome type: {formatSingleEnumOption(entry.outcomeType)}
                  </p>
                )}

                {entry.kind === "NOTE_AUTHORED" && (
                  <>
                    <Badge variant="outline" className="mb-2">
                      {noteCategoryOptions.find(
                        (option) => option.value === entry.category,
                      )?.label ?? formatSingleEnumOption(entry.category)}
                    </Badge>
                    <pre className="whitespace-pre-wrap font-sans">
                      {entry.content}
                    </pre>
                  </>
                )}

                {entry.kind === "ASSESSMENT_CONDUCTED" && (
                  <>
                    {entry.overallOutcome && (
                      <p className="mb-1 font-medium">
                        Outcome: {formatSingleEnumOption(entry.overallOutcome)}
                      </p>
                    )}
                    {entry.summary ? (
                      <pre className="whitespace-pre-wrap font-sans">
                        {entry.summary}
                      </pre>
                    ) : (
                      <p className="text-gray-400">No summary provided.</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
