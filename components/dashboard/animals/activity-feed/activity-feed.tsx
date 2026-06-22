"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SimplePagination } from "../../../simple-pagination";
import { AnimalActivityLogPayload } from "@/app/lib/data/animals/animal-activity.data";
import ActivityFeedItem from "./activity-feed-item";

interface Props {
  activityLogs: AnimalActivityLogPayload[];
  totalPages: number;
}

const ActivityFeed = ({ activityLogs = [], totalPages }: Props) => {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Activity
        </CardTitle>
        <CardDescription>
          This page displays the most recent activity logs for this animal,
          including who made the change and a summary of the action.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {activityLogs.length > 0 ? (
          <div className="flow-root">
            <ul className="-mb-8">
              {activityLogs.map((activity, index) => (
                <li key={activity.id}>
                  <div className="relative pb-8">
                    {index !== activityLogs.length - 1 && (
                      <span
                        className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-border"
                        aria-hidden="true"
                      />
                    )}
                    <ActivityFeedItem activity={activity} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-12 border-2 border-dashed rounded-lg">
            <p className="font-semibold text-lg">No Activity Found</p>
            <p className="text-sm mt-1">
              There is no activity history for this animal yet.
            </p>
          </div>
        )}
      </CardContent>
      {totalPages > 1 && (
        <CardFooter>
          <SimplePagination totalPages={totalPages} />
        </CardFooter>
      )}
    </Card>
  );
};

export default ActivityFeed;
