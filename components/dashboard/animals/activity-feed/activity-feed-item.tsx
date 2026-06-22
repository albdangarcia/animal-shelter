"use client";

import React, { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  FileText,
  Camera,
  ClipboardList,
  LogIn,
  LogOut,
  Pencil,
  HeartPulse,
  PackagePlus,
  ArrowRightLeft,
  LucideProps,
} from "lucide-react";
import { AnimalActivityType } from "@prisma/client";
import { AnimalActivityLogPayload } from "@/app/lib/data/animals/animal-activity.data";
import { formatTimeAgo } from "@/app/lib/utils/date-utils";

const getInitials = (name: string) => {
  if (!name) return "?";
  const names = name.split(" ");
  const initials = names.map((n) => n[0]).join("");
  return initials.substring(0, 2).toUpperCase();
};

const activityConfig: Record<
  AnimalActivityType,
  {
    icon: React.ComponentType<LucideProps>;
    text: string;
  }
> = {
  [AnimalActivityType.FIELD_UPDATE]: {
    icon: Pencil,
    text: "updated pet details",
  },
  [AnimalActivityType.NOTE_ADDED]: { icon: FileText, text: "added a new note" },
  [AnimalActivityType.PHOTO_UPLOADED]: {
    icon: Camera,
    text: "uploaded a new photo",
  },
  [AnimalActivityType.INTAKE_PROCESSED]: {
    icon: LogIn,
    text: "was processed for intake",
  },
  [AnimalActivityType.OUTCOME_PROCESSED]: {
    icon: LogOut,
    text: "was processed for outcome",
  },
  [AnimalActivityType.MEDICAL_RECORD_ADDED]: {
    icon: HeartPulse,
    text: "had a medical record added",
  },
  [AnimalActivityType.CREATED]: {
    icon: PackagePlus,
    text: "was created in the system",
  },
  [AnimalActivityType.STATUS_CHANGE]: {
    icon: ArrowRightLeft,
    text: "had a status change",
  },
  [AnimalActivityType.ASSESSMENT_COMPLETED]: {
    icon: ClipboardList,
    text: "had an assessment completed",
  },
  [AnimalActivityType.TASK_CREATED]: {
    icon: ClipboardList,
    text: "had a task created",
  },
  [AnimalActivityType.TASK_STATUS_CHANGED]: {
    icon: ClipboardList,
    text: "had a task status updated",
  },
};

const colorClasses = [
  "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300",
  "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300",
  "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-300",
  "bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-300",
  "bg-pink-100 text-pink-600 dark:bg-pink-950 dark:text-pink-300",
  "bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-300",
];

const getAvatarColor = (initials: string) => {
  if (!initials || initials === "?")
    return "bg-muted text-muted-foreground";
  const charCodeSum = initials.charCodeAt(0) + (initials.charCodeAt(1) || 0);
  return colorClasses[charCodeSum % colorClasses.length];
};

interface ActivityFeedItemProps {
  activity: AnimalActivityLogPayload;
}

export default function ActivityFeedItem({ activity }: ActivityFeedItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const config = activityConfig[activity.activityType] || {
    icon: Pencil,
    text: "performed an unknown action",
  };
  const Icon = config.icon;

  const canExpand = !!activity.changeSummary;

  const initials = getInitials(activity.changedBy.name);
  const avatarColor = getAvatarColor(initials);
  const avatarUrl = activity.changedBy.user?.image;

  return (
    <div className="relative flex items-start space-x-4">
      {/* Icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted ring-4 ring-card">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* Activity Details */}
      <div className="min-w-0 grow">
        <div className="flex flex-wrap items-center text-sm text-muted-foreground">
          <Avatar className="mr-2 h-6 w-6 shrink-0">
            {avatarUrl && (
              <AvatarImage src={avatarUrl} alt={activity.changedBy.name} />
            )}
            <AvatarFallback className={`${avatarColor} text-xs font-semibold`}>
              {initials}
            </AvatarFallback>
          </Avatar>

          <p className="truncate">
            <span className="font-semibold text-foreground">
              {activity.changedBy.name}
            </span>{" "}
            {config.text}
          </p>

          <span className="ml-2 text-muted-foreground/70 whitespace-nowrap">
            &bull; {formatTimeAgo(activity.changedAt)}
          </span>
        </div>

        {/* This is the collapsible/expandable section */}
        <div className="mt-2">
          {canExpand && (
            <>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
              >
                {isExpanded ? "Hide details" : "Show details"}
              </button>
              {isExpanded && (
                <div className="details-box mt-2 p-3 bg-muted/50 border rounded-md">
                  <pre className="text-sm text-foreground whitespace-pre-wrap font-sans">
                    {activity.changeSummary}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}