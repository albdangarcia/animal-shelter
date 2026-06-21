import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import { PartnerNotesParamsSchema } from "../../zod-schemas/partners-directory.schemas";
import { PartnerNotePayload } from "../../types";

const PAGE_SIZE = 10;

const _fetchPartnerNotes = async (
  partnerIdInput: string,
  currentPageInput: number,
  sortInput: string | undefined,
  statusInput: string | undefined,
): Promise<{
  notes: PartnerNotePayload[];
  totalPages: number;
  totalRows: number;
}> => {
  const parsedId = cuidSchema.safeParse(partnerIdInput);
  if (!parsedId.success) {
    throw new Error("Invalid partner ID format.");
  }

  const validatedArgs = PartnerNotesParamsSchema.safeParse({
    currentPage: currentPageInput,
    sort: sortInput,
    status: statusInput,
  });
  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching partner notes.");
  }
  const { currentPage, sort, status } = validatedArgs.data;
  const partnerId = parsedId.data;

  const offset = (currentPage - 1) * PAGE_SIZE;

  // Sort: newest/oldest by createdAt; default newest first.
  const orderBy: Prisma.PartnerNoteOrderByWithRelationInput = (() => {
    if (!sort) return { createdAt: "desc" };
    const [field, direction] = sort.split(".");
    const dir = direction === "asc" ? "asc" : "desc";
    if (field === "createdAt") return { createdAt: dir };
    return { createdAt: "desc" };
  })();

  // Status filter: deleted notes shown only when "deleted" is selected.
  const selected = status ? status.split(",").filter(Boolean) : [];
  const wantsActive = selected.includes("active");
  const wantsDeleted = selected.includes("deleted");

  let deletedFilter: Prisma.PartnerNoteWhereInput = {};
  if (wantsDeleted && !wantsActive) {
    deletedFilter = { deletedAt: { not: null } }; // deleted only
  } else if (wantsActive && wantsDeleted) {
    deletedFilter = {}; // both → all
  } else {
    deletedFilter = { deletedAt: null }; // default & active-only → active
  }

  const whereClause: Prisma.PartnerNoteWhereInput = {
    partnerId,
    ...deletedFilter,
  };

  try {
    const [totalRows, notes] = await prisma.$transaction([
      prisma.partnerNote.count({ where: whereClause }),
      prisma.partnerNote.findMany({
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
    console.error("Error fetching partner notes.", error);
    throw new Error("Error fetching partner notes.");
  }
};

export const fetchPartnerNotes = RequirePermission(AppPermissions.PARTNERS_READ)(
  _fetchPartnerNotes,
);