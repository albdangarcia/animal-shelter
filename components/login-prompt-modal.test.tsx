import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { useState } from "react";
import LoginPromptModal from "@/components/login-prompt-modal";
import { resetNavigation } from "@/tests/components/next-navigation";

vi.mock("next/navigation", () => import("@/tests/components/next-navigation"));

// The prompt a signed-out visitor sees on tapping a heart. Its caller,
// FavoriteButton, sits inside a pet card's <Link>, and React events travel the
// React tree, not the DOM: a click or a key inside the portalled dialog reaches
// the Link, and every dismissal used to open the pet. The harness's parent
// <div> stands in for that Link, with spies where the Link would have heard
// the click and the key. It is never a real <a href>, and "Login / Sign Up" is
// never clicked: a click that navigates would take the test's page away. The
// link's href is read; that a real heart opens the prompt and the link works is
// tests/e2e/auth/callback-url-guard.spec.ts.

const parentClick = vi.fn();
const parentKeyDown = vi.fn();

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <div onClick={parentClick} onKeyDown={parentKeyDown}>
      <output data-testid="open">{String(open)}</output>
      <LoginPromptModal isOpen={open} onClose={() => setOpen(false)} />
    </div>
  );
}

const dialog = () => page.getByRole("dialog");
const signInLink = () => page.getByRole("link", { name: "Login / Sign Up" });

beforeEach(() => {
  parentClick.mockClear();
  parentKeyDown.mockClear();
  resetNavigation("/pets");
});

// The X, Cancel and the backdrop are clicks, so they catch a lost click guard;
// Radix closes on Escape from a listener on the document, so a click guard
// cannot show there, but the key itself starts on the focused element inside
// the dialog and bubbles through the React tree, which the keydown guard stops.
const dismissals = [
  {
    name: "the X",
    dismiss: () => dialog().getByRole("button", { name: "Close" }).click(),
    heard: parentClick,
  },
  {
    name: "Cancel",
    dismiss: () => dialog().getByRole("button", { name: "Cancel" }).click(),
    heard: parentClick,
  },
  {
    name: "Escape",
    dismiss: () => userEvent.keyboard("{Escape}"),
    heard: parentKeyDown,
  },
  {
    name: "a click on the backdrop",
    dismiss: () =>
      page
        .elementLocator(document.querySelector('[data-slot="dialog-overlay"]')!)
        .click({ position: { x: 5, y: 5 } }),
    heard: parentClick,
  },
];

for (const { name, dismiss, heard } of dismissals) {
  test(`${name} closes the prompt and tells the caller, and the parent never hears it`, async () => {
    await render(<Harness />);
    await expect.element(dialog()).toBeVisible();

    await dismiss();

    await expect.element(dialog()).not.toBeInTheDocument();
    // The dialog is controlled, so it stays open unless onClose ran.
    await expect.element(page.getByTestId("open")).toHaveTextContent("false");
    expect(heard).not.toHaveBeenCalled();
  });
}

// Every click inside the dialog is contained, not only the ones that dismiss it.
test("a click on the prompt's own text stays inside it too", async () => {
  await render(<Harness />);

  await page.getByText(/You need to be logged in/).click();

  expect(parentClick).not.toHaveBeenCalled();
  await expect.element(dialog()).toBeVisible();
});

test("the sign-in link returns to the page and its whole query, encoded", async () => {
  resetNavigation("/pets?category=Dog&sort=name.asc");
  await render(<Harness />);

  await expect.element(signInLink()).toHaveAttribute(
    "href",
    "/sign-in?callbackUrl=%2Fpets%3Fcategory%3DDog%26sort%3Dname.asc",
  );
});

test("the sign-in link has no stray ? when the page has no query", async () => {
  await render(<Harness />);

  await expect.element(signInLink()).toHaveAttribute(
    "href",
    "/sign-in?callbackUrl=%2Fpets",
  );
});
