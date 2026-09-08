import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MyApplicationForm } from "@/components/dashboard/my-adoption-applications/my-adoption-application-form";
import { fetchMyAdoptionAppById } from "@/app/lib/data/my-adoption-applications.data";
import { ApplicationStatus } from "@/prisma/generated/enums";

interface Props {
  params: Promise<{ applicationId: string }>;
}

const Page = async ({ params }: Props) => {
  const { applicationId } = await params;

  const myApplication = await fetchMyAdoptionAppById(applicationId);

  if (!myApplication) {
    notFound();
  }

  // PENDING is the only status `updateMyAdoptionApp` accepts. Without this the
  // form rendered fully editable at every other status and only failed on
  // submit, with a raw enum name in the message. The read-only view page says
  // what the status means instead.
  if (myApplication.status !== ApplicationStatus.PENDING) {
    redirect(`/dashboard/my-adoption-applications/${applicationId}`);
  }

  const animal = myApplication.animal;
  
  if (!animal) {
    console.error("Application found, but it has no associated animal.");
    notFound();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit Adoption Application</CardTitle>
        <CardDescription>
          Make changes to your application for {animal.name}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<div>Loading adoption application edit form...</div>}>
          <MyApplicationForm application={myApplication} animal={animal} />
        </Suspense>
      </CardContent>
    </Card>
  );
};

export default Page;