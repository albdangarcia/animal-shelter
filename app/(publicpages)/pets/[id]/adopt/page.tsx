import {
  fetchAdoptionApplicantDefaults,
  getAnimalForAdoptionApplication,
} from "@/app/lib/data/my-adoption-applications.data";
import { IDParamType, AnimalForAdoptionApplicationPayload } from "@/app/lib/types";
import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { MyApplicationForm } from "@/components/dashboard/my-adoption-applications/my-adoption-application-form";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  const { id } = await params;

  const session = await auth();
  if (!session || !session.user) {
    redirect("/api/auth/signin");
  }

  const animalToAdopt: AnimalForAdoptionApplicationPayload | null =
    await getAnimalForAdoptionApplication(id);

  if (!animalToAdopt) {
    notFound();
  }

  const currentUserHasActiveApplication =
    animalToAdopt.adoptionApplications &&
    animalToAdopt.adoptionApplications.length > 0;

  if (currentUserHasActiveApplication) {
    redirect(`/dashboard/my-adoption-applications`);
  }

  const applicantDefaults = await fetchAdoptionApplicantDefaults();

  return (
    <main className="max-w-3xl mx-auto pb-10 pt-5">
      <h1 className="text-3xl font-opensans font-medium text-foreground mb-6 text-center">
        Adoption Application
      </h1>
      <MyApplicationForm
        animal={animalToAdopt}
        applicantDefaults={applicantDefaults}
      />
    </main>
  );
};

export default Page;