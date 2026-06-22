import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const PartnerContactsSkeleton = () => {
  return (
    <Card className="@container/card">
      <CardHeader className="relative">
        <CardTitle className="@[650px]/card:text-xl">
          Contacts
        </CardTitle>
        <CardDescription>
          People linked to this partner as points of contact.
        </CardDescription>

        {/* Add Contact button */}
        <div className="absolute right-6 top-6">
          <Skeleton className="h-8 w-28" />
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {[0, 1, 2].map((contact) => (
            <div key={contact} className="border rounded-lg p-4">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <Skeleton className="h-16 w-16 shrink-0 rounded-lg" />

                <div className="flex-1">
                  {/* Name + badges */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-20 rounded-md" />
                  </div>
                  {/* Role */}
                  <Skeleton className="h-3 w-24 mt-2" />
                  {/* Email + phone line */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default PartnerContactsSkeleton;
