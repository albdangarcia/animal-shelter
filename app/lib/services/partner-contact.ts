import prisma, { type TransactionClient } from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { Role } from "@/prisma/generated/enums";
import type { LinkablePersonPayload } from "@/app/lib/types";
import { nonAdminPersonFilter } from "@/app/lib/data/people-directory/person-search";
import {
  NotFoundError,
  PreconditionFailedError,
} from "@/app/lib/utils/errors";

/**
 * The rules for who is a contact at a partner, kept apart from the actions so
 * a plain `node:test` can drive them against a real Postgres.
 *
 * Like `person-account-unlink`, this module has no `next/*` and no auth
 * imports. The writes run inside the caller's `prisma.$transaction`.
 *
 * Two rules hold for every save:
 * - A contact who is not active is never primary. The partner's page only
 *   shows an *active* primary, so a contact saved as primary-but-inactive
 *   would be listed as Primary while the page said "No primary contact set."
 * - A partner has one primary. Making a contact primary demotes the old one
 *   in the same transaction, before the partial unique index can object.
 */

export interface PartnerContactInput {
  role: string | null;
  isPrimary: boolean;
  isActive: boolean;
}

/**
 * Holds the partner's row for the rest of the transaction, so two saves that
 * both want to be primary run one after the other. Without it each demotes
 * nothing (no primary yet), both write primary, and the loser fails on the
 * one-primary index.
 */
const lockPartner = async (tx: TransactionClient, partnerId: string) => {
  await tx.$queryRaw`SELECT id FROM partners WHERE id = ${partnerId} FOR NO KEY UPDATE`;
};

/** Inactive contacts can't be primary, so unticking Active wins. */
const effectivePrimary = ({ isPrimary, isActive }: PartnerContactInput) =>
  isActive && isPrimary;

/**
 * What the partner's page reads for "Primary Contact". Shared with that query
 * so the page and the Contacts tab can't drift apart again.
 */
export const primaryContactArgs = {
  where: { isPrimary: true, isActive: true },
  orderBy: { createdAt: "asc" },
  take: 1,
  select: {
    role: true,
    person: {
      select: { id: true, name: true, email: true, phone: true },
    },
  },
} satisfies Prisma.PartnerContactFindManyArgs;

/**
 * Links a person to a partner. A person who used to be a contact here already
 * has a row (`@@unique([partnerId, personId])`), so that row is brought back
 * with the role, primary and active values just submitted; otherwise a row is
 * created. Administrators are refused: the People Directory hides them, so
 * their names would link to "Person Not Found".
 */
export const addContact = async (
  tx: TransactionClient,
  partnerId: string,
  personId: string,
  input: PartnerContactInput,
) => {
  await lockPartner(tx, partnerId);
  const person = await tx.person.findUnique({
    where: { id: personId },
    select: { user: { select: { role: true } } },
  });
  if (!person) {
    throw new NotFoundError("That person was not found.");
  }
  if (person.user?.role === Role.ADMIN) {
    throw new PreconditionFailedError(
      "Administrators can't be added as partner contacts.",
    );
  }

  const isPrimary = effectivePrimary(input);
  const existing = await tx.partnerContact.findUnique({
    where: { partnerId_personId: { partnerId, personId } },
    select: { id: true },
  });

  if (isPrimary) {
    await tx.partnerContact.updateMany({
      where: {
        partnerId,
        isPrimary: true,
        ...(existing ? { id: { not: existing.id } } : {}),
      },
      data: { isPrimary: false },
    });
  }

  const data = { role: input.role, isPrimary, isActive: input.isActive };
  if (existing) {
    return tx.partnerContact.update({
      where: { id: existing.id },
      data,
      select: { id: true },
    });
  }
  return tx.partnerContact.create({
    data: { partnerId, personId, ...data },
    select: { id: true },
  });
};

/** Changes a contact's role, primary and active. Who they are can't change. */
export const updateContact = async (
  tx: TransactionClient,
  partnerId: string,
  contactId: string,
  input: PartnerContactInput,
) => {
  await lockPartner(tx, partnerId);
  const existing = await tx.partnerContact.findFirst({
    where: { id: contactId, partnerId },
    select: { id: true },
  });
  if (!existing) {
    throw new NotFoundError("Contact not found.");
  }

  const isPrimary = effectivePrimary(input);
  if (isPrimary) {
    // Demote any OTHER primary (not this row) before promoting this one.
    await tx.partnerContact.updateMany({
      where: { partnerId, isPrimary: true, id: { not: contactId } },
      data: { isPrimary: false },
    });
  }

  return tx.partnerContact.update({
    where: { id: contactId },
    data: { role: input.role, isPrimary, isActive: input.isActive },
    select: { id: true },
  });
};

/**
 * Who the Add Contact picker offers: everyone the People Directory lists,
 * except people who are already active contacts here. A former contact stays
 * in the list, flagged, because adding them again reactivates the link.
 */
export const fetchLinkablePeopleFor = async (
  partnerId: string,
): Promise<LinkablePersonPayload[]> => {
  const rows = await prisma.person.findMany({
    where: {
      AND: [
        nonAdminPersonFilter,
        {
          NOT: {
            partnerContacts: { some: { partnerId, isActive: true } },
          },
        },
      ],
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

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    isDeactivatedContactHere: p.partnerContacts.length > 0,
  }));
};
