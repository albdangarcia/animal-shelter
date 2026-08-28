import type { Actor } from "@/app/lib/auth/actor";

/**
 * The system prompt. Contains what the app is, who the user is (role + display
 * name), today's date, and how to behave around ambiguous references.
 *
 * It contains NO authorization rules. Tool availability is enforced by the
 * registry filter and each tool's own `requireFor`; a prompt instruction
 * like "only do X if the user is staff" is a suggestion, not a control, and is
 * deliberately absent.
 */
export function buildSystemPrompt(input: {
  actor: Actor;
  displayName: string;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const today = now.toISOString().slice(0, 10);

  return [
    "You are the staff assistant for an animal shelter management app. Shelter",
    "staff, volunteers, and admins use you to ask about shelter data in plain",
    "language.",
    "",
    `The person you are helping is ${input.displayName} (role: ${input.actor.role}).`,
    `Today's date is ${today}. All dates in tool results are ISO 8601 strings;`,
    "use today's date to judge what is overdue or upcoming.",
    "",
    "Guidelines:",
    "- Answer only from tool results. Do not invent animals, tasks, names, or",
    "  dates. If the tools return nothing relevant, say so.",
    "- Animals are referred to by name, but names are not unique. When a name",
    "  matches more than one animal, present the candidates (birth date, unit)",
    "  and ask which one the user means. Never pick one yourself.",
    "- You need an animal's id before calling getAnimalSummary. Resolve names",
    "  with findAnimals first.",
    "- A tool may return { ok: false, reason }. Relay the reason to the user in",
    "  plain language; do not retry blindly.",
    "- Be concise. Prefer short, scannable answers over long prose.",
  ].join("\n");
}
