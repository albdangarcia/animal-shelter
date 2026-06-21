import { prisma } from "@/app/lib/prisma";
import { Prisma, NoteCategory } from "@prisma/client";
import {
  cuidSchema,
  currentPageSchema,
} from "../../zod-schemas/common.schemas";
import z from "zod";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";

export type FetchAnimalNotePayload = Prisma.AnimalNoteGetPayload<{
  select: {
    id: true;
    category: true;
    content: true;
  };
}>;

export type NotePayload = Prisma.AnimalNoteGetPayload<{
  select: {
    id: true;
    content: true;
    category: true;
    createdAt: true;
    deletedAt: true;
    author: {
      select: {
        id: true;
        name: true;
      };
    };
  };
}>;

const AnimalNotesSchema = z.object({
  currentPage: currentPageSchema,
  animalId: cuidSchema,
  category: z.string().optional(),
  sort: z.string().optional(),
  status: z.string().optional(),
});

const NOTES_PER_PAGE = 10;

const _fetchAnimalNotes = async (
  currentPageInput: number,
  categoryInput: string | undefined,
  sortInput: string | undefined,
  inputAnimalId: string,
  statusInput: string | undefined,
): Promise<{ notes: NotePayload[]; totalPages: number }> => {
  const validatedArgs = AnimalNotesSchema.safeParse({
    currentPage: currentPageInput,
    category: categoryInput,
    sort: sortInput,
    animalId: inputAnimalId,
    status: statusInput,
  });
  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching notes.");
  }

  const { currentPage, category, sort, animalId, status } = validatedArgs.data;

  const orderBy: Prisma.AnimalNoteOrderByWithRelationInput = (() => {
    if (!sort) return { createdAt: "desc" };
    const [id, dir] = sort.split(".");
    return { [id]: dir === "desc" ? "desc" : "asc" };
  })();

  // Status filter: deleted notes show only when "deleted" is selected.
  // Default (nothing) and "active" only → active notes. Both → all.
  const selected = status ? status.split(",").filter(Boolean) : [];
  const wantsActive = selected.includes("active");
  const wantsDeleted = selected.includes("deleted");

  let deletedFilter: Prisma.AnimalNoteWhereInput = {};
  if (wantsDeleted && !wantsActive) {
    deletedFilter = { deletedAt: { not: null } }; // deleted only
  } else if (wantsActive && wantsDeleted) {
    deletedFilter = {}; // both → all
  } else {
    deletedFilter = { deletedAt: null }; // default & active-only → active
  }

  const whereClause: Prisma.AnimalNoteWhereInput = {
    animalId: animalId,
    ...(category && {
      category: { in: category.split(",") as NoteCategory[] },
    }),
    ...deletedFilter,
  };

  try {
    const offset = (currentPage - 1) * NOTES_PER_PAGE;
    const [totalCount, notes] = await prisma.$transaction([
      prisma.animalNote.count({ where: whereClause }),
      prisma.animalNote.findMany({
        where: whereClause,
        select: {
          id: true,
          content: true,
          category: true,
          createdAt: true,
          deletedAt: true,
          author: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: orderBy,
        take: NOTES_PER_PAGE,
        skip: offset,
      }),
    ]);

    const totalPages = Math.ceil(totalCount / NOTES_PER_PAGE);
    return { notes, totalPages };
  } catch (error) {
    console.error("Error fetching notes:", error);
    throw new Error("Error fetching notes.");
  }
};

export const fetchAnimalNotes = RequirePermission(
  AppPermissions.ANIMAL_NOTE_READ,
)(_fetchAnimalNotes);