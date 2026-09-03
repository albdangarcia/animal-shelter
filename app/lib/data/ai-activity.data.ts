import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { AiActionTargetType, type TaskStatus } from "@/prisma/generated/enums";
import { z } from "zod";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../auth/protected-actions";
import { pageSizeSchema } from "../zod-schemas/common.schemas";
import { parseSnapshot } from "./ai-activity";

// NOTE: no search box on this table (see the toolbar). Every other table filters
// a `title contains` query, but the only searchable text here — the task title —
// lives in the *joined* second query below, not the filtered one, so a search
// term could not be pushed into `count` / `findMany` without breaking
// pagination. Deliberate omission, not a forgotten one.
const AiActivityLogParamsSchema = z.object({
  currentPage: z.int().positive(),
  pageSize: pageSizeSchema,
  sort: z.string().optional(),
  // Faceted, comma-joined: "undone" and/or "active". Both (or neither) = all rows.
  state: z.string().optional(),
  // Faceted, comma-joined Person ids.
  actor: z.string().optional(),
});

/** One row of the AI activity table — the log row plus its resolved target and
 *  parsed before/after. Hand-written: it is a transformed shape, not a payload. */
export type AiActivityLogRow = {
  id: string;
  toolName: string;
  createdAt: Date;
  undoneAt: Date | null;
  actorId: string;
  actorName: string;
  targetType: AiActionTargetType;
  targetId: string;
  /** parsed `{ before, after }` statuses; `null` when the snapshots don't parse. */
  taskChange: { before: TaskStatus; after: TaskStatus } | null;
  /** resolved from the second query; `null` when the target no longer exists. */
  target: {
    taskId: string;
    title: string;
    animalId: string;
    animalName: string;
  } | null;
};

const _fetchAiActivityLog = async (
  currentPageInput: number,
  pageSizeInput: number,
  sortInput: string | undefined,
  stateInput: string | undefined,
  actorInput: string | undefined,
): Promise<{
  rows: AiActivityLogRow[];
  totalPages: number;
  totalRows: number;
}> => {
  const validatedArgs = AiActivityLogParamsSchema.safeParse({
    currentPage: currentPageInput,
    pageSize: pageSizeInput,
    sort: sortInput,
    state: stateInput,
    actor: actorInput,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching AI activity.");
  }

  const { currentPage, pageSize, sort, state, actor } = validatedArgs.data;

  // Default sort: most recent first — the primary question is "what changed
  // recently".
  const orderBy: Prisma.AiActionLogOrderByWithRelationInput = (() => {
    if (!sort) return { createdAt: "desc" };
    const [id, dir] = sort.split(".");
    const direction: "asc" | "desc" = dir === "asc" ? "asc" : "desc";

    if (id === "actor") return { actor: { name: direction } };
    if (["createdAt", "toolName", "undoneAt"].includes(id)) {
      return { [id]: direction };
    }
    return { createdAt: "desc" };
  })();

  const whereClause: Prisma.AiActionLogWhereInput = {};

  const states = state?.split(",").filter(Boolean) ?? [];
  // One value selected → filter to it. Both or none → show everything: undone
  // rows are where the assistant got something wrong or staff disagreed, which
  // is the most interesting signal in the table, so they are never hidden.
  if (states.length === 1) {
    whereClause.undoneAt = states[0] === "undone" ? { not: null } : null;
  }

  const actorIds = actor?.split(",").filter(Boolean) ?? [];
  if (actorIds.length > 0) {
    whereClause.actorId = { in: actorIds };
  }

  try {
    const offset = (currentPage - 1) * pageSize;
    const [totalRows, logs] = await Promise.all([
      prisma.aiActionLog.count({ where: whereClause }),
      prisma.aiActionLog.findMany({
        where: whereClause,
        select: {
          id: true,
          toolName: true,
          createdAt: true,
          undoneAt: true,
          targetType: true,
          targetId: true,
          before: true,
          after: true,
          actor: { select: { id: true, name: true } },
        },
        orderBy,
        take: pageSize,
        skip: offset,
      }),
    ]);

    // Resolving targets needs a second query — `targetId` is a plain String with
    // no relation (targetType varies). Fetch the TASK targets on this page and
    // map them back; a missing target renders as its id rather than crashing.
    const taskIds = logs
      .filter((log) => log.targetType === AiActionTargetType.TASK)
      .map((log) => log.targetId);

    const tasks = taskIds.length
      ? await prisma.task.findMany({
          where: { id: { in: taskIds } },
          select: {
            id: true,
            title: true,
            animal: { select: { id: true, name: true } },
          },
        })
      : [];
    const taskById = new Map(tasks.map((task) => [task.id, task]));

    const rows: AiActivityLogRow[] = logs.map((log) => {
      const before = parseSnapshot(log.targetType, log.before);
      const after = parseSnapshot(log.targetType, log.after);
      const taskChange =
        before.success && after.success
          ? { before: before.data.status, after: after.data.status }
          : null;

      const task =
        log.targetType === AiActionTargetType.TASK
          ? taskById.get(log.targetId)
          : undefined;

      return {
        id: log.id,
        toolName: log.toolName,
        createdAt: log.createdAt,
        undoneAt: log.undoneAt,
        actorId: log.actor.id,
        actorName: log.actor.name,
        targetType: log.targetType,
        targetId: log.targetId,
        taskChange,
        target: task
          ? {
              taskId: task.id,
              title: task.title,
              animalId: task.animal.id,
              animalName: task.animal.name,
            }
          : null,
      };
    });

    return {
      rows,
      totalPages: Math.ceil(totalRows / pageSize),
      totalRows,
    };
  } catch (error) {
    console.error("Error fetching AI activity log:", error);
    throw new Error("Error fetching AI activity log.");
  }
};

/** Distinct actors that appear in the log, for the Actor facet — the way the
 *  tasks page fetches its assignee list. Sorted in JS to stay clear of Prisma's
 *  `distinct` + `orderBy` interaction rules. */
const _fetchAiActivityActors = async (): Promise<
  { id: string; name: string }[]
> => {
  try {
    const rows = await prisma.aiActionLog.findMany({
      distinct: ["actorId"],
      select: { actor: { select: { id: true, name: true } } },
    });
    return rows
      .map((row) => row.actor)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("Error fetching AI activity actors:", error);
    throw new Error("Error fetching AI activity actors.");
  }
};

export const fetchAiActivityLog = RequirePermission(
  AppPermissions.AI_ACTIVITY_READ,
)(_fetchAiActivityLog);

export const fetchAiActivityActors = RequirePermission(
  AppPermissions.AI_ACTIVITY_READ,
)(_fetchAiActivityActors);
