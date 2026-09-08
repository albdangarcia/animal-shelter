import { notFound } from "next/navigation";
import { MyAdoptionApplicationView } from "@/components/dashboard/my-adoption-applications/my-adoption-application-view";
import { fetchMyAdoptionAppById } from "@/app/lib/data/my-adoption-applications.data";

interface Props {
  params: Promise<{ applicationId: string }>;
}

/**
 * The applicant's read-only view of an application, reachable at every status.
 * `/[id]/edit` keeps the form and is guarded to PENDING; this route is the one
 * the row menu links to and the one the edit guard redirects into.
 */
const Page = async ({ params }: Props) => {
  const { applicationId } = await params;

  const myApplication = await fetchMyAdoptionAppById(applicationId);

  if (!myApplication) {
    notFound();
  }

  return <MyAdoptionApplicationView application={myApplication} />;
};

export default Page;
