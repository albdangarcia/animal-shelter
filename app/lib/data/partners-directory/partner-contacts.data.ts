import { prisma } from "@/app/lib/prisma";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import { PartnerContactsPayload, LinkablePersonPayload } from "../../types";

const _fetchPartnerContacts = async (
  inputPartnerId: string,
): Promise<{ contacts: PartnerContactsPayload[] }> => {
  const parsedId = cuidSchema.safeParse(inputPartnerId);

  if (!parsedId.success) {
    throw new Error("Invalid partner ID format.");
  }

  const partnerId = parsedId.data;

  try {
    const contacts = await prisma.partnerContact.findMany({
      where: { partnerId },
      orderBy: [
        { isPrimary: "desc" }, // primary first
        { isActive: "desc" }, // then active before inactive
        { createdAt: "asc" }, // then oldest first
      ],
      select: {
        id: true,
        role: true,
        isPrimary: true,
        isActive: true,
        person: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    return { contacts };
  } catch (error) {
    console.error("Error fetching partner contacts.", error);
    throw new Error("Could not fetch partner contacts.");
  }
};

const _fetchLinkablePeople = async (
  inputPartnerId: string,
): Promise<{ people: LinkablePersonPayload[] }> => {
  const parsedId = cuidSchema.safeParse(inputPartnerId);
  if (!parsedId.success) {
    throw new Error("Invalid partner ID format.");
  }
  const partnerId = parsedId.data;

  try {
    const rows = await prisma.person.findMany({
      where: {
        // Exclude people who are already ACTIVE contacts at this partner.
        NOT: {
          partnerContacts: { some: { partnerId, isActive: true } },
        },
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        partnerContacts: {
          where: { partnerId },
          select: { isActive: true },
          take: 1,
        },
      },
    });

    const people = rows.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      isDeactivatedContactHere: p.partnerContacts.length > 0,
    }));

    return { people };
  } catch (error) {
    console.error("Error fetching linkable people.", error);
    throw new Error("Could not fetch people.");
  }
};

export const fetchLinkablePeople = RequirePermission(
  AppPermissions.PARTNERS_MANAGE,
)(_fetchLinkablePeople);

export const fetchPartnerContacts = RequirePermission(
  AppPermissions.PARTNERS_READ,
)(_fetchPartnerContacts);