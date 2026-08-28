import { google } from "@ai-sdk/google";
import { resolveDatabaseUrl } from "@/app/lib/db-url";
import {
  assertAiProviderAllowed,
  parseAiProviderTier,
} from "./provider-guard";

/**
 * The one place the model provider is chosen. Every other AI
 * module imports `model` from here, so swapping providers or model versions is
 * a one-file change and never touches tool code.
 *
 * Model: `gemini-3.5-flash` — a GA Gemini 3 Flash model on the free tier, one
 * notch below the newest (`gemini-3.7-flash`). Pinned (not `gemini-flash-latest`)
 * so a model swap is a deliberate edit.
 *
 * Not `gemini-2.5-flash`: already 404s for new API keys ("no longer available
 * to new users"). Not `gemini-3.7-flash`: as of 2026-08 its free-tier tool-use
 * path returns sustained `503 "high demand"` — verified unusable for this
 * feature's tool loop, while `gemini-3.5-flash` answers tool-call prompts
 * reliably. Revisit once 3.7's capacity settles; it is a one-line change.
 *
 * Auth: `@ai-sdk/google` reads `GOOGLE_GENERATIVE_AI_API_KEY` from the
 * environment on its own.
 */

export const MODEL_ID = "gemini-3.5-flash";

/**
 * Hard cap on the tool loop. findAnimals →
 * getAnimalSummary → answer is 3 steps; this leaves headroom for one
 * clarification round-trip without allowing unbounded agentic looping in v1.
 */
export const MAX_STEPS = 5;

// Enforced at import: free-tier providers retain traffic for training, which
// permits only against the synthetic database. Throws if that invariant
// would be violated.
assertAiProviderAllowed({
  tier: parseAiProviderTier(process.env.AI_PROVIDER_TIER),
  databaseUrl: resolveDatabaseUrl("pooled"),
});

export const model = google(MODEL_ID);
