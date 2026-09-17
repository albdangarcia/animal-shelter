import Link from "next/link";
import { PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface FosterProfileEmptyStateProps {
  personId: string;
  canManage: boolean;
}

export function FosterProfileEmptyState({
  personId,
  canManage,
}: FosterProfileEmptyStateProps) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Fostering</CardTitle>
        <CardDescription>
          Foster caregiving profile, roster status, and placement history for
          this person.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4 py-12 px-6 text-center border-2 border-dashed rounded-lg">
          <PawPrint className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground text-sm max-w-sm">
            They have no foster profile yet. Approve a foster application to
            create one, or add them directly.
          </p>
          {canManage && (
            <Button asChild size="sm">
              <Link
                href={`/dashboard/fosters/new?personId=${personId}&returnTo=/dashboard/people-directory/${personId}/fostering`}
              >
                Add as Foster
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
