import {
  fetchApplicantDefaults,
  getAnimalForApplication,
} from "@/app/lib/data/my-applications.data";
import { IDParamType, AnimalForApplicationPayload } from "@/app/lib/types";
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

  const animalToAdopt: AnimalForApplicationPayload | null =
    await getAnimalForApplication(id);

  if (!animalToAdopt) {
    notFound();
  }

  const currentUserHasActiveApplication =
    animalToAdopt.adoptionApplications &&
    animalToAdopt.adoptionApplications.length > 0;

  if (currentUserHasActiveApplication) {
    redirect(`/dashboard/my-applications`);
  }

  const applicantDefaults = await fetchApplicantDefaults();

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