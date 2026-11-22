import { beforeEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { SimplePagination } from "@/components/simple-pagination";
import { resetNavigation } from "@/tests/components/next-navigation";

vi.mock("next/navigation", () => import("@/tests/components/next-navigation"));

// The pager every paginated list shares reads its page from the URL. A page
// that is not a positive whole number (a hand-edited or stale link) is page 1:
// otherwise no page is current and Next points at page 0. The Readiness Board's
// server reads such a page as 1 too; the other lists refuse it on the server
// and show their error page, so the pager never renders there.

const pageLink = (name: string) => page.getByRole("link", { name, exact: true });
const next = () => page.getByRole("link", { name: "Go to next page" });
const previous = () => page.getByRole("link", { name: "Go to previous page" });

beforeEach(() => {
  resetNavigation("/list");
});

describe("SimplePagination", () => {
  for (const raw of ["-1", "0", "1.5", "abc"]) {
    test(`page=${raw} is page 1: page 1 is current and Next goes to page 2`, async () => {
      resetNavigation(`/list?query=bud&page=${raw}`);
      await render(<SimplePagination totalPages={5} />);

      await expect.element(pageLink("1")).toHaveAttribute("aria-current", "page");
      await expect
        .element(next())
        .toHaveAttribute("href", "/list?query=bud&page=2");
      await expect.element(previous()).toHaveAttribute("aria-disabled", "true");
    });
  }

  test("a valid page is current and its neighbours are linked", async () => {
    resetNavigation("/list?page=3");
    await render(<SimplePagination totalPages={5} />);

    await expect.element(pageLink("3")).toHaveAttribute("aria-current", "page");
    await expect.element(previous()).toHaveAttribute("href", "/list?page=2");
    await expect.element(next()).toHaveAttribute("href", "/list?page=4");
  });
});
