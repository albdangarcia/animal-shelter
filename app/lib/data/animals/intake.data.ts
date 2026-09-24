import type { IntakeType } from "@/prisma/generated/enums";
import type { Prisma } from "@/prisma/generated/client";
import { z } from "zod";
import {
  currentPageSchema,
  pageSizeSchema,
  searchQuerySchema,
} from "../../zod-schemas/common.schemas";
import prisma from "@/app/lib/prisma";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "../../auth/permissions";

// Zod schema for validating the search parameters
export const IntakesSchema = z.object({
  query: searchQuerySchema,
  currentPage: currentPageSchema,
  sort: z.string().optional(),
  type: z.string().optional(),
  pageSize: pageSizeSchema,
});

const intakeListInclude = {
  animal: { select: { id: true, name: true } },
  staffMember: { select: { id: true, name: true } },
  sourcePartner: { select: { id: true, name: true } },
  surrenderingPerson: { select: { id: true, name: true } },
} satisfies Prisma.IntakeInclude;

export type IntakeWithDetails = Prisma.IntakeGetPayload<{
  include: typeof intakeListInclude;
}>;

// The row the correction form is prefilled from. The surrendering person is
// read with a name so the picker can show who is on record, not just hold
// their id.
export const _fetchIntakeById = async (intakeId: string) => {
  try {
    return await prisma.intake.findUnique({
      where: { id: intakeId },
      include: intakeListInclude,
    });
  } catch (error) {
    console.error("Database Error: Failed to fetch intake.", error);
    throw new Error("Failed to fetch intake.");
  }
};

export type IntakeForCorrection = NonNullable<
  Awaited<ReturnType<typeof _fetchIntakeById>>
>;

export const _fetchIntakes = async (
  queryInput: string,
  currentPageInput: number,
  sortInput: string | undefined,
  typeInput: string | undefined,
  pageSizeInput: number,
): Promise<{
  intakes: IntakeWithDetails[];
  totalPages: number;
  totalRows: number;
}> => {
  const validatedArgs = IntakesSchema.safeParse({
    query: queryInput,
    currentPage: currentPageInput,
    sort: sortInput,
    type: typeInput,
    pageSize: pageSizeInput,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching intakes.");
  }

  const { query, currentPage, sort, type, pageSize } = validatedArgs.data;

  // An intake date is a calendar day, so a busy day ties many rows, and offset
  // pagination over an unstable order drops rows from one page and repeats
  // them on the next. Each order ends with the row id to break the ties.
  const orderBy: Prisma.IntakeOrderByWithRelationInput[] =
    ((): Prisma.IntakeOrderByWithRelationInput[] => {
      const newestFirst: Prisma.IntakeOrderByWithRelationInput[] = [
        { intakeDate: "desc" },
        { createdAt: "desc" },
      ];
      if (!sort) return newestFirst;

      const [id, dir] = sort.split(".");
      // Sanitize the direction to ensure it's always 'asc' or 'desc'.
      const direction: "asc" | "desc" = dir === "desc" ? "desc" : "asc";

      if (id === "staffMember") {
        return [{ staffMember: { name: direction } }];
      }
      if (id === "animal") {
        return [{ animal: { name: direction } }];
      }
      if (id === "date" || id === "intakeDate") {
        return [{ intakeDate: direction }, { createdAt: direction }];
      }
      if (id === "type") {
        return [{ type: direction }];
      }

      // A derived column such as "source" has no field on Intake to order by.
      return newestFirst;
    })().concat({ id: "asc" });

  const whereClause: Prisma.IntakeWhereInput = {
    ...(type && {
      type: { in: type.split(",") as IntakeType[] },
    }),
    ...(query && {
      animal: { name: { contains: query, mode: "insensitive" } },
    }),
  };

  try {
    const offset = (currentPage - 1) * pageSize;
    const [totalCount, intakes] = await Promise.all([
      prisma.intake.count({ where: whereClause }),
      prisma.intake.findMany({
        where: whereClause,
        include: intakeListInclude,
        orderBy,
        take: pageSize,
        skip: offset,
      }),
    ]);

    const totalPages = Math.ceil(totalCount / pageSize);
    return { intakes, totalPages, totalRows: totalCount };
  } catch (error) {
    console.error("Database Error: Failed to fetch intakes.", error);
    throw new Error("Failed to fetch intakes.");
  }
};

export const fetchIntakeById = RequirePermission(AppPermissions.INTAKE_READ)(
  _fetchIntakeById,
);

export const fetchIntakes = RequirePermission(AppPermissions.INTAKE_READ)(
  _fetchIntakes,
);
