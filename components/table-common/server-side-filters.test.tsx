import { beforeEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { ServerSideSort } from "@/components/table-common/server-side-sort";
import {
  currentUrl,
  resetNavigation,
  routerCalls,
  setUrl,
} from "@/tests/components/next-navigation";

vi.mock("next/navigation", () => import("@/tests/components/next-navigation"));

// The two URL-driven controls every list toolbar shares (the dashboard lists,
// the reports and /pets): the faceted filter and the sort. Each reads its state
// from the URL on every render and writes its own parameter back, so what a
// click writes, and that the control follows a URL it did not change (a
// Reset, a back button), is checked here, once for all of them. The browser
// keeps the wiring: that a page passes the `paramKey` its server reads
// (tests/e2e/pets/filter-reset.spec.ts).
//
// The test page is narrow, so the faceted trigger shows its phone layout: the
// count badge and the labels are both in its text, as in "Color1Black".

const COLORS = [
  { label: "Black", value: "Black" },
  { label: "White", value: "White" },
  { label: "Brown", value: "Brown" },
];

// The intake list's options, under a key no caller uses, so a sort that
// hard-coded /pets's first option or the "sort" key would fail here.
const SORT_OPTIONS = [
  { label: "Newest First", value: "date.desc" },
  { label: "Oldest First", value: "date.asc" },
];

const colorTrigger = () => page.getByRole("button", { name: /^Color/ });
// exact: a name is otherwise a substring match.
const option = (name: string) => page.getByRole("option", { name, exact: true });
const sortTrigger = () => page.getByRole("combobox", { name: "Sort by:" });

/** Waits until the fake router's URL reads exactly `expected`. */
const expectUrl = (expected: string) => expect.poll(currentUrl).toBe(expected);

const renderColorFilter = () =>
  render(<ServerSideFacetedFilter title="Color" paramKey="color" options={COLORS} />);

beforeEach(() => {
  resetNavigation("/list");
});

describe("ServerSideFacetedFilter", () => {
  test("each pick toggles its value in the parameter, back on page 1, keeping the others", async () => {
    resetNavigation("/list?query=bud&page=3");
    await renderColorFilter();

    // The popover stays open between picks.
    await colorTrigger().click();
    await option("Black").click();
    await expectUrl("/list?query=bud&page=1&color=Black");
    await option("White").click();
    await expectUrl("/list?query=bud&page=1&color=Black%2CWhite");
    await option("Black").click();
    await expectUrl("/list?query=bud&page=1&color=White");
    await option("White").click();
    await expectUrl("/list?query=bud&page=1");

    expect(routerCalls).toEqual([
      { method: "replace", href: "/list?query=bud&page=1&color=Black" },
      { method: "replace", href: "/list?query=bud&page=1&color=Black%2CWhite" },
      { method: "replace", href: "/list?query=bud&page=1&color=White" },
      { method: "replace", href: "/list?query=bud&page=1" },
    ]);
  });

  test("the trigger shows the URL's selection, and follows the URL when something else changes it", async () => {
    resetNavigation("/list?color=Black");
    await renderColorFilter();
    await expect.element(colorTrigger()).toHaveTextContent("Color1Black");

    setUrl("/list?color=Black%2CWhite");
    await expect.element(colorTrigger()).toHaveTextContent("Color2BlackWhite");

    setUrl("/list");
    await expect.element(colorTrigger()).toHaveTextContent("Color");
  });

  test("Clear filters deletes the parameter, back on page 1, keeping the others, then goes", async () => {
    resetNavigation("/list?query=bud&color=Black%2CWhite&page=3");
    await renderColorFilter();

    await colorTrigger().click();
    await option("Clear filters").click();

    await expectUrl("/list?query=bud&page=1");
    expect(routerCalls).toEqual([
      { method: "replace", href: "/list?query=bud&page=1" },
    ]);
    // Nothing is selected now, so the item is not offered; the list is still open.
    await expect.element(option("Black")).toBeVisible();
    await expect.element(option("Clear filters")).not.toBeInTheDocument();
  });
});

describe("ServerSideSort", () => {
  test("the trigger shows the URL's sort, or the first option without one, and each choice writes its value back on page 1", async () => {
    resetNavigation("/list?order=date.asc");
    await render(
      <ServerSideSort paramKey="order" placeholder="Sort by" options={SORT_OPTIONS} />,
    );
    await expect.element(sortTrigger()).toHaveTextContent("Oldest First");

    // As a Reset leaves it: no sort, so the first option is the one in force.
    setUrl("/list?query=bud&page=3");
    await expect.element(sortTrigger()).toHaveTextContent("Newest First");

    await sortTrigger().click();
    await option("Oldest First").click();
    await expectUrl("/list?query=bud&page=1&order=date.asc");
    await expect.element(sortTrigger()).toHaveTextContent("Oldest First");

    // Each option writes its own value.
    await sortTrigger().click();
    await option("Newest First").click();
    await expectUrl("/list?query=bud&page=1&order=date.desc");
    await expect.element(sortTrigger()).toHaveTextContent("Newest First");

    expect(routerCalls).toEqual([
      { method: "replace", href: "/list?query=bud&page=1&order=date.asc" },
      { method: "replace", href: "/list?query=bud&page=1&order=date.desc" },
    ]);
  });
});
