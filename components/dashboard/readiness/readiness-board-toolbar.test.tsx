import { beforeEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ReadinessBoardToolbar } from "@/components/dashboard/readiness/readiness-board-toolbar";
import { resetNavigation } from "@/tests/components/next-navigation";

vi.mock("next/navigation", () => import("@/tests/components/next-navigation"));

// The board's toolbar shows **All groups** only when the board shows one
// group. Whether it does is the server's call (its parse of `?kind=`), passed
// in as `drilledDown`, not the URL's: an unknown or empty `kind` is the
// overview, so a toolbar that read the URL showed a button to leave a group
// that was never open. The browser keeps the wiring
// (tests/e2e/readiness/readiness-board.spec.ts).

const OPTIONS = { species: [], locations: [], stages: [] };

const allGroups = () => page.getByRole("link", { name: "All groups" });

beforeEach(() => {
  resetNavigation("/dashboard/readiness");
});

describe("ReadinessBoardToolbar", () => {
  test("an unknown group in the URL on the overview shows no All groups link", async () => {
    resetNavigation("/dashboard/readiness?kind=BOGUS");
    await render(<ReadinessBoardToolbar options={OPTIONS} drilledDown={false} />);

    // The filters render, so the link's absence is not an empty toolbar.
    await expect
      .element(page.getByRole("button", { name: "Species", exact: true }))
      .toBeVisible();
    await expect.element(allGroups()).not.toBeInTheDocument();
  });

  test("an open group links back to the overview, keeping the filters but not the group or page", async () => {
    resetNavigation(
      "/dashboard/readiness?species=Cat&kind=NO_PHOTO&page=2&stage=DRAFT",
    );
    await render(<ReadinessBoardToolbar options={OPTIONS} drilledDown />);

    await expect
      .element(allGroups())
      .toHaveAttribute("href", "/dashboard/readiness?species=Cat&stage=DRAFT");
  });

  test("an open group with no filters links to the bare board", async () => {
    resetNavigation("/dashboard/readiness?kind=NO_PHOTO&page=3");
    await render(<ReadinessBoardToolbar options={OPTIONS} drilledDown />);

    await expect
      .element(allGroups())
      .toHaveAttribute("href", "/dashboard/readiness");
  });
});
