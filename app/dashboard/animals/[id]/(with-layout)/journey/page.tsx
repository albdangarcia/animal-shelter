import { IDParamType } from "@/app/lib/types";
import AnimalJourney from "@/components/dashboard/animals/journey/animal-journey";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.ANIMAL_JOURNEY_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { id: animalId } = await params;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Journey
        </CardTitle>
        <CardDescription>
          A timeline of significant events in the animal&apos;s story at the
          shelter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AnimalJourney animalId={animalId} />
      </CardContent>
    </Card>
  );
};

export default Page;
