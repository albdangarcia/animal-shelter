import { PersonType } from "@prisma/client";
import { User, Building2 } from "lucide-react";

export const PersonTypes = [
  {
    value: PersonType.INDIVIDUAL,
    label: "Individual",
    icon: User,
    className:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  },
  {
    value: PersonType.AGENCY,
    label: "Agency",
    icon: Building2,
    className:
      "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  },
];
