import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MedicalSettingsNav } from "@/components/dashboard/settings/medical/medical-settings-nav";

const Loading = () => {
  return (
    <div className="flex flex-col gap-4">
      <MedicalSettingsNav />
      <Card className="@container/card">
        <CardHeader>
          <CardTitle className="@[650px]/card:text-xl">Dose Times</CardTitle>
          <CardDescription>
            When each dose slot ends on the shelter&apos;s clock. A slot with
            no dose recorded by then reads as missed. A change applies to every
            slot from then on; doses already recorded keep their slot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((slot) => (
              <div key={slot} className="rounded-lg border p-4 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Loading;
