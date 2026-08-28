import { groq } from "@ai-sdk/groq";
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
 * Model: `openai/gpt-oss-120b` on Groq.
 *
 * Was `gemini-3.5-flash` (`@ai-sdk/google`). The move is not
 * about latency — it is that Gemini's free tier allows **20 requests per day**
 * for this model (`generate_content_free_tier_requests`), and one answer costs
 * one request *per tool-loop step*, times up to three SDK retry attempts. That
 * is roughly four conversations before a 24-hour lockout, which is not a
 * development environment.
 *
 * Why this model of the ones Groq serves: the behaviour that decides this
 * feature is refusing to guess between two animals with the same name, which
 * is instruction-following under ambiguity rather than throughput.
 * `gpt-oss-120b` is the largest reasoning-trained general model available
 * there; `gpt-oss-20b` trades exactly that capability for speed this feature
 * does not need. `groq/compound` is excluded on design grounds rather than
 * quality: it carries its own built-in server-side tools, which would break
 * the guarantee that a request contains only the tools the caller's role
 * permits.
 *
 * Auth: `@ai-sdk/groq` reads `GROQ_API_KEY` from the environment on its own.
 */

export const MODEL_ID = "openai/gpt-oss-120b";

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

export const model = groq(MODEL_ID);
