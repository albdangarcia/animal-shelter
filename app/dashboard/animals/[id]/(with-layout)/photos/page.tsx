import { IDParamType } from "@/app/lib/types";
import UppyUploader from "@/components/dashboard/animals/photos/uppy-uploader";
import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchAnimalForPhotosPage } from "@/app/lib/data/animals/animal.data";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import AnimalImageGallery from "@/components/dashboard/animals/photos/animal-image-gallery";
import { hasPermission } from "@/app/lib/auth/hasPermission";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.ANIMAL_INFO_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { id: animalId } = await params;
  const animal = await fetchAnimalForPhotosPage(animalId);

  if (!animal) {
    notFound();
  }

  const canManage = await hasPermission(AppPermissions.ANIMAL_PHOTO_MANAGE);

  return (
    <div className="space-y-6">
      <Card className="@container/card">
        <CardHeader>
          <CardTitle className="@[650px]/card:text-xl">
            Current Images
          </CardTitle>
          <CardDescription>
            Manage the existing photos for this animal&apos;s profile. Hover
            over an image to delete it.
          </CardDescription>
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
            Add new photos to this animal&apos;s profile. Drag and drop images
            below or click to browse.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UppyUploader animalId={animalId} canManage={canManage} />
        </CardContent>
      </Card>
    </div>
  );
};

export default Page;
