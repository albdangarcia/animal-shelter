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
          <CardTitle className="@[650px]/card:text-xl">
            Medical Protocols
          </CardTitle>
          <CardDescription>
            The care an animal is scheduled when it arrives, by its species
            and its age on the intake day. A change applies to animals
            admitted afterwards; care already scheduled stays as it was.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[0, 1].map((section) => (
              <div key={section} className="border rounded-lg p-4 space-y-3">
                <Skeleton className="h-5 w-24" />
                {[0, 1].map((row) => (
                  <div key={row} className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-full max-w-md" />
                    <Skeleton className="h-4 w-full max-w-sm" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Loading;
