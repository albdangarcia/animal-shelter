/**
 * Chat failure copy, authored in one place and shared by the route handler and
 * the client.
 *
 * Three different things go wrong here and they look identical if you let them:
 * the free tier running out of capacity (recurring, and genuinely fixed by
 * waiting), a misconfigured key (never fixed by waiting), and everything else.
 * The route classifies server-side failures into these strings; the client
 * classifies transport failures and then renders *only* strings from this
 * table — never a provider, database, or browser message, whatever ends up on
 * the `Error`.
 */
export const CHAT_ERROR_COPY = {
  busy: "The assistant is busy right now. Wait a moment and try again.",
  misconfigured:
    "The assistant is not configured correctly. Contact an administrator.",
  signedOut: "Your session has expired. Refresh the page and sign in again.",
  offline: "Couldn't reach the assistant. Check your connection and try again.",
  unknown: "Something went wrong while answering. Try again.",
} as const;

export type ChatErrorKind = keyof typeof CHAT_ERROR_COPY;

const AUTHORED_MESSAGES = new Set<string>(Object.values(CHAT_ERROR_COPY));

/**
 * Classifies a raw failure message into one of the kinds above.
 *
 * Used server-side on the streamed error, where the message is a provider
 * error. Matching on text is coarse, but the alternative — mapping every
 * provider's error subclasses — is a maintenance burden for a distinction the
 * user experiences as "wait" versus "tell someone".
 */
export function classifyChatError(rawMessage: string): ChatErrorKind {
  if (
    /\b(429|503|500|overloaded|unavailable|high demand|rate limit|quota|exhausted)\b/i.test(
      rawMessage,
    )
  ) {
    return "busy";
  }
  if (/\b(api[_ -]?key|permission denied|unauthenticated|invalid credential)\b/i.test(rawMessage)) {
    return "misconfigured";
  }
  return "unknown";
}

/**
 * Turns whatever `useChat` surfaced into copy that is safe to render.
 *
 * The server already classified its own failures and sent back one of the
 * strings above, so those pass through. Anything else — a fetch rejection, an
 * HTTP error body, a provider string that escaped classification — is replaced
 * rather than shown. The guarantee this function exists to make is that no
 * unauthored text reaches the screen.
 */
export function describeChatError(error: Error | undefined): string {
  if (!error) return CHAT_ERROR_COPY.unknown;

  if (AUTHORED_MESSAGES.has(error.message)) return error.message;

  const raw = error.message;
  if (/\b(401|unauthorized|forbidden|403)\b/i.test(raw)) {
    return CHAT_ERROR_COPY.signedOut;
  }
  if (/failed to fetch|networkerror|load failed|err_internet/i.test(raw)) {
    return CHAT_ERROR_COPY.offline;
  }
  return CHAT_ERROR_COPY.unknown;
}
