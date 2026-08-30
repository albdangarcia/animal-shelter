import { isLocalDatabaseUrl } from "@/app/lib/db-url";

/**
 * Free model-provider tiers send every prompt and tool result to the provider
 * for "product improvement and human review". That retention is a property of
 * free tiers generally, and applies to the Groq free tier the app uses today.
 * The decision permits it here *only* because the shelter database is
 * 100% synthetic — but permitting is not enforcing.
 *
 * This is the enforcement. It runs at import time in `provider.ts`.
 *
 * `AI_PROVIDER_TIER` is the one declared knob, and it has three values:
 *   - `paid` — the API key is a paid key whose traffic is not retained for
 *     training; any database is then allowed. This is a claim about the
 *     *provider*.
 *   - `free` / unset — free tier; allowed only against a database the
 *     connection URL shows to be local/private (`isLocalDatabaseUrl` on
 *     `DATABASE_URL`). This derivation is the only path to "allowed" that
 *     verifies anything.
 *   - `free-synthetic` — free tier against a networked database the operator
 *     certifies holds only seeded data. This is a claim about the *data*, and
 *     nothing here checks it: it is trusted, not verified.
 *
 * Fail-closed: the default is unchanged, so an unset or empty tier still parses
 * to `free` and still throws against a networked database. An unrecognized or
 * misspelled tier throws `AiProviderConfigError` at parse time rather than
 * degrading to `free`.
 */

export type AiProviderTier = "free" | "paid" | "free-synthetic";

export class AiProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderConfigError";
  }
}

export function parseAiProviderTier(raw: string | undefined): AiProviderTier {
  const value = raw?.trim().toLowerCase();
  if (value === undefined || value === "") return "free";
  if (value === "free" || value === "paid" || value === "free-synthetic") {
    return value;
  }
  throw new AiProviderConfigError(
    `AI_PROVIDER_TIER must be "free", "paid", or "free-synthetic" (got "${raw}").`,
  );
}

/**
 * Throws `AiProviderConfigError` when a free-tier provider would run against a
 * database that is not demonstrably local/synthetic. Pure — pass the tier and
 * URL in; `provider.ts` supplies `process.env.AI_PROVIDER_TIER` and the
 * resolved pooled `DATABASE_URL`.
 */
export function assertAiProviderAllowed(input: {
  tier: AiProviderTier;
  databaseUrl: string;
}): void {
  if (input.tier === "paid") return;
  if (input.tier === "free-synthetic") return;
  if (isLocalDatabaseUrl(input.databaseUrl)) return;

  throw new AiProviderConfigError(
    "Refusing to initialise the AI provider: AI_PROVIDER_TIER is not \"paid\" and " +
      "DATABASE_URL does not point at a local/private database. Free-tier model " +
      "providers retain prompts and tool results for training and human review, " +
      "which is only acceptable against the synthetic demo database. Set " +
      "AI_PROVIDER_TIER=paid (with a paid API key) to use a networked database.",
  );
}
