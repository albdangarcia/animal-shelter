import type { ApplicationStatus } from "@/prisma/generated/enums";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ApplicationStatuses } from "./table/my-applications-options";

// One message per status, addressed to the applicant. There is no notification
// system in this app, so this page plus the status history below it is the only
// place a status change is ever explained — every status needs its own sentence,
// including the ones staff never set.
//
// Two of these carry the weight of the whole feature:
//
// WAITLISTED has to read as "assessed and held", not as a slower PENDING —
// otherwise the applicant cannot tell the two apart and reads silence as
// neglect. CLOSED must never read as a rejection: it is the administrative
// cascade that runs when the animal leaves the shelter, it is not a judgment
// about the applicant, and it is the one status that leaves them free to apply
// again (see BLOCKING_APPLICATION_STATUSES).
//
// REJECTED is the deliberate contrast to CLOSED, and it does block re-applying
// for this animal, so it points at other animals rather than inviting an appeal.
export const MY_APPLICATION_STATUS_MESSAGES: Record<
  ApplicationStatus,
  { title: string; description: string }
> = {
  PENDING: {
    title: "Waiting for review",
    description:
      "Your application has been submitted and is waiting for a staff member to review it. You can still make changes to it while it is pending.",
  },
  REVIEWING: {
    title: "Under review",
    description:
      "A staff member is reviewing your application, so it can no longer be edited. If any of your details have changed, contact the shelter and they can update it for you.",
  },
  WAITLISTED: {
    title: "On the waitlist",
    description:
      "Your application has been reviewed and placed on the waitlist. Another applicant is being considered first — the shelter will be in touch if this animal becomes available to you.",
  },
  APPROVED: {
    title: "Approved",
    description:
      "Your application has been approved and this animal is being held for you. The shelter will contact you to arrange the adoption.",
  },
  REJECTED: {
    title: "Not moving forward",
    description:
      "The shelter has decided not to move forward with this application. Any reason they recorded is shown in the status history below. You are welcome to apply for other animals.",
  },
  WITHDRAWN: {
    title: "Withdrawn by you",
    description:
      "You withdrew this application. If this animal is still available for adoption you can reactivate it; otherwise you are welcome to apply for another animal.",
  },
  ADOPTED: {
    title: "Adoption complete",
    description:
      "This adoption has been finalised. Thank you for adopting — congratulations from all of us at the shelter.",
  },
  CLOSED: {
    title: "No longer available",
    description:
      "This animal is no longer available for adoption, so your application was closed. It is not a decision about you or your application — the reason is shown in the status history below, and if this animal is ever listed again you are welcome to apply.",
  },
};

export const MyApplicationStatusMessage = ({
  status,
}: {
  status: ApplicationStatus;
}) => {
  const message = MY_APPLICATION_STATUS_MESSAGES[status];
  const Icon = ApplicationStatuses.find((s) => s.value === status)?.icon;

  return (
    <Alert>
      {Icon && <Icon className="h-4 w-4" />}
      <AlertTitle>{message.title}</AlertTitle>
      <AlertDescription>{message.description}</AlertDescription>
    </Alert>
  );
};
