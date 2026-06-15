import { OutcomeType } from "@prisma/client";
import {
  HeartHandshake,
  ArrowRightLeft,
  Home,
  HeartCrack,
  Cross,
  Info,
} from "lucide-react";

export const OutcomeTypesOptions = [
  {
    value: OutcomeType.ADOPTION,
    label: "Adoption",
    icon: HeartHandshake,
  },
  {
    value: OutcomeType.TRANSFER_OUT,
    label: "Transfer Out",
    icon: ArrowRightLeft,
  },
  {
    value: OutcomeType.RETURN_TO_OWNER,
    label: "Return to Owner",
    icon: Home,
  },
  {
    value: OutcomeType.DECEASED,
    label: "Deceased",
    icon: HeartCrack,
  },
  {
    value: OutcomeType.EUTHANIZED,
    label: "Euthanized",
    icon: Cross,
  },
  {
    value: OutcomeType.OTHER,
    label: "Other",
    icon: Info,
  },
];
