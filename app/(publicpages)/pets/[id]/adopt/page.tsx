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
    <>
      {/* The same accent band the nav carries, so the two read as one surface
          (spec §4.1, phase 2 §B.1). */}
      <section className="bg-organic-accent-100">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:px-14">
          <h1 className="mb-5 font-display text-[clamp(34px,5vw,56px)] leading-[1.05] tracking-[-0.02em]">
            Adoption Application
          </h1>
          <p className="max-w-[52ch] text-[16px] leading-[1.65] text-pretty text-organic-neutral-800">
            Three short sections about you and your home, so we can be sure
            this is a good fit.
          </p>
        </div>
      </section>

      {/* max-w-6xl, not the 3xl this page used to run at: the form's public
          shell is a two-column section grid and needs the same measure the
          rest of app/(publicpages) uses. */}
      <main className="mx-auto w-full max-w-6xl px-5 pt-10 pb-16 sm:px-8 sm:pt-12 lg:px-14 lg:pb-20">
        {/* The form's Selects portal their dropdowns to <body>, outside this
            layout's .theme-organic div. The form is shared with the dashboard,
            so the scope is re-opened here at the call site rather than inside
            the form. */}
        <MyApplicationForm
          animal={animalToAdopt}
          applicantDefaults={applicantDefaults}
          variant="public"
          selectContentClassName="theme-organic"
        />
      </main>
    </>
  );
};

export default Page;