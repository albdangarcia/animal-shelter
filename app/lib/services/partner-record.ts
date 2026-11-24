import type { TransactionClient } from "@/app/lib/prisma";
import {
  isHomeCountry,
  type PartnerFormInput,
} from "@/app/lib/zod-schemas/partners-directory.schemas";

/**
 * The columns a partner is saved with, from form values that passed
 * `PartnerFormSchema`. Empty strings are saved as null.
 *
 * A partner in the US is saved with no country ("US" is not stored, so one
 * value means the US), and its state. A partner elsewhere is saved with its
 * country and no state: the schema already refuses a state there, and this
 * drops one anyway, so no row says both.
 *
 * `isActive` is optional in the schema, so a payload that omits it saves an
 * active partner.
 */
export const partnerColumns = (values: PartnerFormInput) => {
  const inUs = isHomeCountry(values.country);
  return {
    name: values.name,
    type: values.type,
    email: values.email || null,
    phone: values.phone || null,
    website: values.website || null,
    address: values.address || null,
    city: values.city || null,
    state: inUs ? values.state || null : null,
    zipCode: values.zipCode || null,
    country: inUs ? null : values.country!,
    isActive: values.isActive ?? true,
    notes: values.notes || null,
  };
};

type Db = Pick<TransactionClient, "partner">;

/**
 * Creates a partner. Runs against the plain client or a transaction, and has
 * no auth or `next/*` imports, so database tests drive it directly. The
 * caller checks the name first (`partnerNameRefusal`).
 */
export const createPartnerRecord = async (
  db: Db,
  values: PartnerFormInput,
): Promise<{ id: string }> =>
  db.partner.create({ data: partnerColumns(values), select: { id: true } });

/** Saves the form's values over partner `id`. As `createPartnerRecord`. */
export const updatePartnerRecord = async (
  db: Db,
  id: string,
  values: PartnerFormInput,
): Promise<void> => {
  await db.partner.update({ where: { id }, data: partnerColumns(values) });
};
