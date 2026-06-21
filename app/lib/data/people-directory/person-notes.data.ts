import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import { PersonNotesParamsSchema } from "../../zod-schemas/people-directory.schemas";
import { PersonNotePayload } from "../../types";

const PAGE_SIZE = 10;

const _fetchPersonNotes = async (
  personIdInput: string,
  currentPageInput: number,
  sortInput: string | undefined,
  statusInput: string | undefined,
): Promise<{
  notes: PersonNotePayload[];
  totalPages: number;
  totalRows: number;
}> => {
  const parsedId = cuidSchema.safeParse(personIdInput);
  if (!parsedId.success) {
    throw new Error("Invalid person ID format.");
  }

  const validatedArgs = PersonNotesParamsSchema.safeParse({
    currentPage: currentPageInput,
    sort: sortInput,
    status: statusInput,
  });
  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching person notes.");
  }
  const { currentPage, sort, status } = validatedArgs.data;
  const personId = parsedId.data;

  const offset = (currentPage - 1) * PAGE_SIZE;

  const orderBy: Prisma.PersonNoteOrderByWithRelationInput = (() => {
    if (!sort) return { createdAt: "desc" };
    const [field, direction] = sort.split(".");
    const dir = direction === "asc" ? "asc" : "desc";
    if (field === "createdAt") return { createdAt: dir };
    return { createdAt: "desc" };
  })();

  const selected = status ? status.split(",").filter(Boolean) : [];
  const wantsActive = selected.includes("active");
  const wantsDeleted = selected.includes("deleted");

  let deletedFilter: Prisma.PersonNoteWhereInput = {};
  if (wantsDeleted && !wantsActive) {
    deletedFilter = { deletedAt: { not: null } };
  } else if (wantsActive && wantsDeleted) {
    deletedFilter = {};
  } else {
    deletedFilter = { deletedAt: null };
  }

  const whereClause: Prisma.PersonNoteWhereInput = {
    personId,
    ...deletedFilter,
  };

  try {
    const [totalRows, notes] = await prisma.$transaction([
      prisma.personNote.count({ where: whereClause }),
      prisma.personNote.findMany({
        where: whereClause,
        orderBy,
        skip: offset,
        take: PAGE_SIZE,
        select: {
          id: true,
          content: true,
          author: {
            select: {
              id: true,
              name: true,
            },
          },
          createdAt: true,
          deletedAt: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(totalRows / PAGE_SIZE);
    return { notes, totalPages, totalRows };
  } catch (error) {
    console.error("Error fetching person notes.", error);
    throw new Error("Error fetching person notes.");
  }
};

export const fetchPersonNotes = RequirePermission(AppPermissions.PERSONS_READ)(
  _fetchPersonNotes,
);