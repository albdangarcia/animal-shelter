import { isLocalDatabaseUrl } from "@/app/lib/db-url";

/**
 * Free-tier Gemini (and Groq) send every prompt and tool result to the
 * provider for "product improvement and human review". Overview decision
 * permits that here *only* because the shelter database is 100% synthetic —
 * but permitting is not enforcing.
 *
 * This is the enforcement. It runs at import time in `provider.ts`, and the
 * only input it trusts for "is this database safe to leak" is the connection
 * URL the app actually runs against (`DATABASE_URL`), classified by
 * `isLocalDatabaseUrl`. A deployment pointed at a real, networked database
 * cannot flip a separate flag to make this pass — there is no separate flag.
 *
 * `AI_PROVIDER_TIER` is the one declared knob:
 *   - `paid`  — the API key is a paid key whose traffic is not retained for
 *               training; any database is then allowed.
 *   - `free` / unset — free tier; allowed only against a local/private database.
 *
 * Fail-closed: an unset or unrecognized tier against a non-local database
 * throws.
 */

export type AiProviderTier = "free" | "paid";

export class AiProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderConfigError";
  }
}

export function parseAiProviderTier(raw: string | undefined): AiProviderTier {
  const value = raw?.trim().toLowerCase();
  if (value === undefined || value === "") return "free";
  if (value === "free" || value === "paid") return value;
  throw new AiProviderConfigError(
    `AI_PROVIDER_TIER must be "free" or "paid" (got "${raw}").`,
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
  if (isLocalDatabaseUrl(input.databaseUrl)) return;

  throw new AiProviderConfigError(
    "Refusing to initialise the AI provider: AI_PROVIDER_TIER is not \"paid\" and " +
      "DATABASE_URL does not point at a local/private database. Free-tier model " +
      "providers retain prompts and tool results for training and human review, " +
      "which is only acceptable against the synthetic demo database. Set " +
      "AI_PROVIDER_TIER=paid (with a paid API key) to use a networked database.",
  );
}
