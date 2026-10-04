import type { EffectiveApplicationStatus } from "@/app/lib/utils/derive-application-status";
import { MY_APPLICATION_STATUS_MESSAGES } from "@/app/lib/utils/application-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ApplicationStatuses } from "./table/my-applications-options";

export const MyApplicationStatusMessage = ({
  status,
}: {
  status: EffectiveApplicationStatus;
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
