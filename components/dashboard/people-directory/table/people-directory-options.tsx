import { UserCheck, UserX } from "lucide-react";

export const AccountStatuses = [
  {
    value: "registered",
    label: "Registered",
    icon: UserCheck,
    className:
      "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  },
  {
    value: "no_account",
    label: "No Account",
    icon: UserX,
    className:
      "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700",
  },
];