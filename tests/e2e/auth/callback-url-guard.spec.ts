import { expect, test, type Page } from "@playwright/test";

// The category filter guarantees at least one PUBLISHED result regardless of
// the seed's random generation: prisma/seed.ts hand-authors several IN_CARE
// dogs (e.g. "Frisco") independent of the procedurally generated animals, so
// this doesn't depend on how many pets the seed happens to produce or on
// pagination math (unlike `?page=2`, which only has a second page because the
// seed currently generates ~54 published animals against a 10-per-page grid).
const petsUrlWithQuery = "/pets?category=Dog";

const adminPassword = process.env.ADMIN_PASSWORD;

test.beforeAll(() => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the seeded admin login test.",
    );
  }
});

// Mirrors the credentials-form locators used in login.spec.ts.
const signInWithAdmin = async (page: Page) => {
  const credentialsForm = page.locator("form").filter({
    has: page.getByLabel(/email address/i),
  });
  await page.getByLabel(/email address/i).fill("admin@example.com");
  await page.getByLabel(/^password$/i).fill(adminPassword!);
  await credentialsForm.getByRole("button", { name: /^sign in$/i }).click();
};

test("signing in from the login modal returns to the same pets URL, query string intact", async ({
  page,
}) => {
  await page.goto(petsUrlWithQuery);

  await page
    .getByRole("button", { name: "Like this pet" })
    .first()
    .click();

  await page.getByRole("link", { name: /login \/ sign up/i }).click();
  await page.waitForURL((url) => url.pathname === "/sign-in", {
    timeout: 10_000,
  });
  const signInUrl = new URL(page.url());
  expect(signInUrl.searchParams.get("callbackUrl")).toBe(petsUrlWithQuery);

  await signInWithAdmin(page);

  await page.waitForURL(
    (url) => url.pathname === "/pets" && url.search === "?category=Dog",
    { timeout: 60_000 },
  );
});

test("the login modal's link encodes the current path and query string", async ({
  page,
}) => {
  await page.goto(petsUrlWithQuery);

  await page
    .getByRole("button", { name: "Like this pet" })
    .first()
    .click();

  const loginLink = page.getByRole("link", { name: /login \/ sign up/i });
  await expect(loginLink).toHaveAttribute(
    "href",
    `/sign-in?callbackUrl=${encodeURIComponent(petsUrlWithQuery)}`,
  );
});

test("a protocol-relative callbackUrl never leaves the app's origin", async ({
  page,
  baseURL,
}) => {
  await page.goto(
    `/sign-in?callbackUrl=${encodeURIComponent("//evil.com")}`,
  );

  await signInWithAdmin(page);

  await page.waitForURL((url) => url.pathname !== "/sign-in", {
    timeout: 60_000,
  });
  expect(new URL(page.url()).host).toBe(new URL(baseURL!).host);
});

test("the backslash spelling of a protocol-relative callbackUrl never leaves the app's origin", async ({
  page,
  baseURL,
}) => {
  await page.goto(
    `/sign-in?callbackUrl=${encodeURIComponent("/\\evil.com")}`,
  );

  await signInWithAdmin(page);

  await page.waitForURL((url) => url.pathname !== "/sign-in", {
    timeout: 60_000,
  });
  expect(new URL(page.url()).host).toBe(new URL(baseURL!).host);
});

test("an already-signed-in visitor with a malicious callbackUrl is redirected to the safe fallback, not off-origin", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await signInWithAdmin(page);
  await page.waitForURL((url) => url.pathname !== "/sign-in", {
    timeout: 60_000,
  });

  await page.goto(
    `/sign-in?callbackUrl=${encodeURIComponent("//evil.com")}`,
  );

  await page.waitForURL((url) => url.pathname === "/", { timeout: 60_000 });
  expect(new URL(page.url()).pathname).toBe("/");
});

// A malicious callbackUrl alone can't tell this branch apart from the old
// hardcoded `redirect("/")` — both land on "/". A valid callbackUrl is the
// only input that distinguishes "the guard neutralized this" from "this
// branch never looked at callbackUrl at all," so it's the real regression
// check for the judgement call in page.tsx (redirecting already-signed-in
// visitors to their deep link instead of always dumping them on "/").
test("an already-signed-in visitor with a valid callbackUrl is returned to it, not dumped on the home page", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await signInWithAdmin(page);
  await page.waitForURL((url) => url.pathname !== "/sign-in", {
    timeout: 60_000,
  });

  await page.goto(
    `/sign-in?callbackUrl=${encodeURIComponent(petsUrlWithQuery)}`,
  );

  await page.waitForURL(
    (url) => url.pathname === "/pets" && url.search === "?category=Dog",
    { timeout: 60_000 },
  );
});
