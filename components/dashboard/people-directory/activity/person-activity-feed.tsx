"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PersonActivityEntry } from "@/app/lib/data/people-directory/person-activity.data";
import PersonActivityFeedItem from "./person-activity-feed-item";

const INITIAL_DISPLAY_COUNT = 10;

interface Props {
  activity: PersonActivityEntry[];
}

const PersonActivityFeed = ({ activity = [] }: Props) => {
  const [showAll, setShowAll] = useState(false);
  const params = useParams();
  const personId =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
        ? params.id[0]
        : undefined;

  const visibleActivity = showAll
    ? activity
    : activity.slice(0, INITIAL_DISPLAY_COUNT);

  const hasMore = activity.length > INITIAL_DISPLAY_COUNT;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Staff Activity
        </CardTitle>
        <CardDescription>
          Actions this person performed on animals — intakes and outcomes
          processed, tasks created or assigned, and animal notes written.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {visibleActivity.length > 0 ? (
          <div className="flow-root">
            <ul className="-mb-8">
              {visibleActivity.map((entry, index) => (
                <li
                  key={`${entry.kind}-${entry.animal.id}-${entry.date.toISOString()}-${index}`}
                >
                  <div className="relative pb-8">
                    {index !== visibleActivity.length - 1 && (
                      <span
                        className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-border"
                        aria-hidden="true"
                      />
                    )}
                    <PersonActivityFeedItem entry={entry} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-12 border-2 border-dashed rounded-lg">
            <p className="font-semibold text-lg">No Activity Found</p>
            <p className="text-sm mt-1">
              Notes written about this person are on the{" "}
              {personId ? (
                <Link
                  href={`/dashboard/people-directory/${personId}/notes`}
                  className="font-medium underline hover:text-foreground"
                >
                  Notes
                </Link>
              ) : (
                "Notes"
              )}{" "}
              tab, and their involvement with animals is on the{" "}
              {personId ? (
                <Link
                  href={`/dashboard/people-directory/${personId}/history`}
                  className="font-medium underline hover:text-foreground"
                >
                  Animal History
                </Link>
              ) : (
                "Animal History"
              )}{" "}
              tab.
            </p>
          </div>
        )}
      </CardContent>
      {hasMore && (
        <CardFooter className="justify-center">
          <Button variant="outline" onClick={() => setShowAll((prev) => !prev)}>
            {showAll
              ? "Show Less"
              : `Show ${activity.length - INITIAL_DISPLAY_COUNT} More`}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};

export default PersonActivityFeed;
