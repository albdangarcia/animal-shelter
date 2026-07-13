import Link from "next/link";
import { PawPrint } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchMyFosterAnimals } from "@/app/lib/data/fosters/my-foster-animals.data";
import { FosterAnimalCard } from "@/components/dashboard/my-foster-animals/foster-animal-card";
import { PastFostersCard } from "@/components/dashboard/my-foster-animals/past-fosters-card";

const Page = async () => {
  return (
    <Authorize
      permission={AppPermissions.MY_FOSTER_ANIMALS_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent />
    </Authorize>
  );
};

const PageContent = async () => {
  const { hasFosterProfile, currentPlacements, pastPlacements } =
    await fetchMyFosterAnimals();

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Card className="@container/card">
        <CardHeader>
          <CardTitle className="@[650px]/card:text-xl">
            My foster animals
          </CardTitle>
          <CardDescription>
            Animals currently placed with you as a foster.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasFosterProfile ? (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <PawPrint className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground text-sm max-w-sm">
                You&apos;re not on the foster roster yet. Submit a foster
                application to get started.
              </p>
              <Button asChild size="sm">
                <Link href="/dashboard/my-foster-application">
                  Apply to Foster
                </Link>
              </Button>
            </div>
          ) : currentPlacements.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">
              You&apos;re not currently fostering any animals.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 @2xl/card:grid-cols-2">
              {currentPlacements.map((placement) => (
                <FosterAnimalCard key={placement.id} placement={placement} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PastFostersCard placements={pastPlacements} />
    </div>
  );
};

export default Page;
