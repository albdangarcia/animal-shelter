import { IDParamType } from "@/app/lib/types";
import PhotoUploader from "@/components/dashboard/animals/photos/photo-uploader";
import { notFound } from "next/navigation";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchAnimalForPhotosPage } from "@/app/lib/data/animals/animal.data";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import AnimalImageGallery from "@/components/dashboard/animals/photos/animal-image-gallery";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { HelpLink } from "@/components/dashboard/help/help-link";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.ANIMAL_INFO_READ}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { id: animalId } = await params;
  const [animal, canManage, help] = await Promise.all([
    fetchAnimalForPhotosPage(animalId),
    hasPermission(AppPermissions.ANIMAL_PHOTO_MANAGE),
    getHelpLinkGuide(PAGE_HELP_GUIDES.animalPhotos),
  ]);

  if (!animal) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Card className="@container/card">
        <CardHeader>
          <CardTitle className="@[650px]/card:text-xl">
            Current Images
          </CardTitle>
          <CardDescription>
            Manage the existing photos for this animal&apos;s profile. Hover
            over an image to adjust its framing, replace it or delete it.
          </CardDescription>
          {help && (
            <CardAction>
              <HelpLink guide={help} />
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <AnimalImageGallery
            images={animal.animalImages}
            animalId={animal.id}
            canManage={canManage}
          />
        </CardContent>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardTitle className="@[650px]/card:text-xl">
            Upload New Images
          </CardTitle>
          <CardDescription>
            Add new photos to this animal&apos;s profile. You crop each photo
            to a square before it is saved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PhotoUploader animalId={animalId} canManage={canManage} />
        </CardContent>
      </Card>
    </div>
  );
};

export default Page;
