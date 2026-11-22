import { ClipboardList } from "lucide-react";

interface Props {
  animalName: string;
  /** Tasks still to do: To Do, In Progress or On Hold. */
  count: number;
  /** What staff are about to do, as the start of a sentence. */
  action: "Recording this outcome" | "Converting this placement";
}

// Shown above the outcome and conversion forms while the animal has tasks
// still to do. Either one cancels them (`cancelOpenTasksForOutcome`), so staff
// learn that before they submit rather than from the Tasks tab afterwards.
export function OutcomeTasksNotice({ animalName, count, action }: Props) {
  if (count === 0) return null;
  const tasks = count === 1 ? "1 open task" : `${count} open tasks`;
  return (
    <div
      role="note"
      className="mx-auto mb-4 flex w-full max-w-4xl items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/40"
    >
      <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" />
      <p className="text-blue-900 dark:text-blue-100">
        {animalName} has <span className="font-semibold">{tasks}</span>.{" "}
        {action} cancels {count === 1 ? "it" : "them"}, since the animal is
        leaving. Reversing the outcome reopens {count === 1 ? "it" : "them"}.
      </p>
    </div>
  );
}
