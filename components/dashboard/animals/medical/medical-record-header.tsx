import type { ReactNode } from "react";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DOSE_SHEET_PAST_DAYS } from "@/app/lib/constants/medical";

type Section = "overview" | "history" | "vaccines-tests" | "current-orders" | "dose-sheet" | "past-orders" | "conditions" | "care-episodes" | "vitals" | "documents";
type Action = { label: string; icon?: "plus" | "upload"; margin?: 1 | 2 };
type HeaderDefinition = { title: string; description: string; actions?: Action[]; actionsBelow?: boolean; heading?: boolean };
const addEntry: Action[] = [{ label: "Add entry", icon: "plus", margin: 2 }];
const headers: Record<Section, HeaderDefinition> = {
  overview: {
    title: "Medical",
    description: "Vaccines, tests, treatments, surgeries, microchips and exams: what is due, and what this animal has been given, and today's medication doses. Its orders are on Medications, its conditions and care episodes on Conditions.",
    actions: addEntry,
  },
  history: {
    title: "History",
    description: "Entries, conditions, care episodes and medication orders, newest first by their given, due, onset or start date. Upcoming care appears first. Voided records remain visible with who voided them and why. View doses on Medications.",
    actions: addEntry,
  },
  "vaccines-tests": {
    title: "Vaccines & Tests",
    description: "Each vaccine with its doses, latest first, and every test with its results. Voided entries are only in History.",
    actions: addEntry,
  },
  "current-orders": {
    title: "Current orders", heading: true,
    description: "Medications being given or about to start, with today's doses. A dose not recorded by the end of its slot reads Missed.",
    actions: [{ label: "Order medication", icon: "plus", margin: 1 }],
  },
  "dose-sheet": {
    title: "Dose sheet", heading: true,
    description: `The ${DOSE_SHEET_PAST_DAYS} days before today, newest first: each slot's dose, or Missed. A missed dose can still be given late.`,
  },
  "past-orders": {
    title: "Past orders", heading: true,
    description: "Orders that ended, were discontinued or voided, latest first. Voided ones stay here, struck through, with who voided them and why.",
  },
  conditions: {
    title: "Problem list", heading: true, actionsBelow: true,
    description: "Allergies, then the conditions the animal lives with, then those resolved. Voided rows stay here, struck through, with who voided them and why.",
    actions: [{ label: "Add condition", icon: "plus", margin: 1 }, { label: "Add allergy", icon: "plus", margin: 1 }],
  },
  "care-episodes": {
    title: "Care episodes", heading: true, actionsBelow: true,
    description: "When the animal was under vet care or hospitalised, here or at a clinic. The open episode comes first.",
    actions: [{ label: "Open care episode", icon: "plus", margin: 1 }],
  },
  vitals: {
    title: "Vitals",
    description: "A dated log of weight, temperature, and body condition.",
    actions: [{ label: "Record Vitals" }],
  },
  documents: {
    title: "Documents", heading: true,
    description: "Lab results, vet records, imaging, prescriptions and consent forms, newest upload first. Each opens in a new tab. Voided ones stay here, struck through, with who voided them and why.",
    actions: [{ label: "Upload document", icon: "upload", margin: 2 }],
  },
};

// Natural button sizes also reserve the right space when actions are unavailable.
// Hidden, disabled copies never enter the focus order or accessibility tree.
function ActionSpace({ actions, loading }: { actions: Action[]; loading: boolean }) {
  const Container = loading ? Skeleton : "div";
  return (
    <div aria-hidden="true" className="flex flex-wrap gap-2">
      {actions.map(({ label, icon, margin }) => (
        <Container key={label} className={loading ? "flex" : "invisible flex"}>
          <Button variant="outline" size="sm" className="invisible" disabled>
            {icon === "plus" && <Plus className={margin === 2 ? "mr-2 size-4" : "mr-1 size-4"} />}
            {icon === "upload" && <Upload className="mr-2 size-4" />}
            {label}
          </Button>
        </Container>
      ))}
    </div>
  );
}

/** Loading and loaded pages share text, action space and responsive geometry. */
export function MedicalRecordHeader({ section, action, headingId, loading = false }: {
  section: Section;
  action?: ReactNode;
  headingId?: string;
  loading?: boolean;
}) {
  const definition = headers[section];
  // Keep the sizing layer for visible actions and loading placeholders. Care
  // episodes need no action row once opening another episode is unavailable.
  const hideCareEpisodeAction = section === "care-episodes" && !loading && !action;
  const actions = hideCareEpisodeAction ? null : definition.actions ? (
    <div className={definition.actionsBelow ? "grid min-w-0 w-full" : "grid min-w-0"}>
      <div className="col-start-1 row-start-1">
        <ActionSpace actions={definition.actions} loading={loading} />
      </div>
      {action && <div className={`col-start-1 row-start-1 flex items-start ${definition.actionsBelow ? "justify-start" : "justify-end"}`}>{action}</div>}
    </div>
  ) : action;
  return (
    <CardHeader className="has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]">
      <CardTitle className="flex min-h-8 min-w-0 items-center break-words @max-[350px]/card:col-span-full @[650px]/card:text-xl">
        {definition.heading ? <h2 className="min-w-0" id={headingId} tabIndex={headingId ? -1 : undefined}>{definition.title}</h2> : definition.title}
      </CardTitle>
      <CardDescription className="col-span-full row-start-2">{definition.description}</CardDescription>
      {actions && (definition.actionsBelow
        ? <div className="col-span-full mt-2 flex">{actions}</div>
        : <CardAction className="row-span-1 @max-[350px]/card:col-span-full @max-[350px]/card:col-start-1 @max-[350px]/card:row-start-3 @max-[350px]/card:justify-self-start">{actions}</CardAction>)}
    </CardHeader>
  );
}
