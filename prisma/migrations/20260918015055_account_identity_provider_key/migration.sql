-- Reverts the transitional Better Auth 1.7.0-1.7.2 `issuer`-keyed account
-- identity (upstream reverted this in 1.7.3) back to `(providerId, accountId)`.
-- The old unique index must be dropped before the `issuer` column itself,
-- otherwise some databases are left with an unintended unique constraint on
-- `account_id` alone once the composite index's other column disappears.

-- DropIndex
DROP INDEX "accounts_issuer_account_id_key";

-- AlterTable
ALTER TABLE "accounts" DROP COLUMN "issuer";

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_id_account_id_key" ON "accounts"("provider_id", "account_id");
