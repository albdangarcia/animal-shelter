-- At most one primary contact per partner.
-- Partial unique index: the uniqueness only applies to rows where is_primary = true,
-- so a partner can have many non-primary contacts but only one primary.
CREATE UNIQUE INDEX "partner_contact_one_primary"
  ON "partner_contacts" ("partnerId")
  WHERE "isPrimary" = true;