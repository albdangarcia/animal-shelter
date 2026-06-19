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
  showDeleted: z.boolean().optional(),
});

const NOTES_PER_PAGE = 10;

const _fetchAnimalNotes = async (
  currentPageInput: number,
  categoryInput: string | undefined,
  sortInput: string | undefined,
  inputAnimalId: string,
  showDeleted: boolean = false
): Promise<{ notes: NotePayload[]; totalPages: number }> => {
  // Validate and parse the input arguments using the Zod schema
  const validatedArgs = AnimalNotesSchema.safeParse({
    currentPage: currentPageInput,
    category: categoryInput,
    sort: sortInput,
    animalId: inputAnimalId,
    showDeleted,
  });
  // If validation fails, log the error and throw an exception
  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching notes.");
  }

  const {
    currentPage,
    category,
    sort,
    animalId,
    showDeleted: includeDeleted,
  } = validatedArgs.data;
  // Determine the sorting order for the query, defaulting to newest first
  const orderBy: Prisma.AnimalNoteOrderByWithRelationInput = (() => {
    if (!sort) return { createdAt: "desc" };
    const [id, dir] = sort.split(".");
    return { [id]: dir === "desc" ? "desc" : "asc" };
  })();
  // Construct the 'where' clause for the Prisma query based on filters
  const whereClause: Prisma.AnimalNoteWhereInput = {
    animalId: animalId,
    ...(category && {
      category: { in: category.split(",") as NoteCategory[] },
    }),
    ...(includeDeleted ? {} : { deletedAt: null }),
  };
  try {
    // Calculate the offset for pagination
    const offset = (currentPage - 1) * NOTES_PER_PAGE;
    // Use a transaction to fetch the total count and the notes data in one go
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
        take: NOTES_PER_PAGE, // Limit the number of records returned
        skip: offset, // Skip records for pagination
      }),
    ]);
    // Calculate the total number of pages
    const totalPages = Math.ceil(totalCount / NOTES_PER_PAGE);
    return { notes, totalPages };
  } catch (error) {
    console.error("Error fetching notes:", error);
    throw new Error("Error fetching notes.");
  }
};

export const fetchAnimalNotes = RequirePermission(
  AppPermissions.ANIMAL_NOTE_READ
)(_fetchAnimalNotes);
