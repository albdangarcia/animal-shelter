import Link from "next/link";
import { IconChevronRight } from "@tabler/icons-react";
import { TaskStatus } from "@/prisma/generated/enums";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import {
  ATTENTION_SUMMARY_PERMISSIONS,
  fetchAttentionSummary,
} from "@/app/lib/data/animals/attention-queue.data";
import type {
  AttentionGroup,
  AttentionKind,
} from "@/app/lib/data/animals/attention-summary";
import type { AttentionReason } from "@/app/lib/data/animals/attention-queue";
import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import { CARE_EPISODE_TYPE_LABELS } from "@/app/lib/constants/medical";
import { formatDueDay } from "@/app/lib/utils/date-utils";
import { formatShelterDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

// Open tasks due today or earlier, the earliest due first, leaving out animals
// that have left: the same tasks the group counts (signal 1 in
// `attention-signals.ts`).
const TASKS_DUE_HREF = `/dashboard/animal-tasks?status=${TaskStatus.TODO},${TaskStatus.IN_PROGRESS}&due=overdue,today&hideLeft=true&sort=dueDate.asc`;

/**
 * Per reason: the group's label (in the unit its count counts, see
 * `summarizeAttention`), the page where that work is done, and where each
 * animal links. Care with nothing planned has no page of its own, and the
 * fosters page lists people, not placements, so those two link each animal
 * only.
 */
const GROUPS: Record<
  AttentionKind,
  {
    label: (count: number) => string;
    href?: string;
    animalHref: (animalId: string) => string;
  }
> = {
  TASK_DUE: {
    label: (n) => plural(n, "task due or overdue", "tasks due or overdue"),
    href: TASKS_DUE_HREF,
    animalHref: (id) => `/dashboard/animals/${id}/tasks`,
  },
  DOSE_MISSED: {
    label: (n) => plural(n, "animal missed a dose", "animals missed a dose"),
    href: "/dashboard/medical/doses",
    animalHref: (id) => `/dashboard/animals/${id}/medical/medications`,
  },
  MEDICAL_DUE: {
    label: (n) =>
      plural(n, "care item due or overdue", "care items due or overdue"),
    href: "/dashboard/medical/due",
    animalHref: (id) => `/dashboard/animals/${id}/medical`,
  },
  CARE_UNPLANNED: {
    label: (n) =>
      plural(
        n,
        "animal under care with nothing planned",
        "animals under care with nothing planned",
      ),
    animalHref: (id) => `/dashboard/animals/${id}/medical`,
  },
  FOSTER_OVERDUE: {
    label: (n) =>
      plural(
        n,
        "foster stay past the return date",
        "foster stays past the return date",
      ),
    animalHref: (id) => `/dashboard/animals/${id}`,
  },
};

const dueWords = (day: CalendarDay, today: CalendarDay): string => {
  const due = formatDueDay(day, TaskStatus.TODO, today);
  return due === "Today" ? "due today" : due.toLowerCase();
};

/** The reason in a few words, beside the animal's name. */
const reasonWords = (reason: AttentionReason, today: CalendarDay): string => {
  switch (reason.kind) {
    case "TASK_DUE":
      return `${reason.title}, ${dueWords(reason.dueDate, today)}`;
    case "DOSE_MISSED":
      return `${plural(reason.count, "dose", "doses")} missed: ${reason.medications.join(", ")}`;
    case "MEDICAL_DUE":
      return `${reason.itemName}, ${dueWords(reason.dueDate, today)}`;
    case "CARE_UNPLANNED":
      return `${CARE_EPISODE_TYPE_LABELS[reason.episodeType]} since ${formatShelterDay(reason.startDate)}`;
    case "FOSTER_OVERDUE":
      return `With ${reason.fosterName}, expected back ${formatShelterDay(reason.expectedEndDate)}`;
  }
};

const Group = ({
  group,
  today,
}: {
  group: AttentionGroup;
  today: CalendarDay;
}) => {
  const { label, href, animalHref } = GROUPS[group.kind];
  const title = label(group.count);
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <h3 className="font-medium">
        {href ? (
          // The chevron tells a group that opens a page from one that doesn't.
          <Link
            href={href}
            className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
          >
            {title}
            <IconChevronRight aria-hidden className="size-4 text-muted-foreground" />
          </Link>
        ) : (
          title
        )}
      </h3>
      <ul className="flex flex-col gap-1 text-sm">
        {group.first.map(({ animal, reason }) => (
          <li key={animal.id} className="flex flex-wrap gap-x-2">
            <Link
              href={animalHref(animal.id)}
              className="font-medium underline-offset-4 hover:underline"
            >
              {animal.name}
            </Link>
            <span className="text-muted-foreground">
              {reasonWords(reason, today)}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
};

/**
 * "Needs attention today": the attention queue as one group per reason, each
 * with its uncapped count, a link to where the work is done, and the first
 * few animals. Left out for a viewer without every permission its fetch
 * needs (`ATTENTION_SUMMARY_PERMISSIONS`).
 */
const AttentionPanel = async () => {
  const allowed = await Promise.all(
    ATTENTION_SUMMARY_PERMISSIONS.map((permission) => hasPermission(permission)),
  );
  if (allowed.includes(false)) return null;

  const [groups, today] = await Promise.all([
    fetchAttentionSummary(),
    getShelterToday(),
  ]);

  return (
    <Card className="@4xl/main:col-span-2">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Needs attention today
        </CardTitle>
        <CardDescription>
          Each item clears when someone acts on it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing needs attention today.
          </p>
        ) : (
          <ul className="divide-y">
            {groups.map((group) => (
              <Group key={group.kind} group={group} today={today} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default AttentionPanel;
