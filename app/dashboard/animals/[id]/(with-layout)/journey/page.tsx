import { IDParamType } from "@/app/lib/types";
import AnimalJourney from "@/components/dashboard/animals/journey/animal-journey";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { HelpLink } from "@/components/dashboard/help/help-link";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.ANIMAL_JOURNEY_READ}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const [{ id: animalId }, help] = await Promise.all([
    params,
    getHelpLinkGuide(PAGE_HELP_GUIDES.animalJourney),
  ]);

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
        {help && (
          <CardAction>
            <HelpLink guide={help} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <AnimalJourney animalId={animalId} />
      </CardContent>
    </Card>
  );
};

export default Page;
