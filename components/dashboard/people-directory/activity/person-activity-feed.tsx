"use client";

import { useState } from "react";
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

  const visibleActivity = showAll
    ? activity
    : activity.slice(0, INITIAL_DISPLAY_COUNT);

  const hasMore = activity.length > INITIAL_DISPLAY_COUNT;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          Recent activity involving this person — tasks, notes, assessments, and
          intake/outcome processing.
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
                        className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200"
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
          <div className="text-center text-gray-500 py-12 border-2 border-dashed rounded-lg">
            <p className="font-semibold text-lg">No Activity Found</p>
            <p className="text-sm mt-1">
              There is no recorded activity for this person yet.
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
