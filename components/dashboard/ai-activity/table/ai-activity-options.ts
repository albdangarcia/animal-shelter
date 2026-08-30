import { buildOptions } from "@/app/lib/utils/option-utils";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, RotateCcw } from "lucide-react";

// The State facet. Faceted like the tasks page's filters, values matched
// against `undoneAt` server-side (see `ai-activity.data.ts`). The default view
// shows both — undone rows are the most interesting signal in the table.
const stateMeta: Record<"active" | "undone", { label: string; icon: LucideIcon }> = {
  active: { label: "Active", icon: CheckCircle2 },
  undone: { label: "Undone", icon: RotateCcw },
};

export const aiActivityStates = buildOptions(stateMeta);
