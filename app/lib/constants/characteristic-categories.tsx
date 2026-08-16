import React from "react";
import { CharacteristicCategory } from "@/prisma/generated/enums";
import {
  HeartPulse,
  Stethoscope,
  Home,
  FileText,
  PlusCircle,
} from "lucide-react";

export type CategoryUIDefinition = {
  label: string;
  color: string;
  icon: React.ElementType;
};

export const CATEGORIES: Record<CharacteristicCategory, CategoryUIDefinition> = {
  [CharacteristicCategory.BEHAVIOR]: {
    label: "Behavior",
    color:
      "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900 dark:hover:bg-blue-950",
    icon: HeartPulse,
  },
  [CharacteristicCategory.MEDICAL]: {
    label: "Medical",
    color:
      "bg-red-100 text-red-800 border-red-200 hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:border-red-900 dark:hover:bg-red-950",
    icon: Stethoscope,
  },
  [CharacteristicCategory.ENVIRONMENT]: {
    label: "Environment",
    color:
      "bg-green-100 text-green-800 border-green-200 hover:bg-green-100 dark:bg-green-950 dark:text-green-300 dark:border-green-900 dark:hover:bg-green-950",
    icon: Home,
  },
  [CharacteristicCategory.ADMINISTRATIVE]: {
    label: "Administrative",
    color:
      "bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-800",
    icon: FileText,
  },
  [CharacteristicCategory.OTHER]: {
    label: "Other",
    color:
      "bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-900 dark:hover:bg-yellow-950",
    icon: PlusCircle,
  },
};

export const CATEGORY_KEYS = Object.values(CharacteristicCategory);