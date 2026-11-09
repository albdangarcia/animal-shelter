import { Suspense } from "react";
import { notFound } from "next/navigation";
import { fetchAdoptionApplicationById } from "@/app/lib/data/user-adoption-application.data";
import { StaffApplicationUpdateForm } from "@/components/dashboard/adoption-applications/adoption-staff-edit-application-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SearchParamsType } from "@/app/lib/types";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { AppPermissions } from "@/app/lib/auth/permissions";

interface Props {
  params: Promise<{ applicationId: string }>;
  searchParams: SearchParamsType;
}

const Page = async ({ params, searchParams }: Props) => {
  const { applicationId } = await params;
  const { returnTo } = await searchParams;

  const userApplication = await fetchAdoptionApplicationById(applicationId);

  if (!userApplication) {
    notFound();
  }

  const canCreateOutcome = await hasPermission(AppPermissions.OUTCOMES_MANAGE);
  const animal = userApplication.animal;

  if (!animal) {
    notFound();
  }

  return (
    <main className="container mx-auto">
      <Button asChild variant="ghost" className="mb-4">
        <Link href={returnTo ?? "/dashboard/adoption-applications"}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Applications
        </Link>
      </Button>

      <Suspense fallback={<div>Loading application...</div>}>
        <StaffApplicationUpdateForm
          application={userApplication}
          animal={animal}
          returnTo={returnTo}
          canCreateOutcome={canCreateOutcome}
        />
      </Suspense>
    </main>
  );
};

export default Page;
