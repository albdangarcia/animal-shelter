import { buildOptions } from "@/app/lib/utils/option-utils";
import { TaskCategory, TaskPriority, TaskStatus } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle,
  Circle,
  CircleOff,
  Timer,
  PauseCircle,
  Trash2,
  SkipForward,
  ClipboardList,
  PawPrint,
  Briefcase,
  BrushCleaning,
  Utensils,
} from "lucide-react";

const categoryMeta: Record<TaskCategory, { label: string; icon: LucideIcon }> =
  {
    MEDICAL: { label: "Medical", icon: ClipboardList },
    BEHAVIORAL: { label: "Behavioral", icon: PawPrint },
    ADMINISTRATIVE: { label: "Administrative", icon: Briefcase },
    CLEANING: { label: "Cleaning", icon: BrushCleaning },
    FEEDING: { label: "Feeding", icon: Utensils },
  };

const statusMeta: Record<TaskStatus, { label: string; icon: LucideIcon }> = {
  TODO: { label: "Todo", icon: Circle },
  IN_PROGRESS: { label: "In Progress", icon: Timer },
  DONE: { label: "Done", icon: CheckCircle },
  SKIPPED: { label: "Skipped", icon: SkipForward },
  CANCELED: { label: "Canceled", icon: CircleOff },
  ON_HOLD: { label: "On Hold", icon: PauseCircle },
  DELETED: { label: "Deleted", icon: Trash2 },
};

const priorityMeta: Record<TaskPriority, { label: string; icon: LucideIcon }> =
  {
    LOW: { label: "Low", icon: ArrowDown },
    MEDIUM: { label: "Medium", icon: ArrowRight },
    HIGH: { label: "High", icon: ArrowUp },
  };

export const categories = buildOptions(categoryMeta);
export const statuses = buildOptions(statusMeta);
export const priorities = buildOptions(priorityMeta);
