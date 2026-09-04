import {
  fetchAdoptionApplicantDefaults,
  getAnimalForAdoptionApplication,
} from "@/app/lib/data/my-adoption-applications.data";
import { IDParamType, AnimalForAdoptionApplicationPayload } from "@/app/lib/types";
import { getCachedSession } from "@/app/lib/auth/session";
import { notFound, redirect } from "next/navigation";
import { MyApplicationForm } from "@/components/dashboard/my-adoption-applications/my-adoption-application-form";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  const { id } = await params;

  const session = await getCachedSession();
  if (!session || !session.user) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/pets/${id}/adopt`)}`);
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
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14 lg:px-14">
      <h1 className="mb-6 text-center font-display text-[clamp(32px,5vw,44px)] text-foreground">
        Adoption Application
      </h1>
      {/* The form's Selects portal their dropdowns to <body>, outside this
          layout's .theme-organic div. The form is shared with the dashboard,
          so the scope is re-opened here at the call site rather than inside
          the form. */}
      <MyApplicationForm
        animal={animalToAdopt}
        applicantDefaults={applicantDefaults}
        selectContentClassName="theme-organic"
      />
    </main>
  );
};

export default Page;