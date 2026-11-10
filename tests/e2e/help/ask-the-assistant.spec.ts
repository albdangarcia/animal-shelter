import { expect, test, type Page } from "@playwright/test";
import {
  bootstrapStorageState,
  SEEDED_USER_PASSWORD,
  storageStatePathFor,
  waitForPathname,
} from "../support/applications";

// A Help search that finds nothing offers the assistant to the people who
// can use it. The assistant's guide tools, their filtering and the chat's
// link check are covered by the unit tests in app/lib/ai/. This is what only
// a browser can show: the offer on the page, the query arriving in the
// chat's message box unsent, and a foster (no AI_CHAT_USE) never seeing it.
// No model is called: nothing is sent.

const staffState = storageStatePathFor("ask-the-assistant-staff.state.json");
const fosterState = storageStatePathFor("ask-the-assistant-foster.state.json");

// No guide has either word, so not even the any-word fallback shows one.
const NO_MATCH = "parrot grooming";

test.beforeAll(async ({ browser }) => {
  await bootstrapStorageState(browser, {
    email: "staff1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: staffState,
  });
  await bootstrapStorageState(browser, {
    email: "foster1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: fosterState,
  });
});

const searchFor = async (page: Page, query: string) => {
  await page.goto("/dashboard/help");
  await page.getByRole("searchbox", { name: "Search help" }).fill(query);
  await expect(page.getByRole("status")).toContainText(`No guides match “${query}”.`);
};

test.describe("staff", () => {
  test.use({ storageState: staffState });

  test("ask the assistant after a search that found nothing, and the question waits in the message box", async ({
    page,
  }) => {
    const chatRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/ai-chat") {
        chatRequests.push(request.url());
      }
    });

    await searchFor(page, NO_MATCH);
    await page.getByRole("link", { name: "Ask the assistant" }).click();

    await waitForPathname(page, "/dashboard/ai-chat");
    const composer = page.getByRole("textbox", { name: "Message the shelter assistant" });
    await expect(composer).toHaveValue(NO_MATCH);
    await expect(composer).toBeFocused();
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();

    // Not sent: the empty state's examples are still offered, and nothing
    // went to the chat endpoint.
    await expect(
      page.getByRole("button", { name: "How do I record a rabies vaccine?" }),
    ).toBeVisible();
    expect(chatRequests).toEqual([]);
  });
});

test.describe("a foster", () => {
  test.use({ storageState: fosterState });

  test("is not offered the assistant", async ({ page }) => {
    await searchFor(page, NO_MATCH);
    await expect(page.getByRole("link", { name: "Ask the assistant" })).toHaveCount(0);
  });
});
