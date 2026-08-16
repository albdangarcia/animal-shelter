import prisma from "@/app/lib/prisma";
import { PartnerType } from "@/prisma/generated/enums";
import type { Prisma } from "@/prisma/generated/client";
import { RequirePermission } from "../../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { PartnersDirectoryParamsSchema } from "../../zod-schemas/partners-directory.schemas";
import { PartnerFormPayload, PartnersDirectoryPayload, PartnerSectionCardPayload } from "../../types";
import { cuidSchema } from "../../zod-schemas/common.schemas";

const _fetchPartners = async (
  queryInput: string,
  currentPageInput: number,
  sortInput: string | undefined,
  pageSizeInput: number,
  typeInput: string | undefined,
  statusInput: string | undefined,
): Promise<{
  partners: PartnersDirectoryPayload[];
  totalPages: number;
  totalRows: number;
}> => {
  const validatedArgs = PartnersDirectoryParamsSchema.safeParse({
    query: queryInput,
    currentPage: currentPageInput,
    sort: sortInput,
    pageSize: pageSizeInput,
    type: typeInput,
    status: statusInput,
  });

  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching partners.");
  }
  const { query, currentPage, sort, pageSize, type, status } =
    validatedArgs.data;

  const offset = (currentPage - 1) * pageSize;

  // Dynamically set the sorting order
  const orderBy: Prisma.PartnerOrderByWithRelationInput = (() => {
    if (!sort) return { name: "asc" };
    const [field, direction] = sort.split(".");
    const dir = direction === "asc" ? "asc" : "desc";

    switch (field) {
      case "name":
        return { name: dir };
      case "type":
        return { type: dir };
      case "email":
        return { email: dir };
      case "city":
        return { city: dir };
      case "state":
        return { state: dir };
      case "createdAt":
        return { createdAt: dir };
      default:
        return { name: "asc" };
    }
  })();

  const whereClause: Prisma.PartnerWhereInput = {
    AND: [
      {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { city: { contains: query, mode: "insensitive" } },
        ],
      },
    ],
  };

  // Type faceted filter: comma-separated PartnerType values.
  // Only narrow when a strict, non-empty subset of valid types is selected.
  if (type) {
    const allTypes = Object.values(PartnerType) as string[];
    const selected = type
      .split(",")
      .filter((t) => allTypes.includes(t)) as PartnerType[];

    if (selected.length > 0 && selected.length < allTypes.length) {
      (whereClause.AND as Prisma.PartnerWhereInput[]).push({
        type: { in: selected },
      });
    }
  }

  // Status faceted filter: "active" / "inactive".
  // Only narrow when exactly one of the two is chosen.
  if (status) {
    const selected = status.split(",").filter(Boolean);
    const wantsActive = selected.includes("active");
    const wantsInactive = selected.includes("inactive");

    if (wantsActive && !wantsInactive) {
      (whereClause.AND as Prisma.PartnerWhereInput[]).push({ isActive: true });
    } else if (wantsInactive && !wantsActive) {
      (whereClause.AND as Prisma.PartnerWhereInput[]).push({ isActive: false });
    }
  }

  try {
    const [totalRows, partners] = await prisma.$transaction([
      prisma.partner.count({ where: whereClause }),
      prisma.partner.findMany({
        where: whereClause,
        orderBy,
        skip: offset,
        take: pageSize,
        select: {
          id: true,
          name: true,
          type: true,
          email: true,
          phone: true,
          website: true,
          city: true,
          state: true,
          isActive: true,
          _count: {
            select: {
              contacts: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalRows / pageSize);

    return { partners, totalPages, totalRows };
  } catch (error) {
    console.error("Error fetching partners.", error);
    throw new Error("Error fetching partners.");
  }
};

const _fetchPartnerForEdit = async (
  id: string,
): Promise<PartnerFormPayload | null> => {
  const parsedId = cuidSchema.safeParse(id);

  if (!parsedId.success) {
    throw new Error("Invalid partner ID format.");
  }

  try {
    const partner = await prisma.partner.findUnique({
      where: { id: parsedId.data },
      select: {
        id: true,
        name: true,
        type: true,
        email: true,
        phone: true,
        website: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        isActive: true,
        notes: true,
      },
    });

    return partner;
  } catch (error) {
    console.error("Error fetching partner for edit.", error);
    throw new Error("Error fetching partner data.");
  }
};

const _fetchSectionCardsPartnerData = async (
  id: string,
): Promise<PartnerSectionCardPayload | null> => {
  const parsedId = cuidSchema.safeParse(id);

  if (!parsedId.success) {
    throw new Error("Invalid partner ID format.");
  }

  const validatedPartnerId = parsedId.data;

  try {
    const partner = await prisma.partner.findUnique({
      where: { id: validatedPartnerId },
      select: {
        id: true,
        name: true,
        type: true,
        email: true,
        phone: true,
        website: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        isActive: true,
        notes: true,
        // Deterministic primary contact, at most one exists (DB-enforced)
        contacts: {
          where: { isPrimary: true, isActive: true },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: {
            role: true,
            person: {
              select: { id: true, name: true, email: true, phone: true },
            },
          },
        },
        _count: {
          select: {
            contacts: true,
            transferredInAnimals: true,
            transferredOutAnimals: true,
            partnerNotes: true,
          },
        },
      },
    });

    return partner;
  } catch (error) {
    console.error("Error fetching partner by ID.", error);
    throw new Error("Error fetching partner details.");
  }
};

export const fetchSectionCardsPartnerData = RequirePermission(
  AppPermissions.PARTNERS_READ,
)(_fetchSectionCardsPartnerData);

export const fetchPartnerForEdit = RequirePermission(
  AppPermissions.PARTNERS_MANAGE,
)(_fetchPartnerForEdit);

export const fetchPartners = RequirePermission(AppPermissions.PARTNERS_READ)(
  _fetchPartners,
);