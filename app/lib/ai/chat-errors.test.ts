import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_ERROR_COPY,
  classifyChatError,
  describeChatError,
} from "./chat-errors";

test("free-tier capacity failures are told apart from configuration failures", () => {
  assert.equal(
    classifyChatError("[503] The model is overloaded. Please try again later."),
    "busy",
  );
  assert.equal(classifyChatError("429 Too Many Requests: quota exceeded"), "busy");
  assert.equal(
    classifyChatError("API key not valid. Please pass a valid API key."),
    "misconfigured",
  );
  assert.equal(classifyChatError("something else entirely"), "unknown");
});

test("copy the server authored is passed through unchanged", () => {
  assert.equal(
    describeChatError(new Error(CHAT_ERROR_COPY.busy)),
    CHAT_ERROR_COPY.busy,
  );
});

test("an expired session is distinguished from a broken assistant", () => {
  assert.equal(
    describeChatError(new Error('401: {"error":"Unauthorized: You must be logged in."}')),
    CHAT_ERROR_COPY.signedOut,
  );
});

test("a browser network failure reads as a connection problem", () => {
  assert.equal(
    describeChatError(new TypeError("Failed to fetch")),
    CHAT_ERROR_COPY.offline,
  );
});

test("raw provider and database text never reaches the screen", () => {
  const leaky = [
    "GoogleGenerativeAIError: models/gemini-3.5-flash is not found for API version v1beta",
    'PrismaClientKnownRequestError: connect ECONNREFUSED 10.0.0.4:5432',
    "AI_APICallError: x-goog-api-key AIzaSyC-not-a-real-key",
    "AI_APICallError: Invalid API Key provided: gsk_notARealGroqKey000000000000000000000000000000000000",
  ];

  for (const message of leaky) {
    const shown = describeChatError(new Error(message));
    assert.ok(
      Object.values(CHAT_ERROR_COPY).includes(
        shown as (typeof CHAT_ERROR_COPY)[keyof typeof CHAT_ERROR_COPY],
      ),
      `expected authored copy, got: ${shown}`,
    );
    assert.doesNotMatch(shown, /gemini|Prisma|ECONNREFUSED|AIzaSy|gsk_/i);
  }
});

test("a missing error still produces copy rather than an empty banner", () => {
  assert.equal(describeChatError(undefined), CHAT_ERROR_COPY.unknown);
});
