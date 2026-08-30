import { AiProviderConfigError } from "./provider-guard";

/**
 * The HMAC secret the AI SDK uses to sign tool-approval requests
 * (`experimental_toolApprovalSecret`).
 *
 * In the `useChat` pattern the server rebuilds the conversation from messages
 * the client sends each turn, so an approval — tool name, call id, and input
 * arguments — is client-controlled input on replay. Signing binds the approval
 * to exactly what was approved; without it a client can craft a schema-valid
 * approval and skip the human entirely.
 *
 * **Fail closed.** A missing secret must not silently degrade to unsigned
 * approvals, so this throws rather than returning `undefined`. The route calls
 * it only when the caller's tool set actually contains a write tool — a
 * volunteer's read-only chat does not depend on it — and turns the throw into
 * the "not configured correctly" error copy.
 */
export function getToolApprovalSecret(): string {
  const secret = process.env.AI_TOOL_APPROVAL_SECRET?.trim();
  if (!secret) {
    throw new AiProviderConfigError(
      "AI_TOOL_APPROVAL_SECRET is not set. Write tools sign their approval " +
        "requests so a client cannot forge one; refusing to run a write tool " +
        "with unsigned approvals. Set AI_TOOL_APPROVAL_SECRET to a random " +
        "secret (openssl rand -base64 32).",
    );
  }
  return secret;
}
