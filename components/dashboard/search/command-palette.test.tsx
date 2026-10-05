import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { GlobalSearchResults } from "@/app/lib/data/search/global-search";
import { CommandPaletteProvider } from "@/components/dashboard/search/command-palette-provider";
import { SearchTrigger } from "@/components/dashboard/search/search-trigger";
import { resetNavigation, routerCalls } from "@/tests/components/next-navigation";

vi.mock("next/navigation", () => import("@/tests/components/next-navigation"));

// The ⌘K palette as the header drives it: the provider (open state and the
// shortcut), the search bar, and the dialog, with `/api/search` answered by a
// stub. The browser keeps what only the page shows: that the layout hands the
// palette its permission-filtered nav items, that the header renders the bar,
// and a search against real rows (tests/e2e/search/global-search.spec.ts).

const NAV_ITEMS = [
  { title: "Dashboard", url: "/dashboard", icon: "IconDashboard" as const },
  { title: "Animals", url: "/dashboard/animals", icon: "IconListDetails" as const },
];

const NO_HITS: GlobalSearchResults = {
  animals: [],
  people: [],
  partners: [],
  adoptionApplications: [],
  fosterApplications: [],
};

const animal = (id: string, name: string) => ({
  id,
  name,
  species: "Dog",
  breeds: [],
  listingStatus: "PUBLISHED" as const,
});

// What the stub answers, by the `q` the palette sent; any other query finds
// nothing.
const ANSWERS: Record<string, GlobalSearchResults> = {
  ja: { ...NO_HITS, animals: [animal("a1", "Jack"), animal("a2", "Jasper")] },
  go: { ...NO_HITS, animals: [animal("g1", "Godzilla")] },
};

const A1 = "/dashboard/animals/a1";
const A2 = "/dashboard/animals/a2";
const G1 = "/dashboard/animals/g1";

const palette = () => page.getByRole("dialog", { name: "Search" });
const searchBox = () =>
  palette().getByPlaceholder("Search animals, people, partners, applications…");
const searchBar = () => page.getByRole("button", { name: "Search" });
const headings = () =>
  [...document.querySelectorAll("[cmdk-group-heading]")].map((h) => h.textContent);

// Vitest locators have no CSS selector, so a row is looked up by its href.
const rowFor = (href: string) =>
  document.querySelector(`[cmdk-item][data-href="${href}"]`);
const rowIsThere = (href: string) =>
  vi.waitFor(() => expect(rowFor(href)).not.toBeNull());
const highlightedHref = () =>
  document
    .querySelector('[cmdk-item][aria-selected="true"]')
    ?.getAttribute("data-href") ?? null;
const expectHighlighted = (href: string) =>
  vi.waitFor(() => expect(highlightedHref()).toBe(href));

let fetchSpy: MockInstance<typeof fetch>;

const queryOf = (input: RequestInfo | URL) =>
  new URL(String(input), location.href).searchParams.get("q") ?? "";

const respond = (hits: GlobalSearchResults) =>
  new Response(JSON.stringify(hits), {
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  resetNavigation("/dashboard");
  fetchSpy = vi
    .spyOn(window, "fetch")
    .mockImplementation(async (input) => respond(ANSWERS[queryOf(input)] ?? NO_HITS));
});

afterEach(() => {
  fetchSpy.mockRestore();
});

/**
 * Holds the answer to one query until the test hands it over, so a row can be
 * moved to while the old results are still on screen: the window every real
 * search has, and the one the highlight has to survive.
 */
const holdAnswerTo = (held: string) => {
  let requested = false;
  let answer: (hits: GlobalSearchResults) => void = () => {};
  fetchSpy.mockImplementation(async (input) => {
    const q = queryOf(input);
    if (q !== held) return respond(ANSWERS[q] ?? NO_HITS);
    requested = true;
    return new Promise<Response>((resolve) => {
      answer = (hits) => resolve(respond(hits));
    });
  });
  return {
    requested: () => vi.waitFor(() => expect(requested).toBe(true)),
    answer: (hits: GlobalSearchResults) => answer(hits),
  };
};

const renderPalette = () =>
  render(
    <CommandPaletteProvider navItems={NAV_ITEMS}>
      <SearchTrigger />
    </CommandPaletteProvider>,
  );

// The provider takes Ctrl as well as ⌘.
const openWithShortcut = () => userEvent.keyboard("{Control>}k{/Control}");

test("the search bar opens the palette on Pages alone, and asks the server for nothing", async () => {
  await renderPalette();

  await searchBar().click();

  await expect.element(palette()).toBeVisible();
  await rowIsThere("/dashboard");
  await rowIsThere("/dashboard/animals");
  expect(headings()).toEqual(["Pages"]);
  // An empty query is below the two-letter floor: nothing to fetch. The search
  // is debounced, so a request would come 200ms after the open, not at it.
  await new Promise((resolve) => setTimeout(resolve, 350));
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("Escape closes the palette, and the next open starts blank", async () => {
  await renderPalette();
  await openWithShortcut();
  await userEvent.fill(searchBox(), "go");
  await rowIsThere(G1);

  await userEvent.keyboard("{Escape}");
  await expect.element(palette()).not.toBeInTheDocument();

  await openWithShortcut();
  await expect.element(searchBox()).toHaveValue("");
  await rowIsThere("/dashboard");
  expect(headings()).toEqual(["Pages"]);
  expect(rowFor(G1)).toBeNull();
});

test("Enter opens the highlighted row and closes the palette", async () => {
  await renderPalette();
  await openWithShortcut();
  await userEvent.fill(searchBox(), "go");
  await rowIsThere(G1);
  await expectHighlighted(G1);

  await userEvent.keyboard("{Enter}");

  expect(routerCalls).toEqual([{ method: "push", href: G1 }]);
  await expect.element(palette()).not.toBeInTheDocument();
});

// cmdk re-selects the first row on screen when the query changes, and at that
// moment those are the old results; when they unmount, it keeps their value and
// a new row selects itself only when none is set. So the new results arrived
// with nothing highlighted, and Enter did nothing until ↓.
test("a changed query highlights its new first row, and Enter opens it", async () => {
  await renderPalette();
  await openWithShortcut();
  await userEvent.fill(searchBox(), "ja");
  await expectHighlighted(A1);

  await userEvent.fill(searchBox(), "go");
  await rowIsThere(G1);
  await expectHighlighted(G1);

  await userEvent.keyboard("{Enter}");
  expect(routerCalls).toEqual([{ method: "push", href: G1 }]);
});

test("↓ moves the highlight, and Enter opens the row it moved to", async () => {
  await renderPalette();
  await openWithShortcut();
  await userEvent.fill(searchBox(), "ja");
  await expectHighlighted(A1);

  await userEvent.keyboard("{ArrowDown}");
  await expectHighlighted(A2);

  await userEvent.keyboard("{Enter}");
  expect(routerCalls).toEqual([{ method: "push", href: A2 }]);
});

test("each open highlights the first row, not where the last visit left the highlight", async () => {
  await renderPalette();
  await openWithShortcut();
  await expectHighlighted("/dashboard");
  await userEvent.keyboard("{ArrowDown}");
  await expectHighlighted("/dashboard/animals");

  await userEvent.keyboard("{Escape}");
  await expect.element(palette()).not.toBeInTheDocument();
  await openWithShortcut();

  await expectHighlighted("/dashboard");
});

// The highlight is kept in the palette's state, so it has to follow what is on
// screen: a row that is gone cannot stay the user's pick.

test("a row chosen while the answer is pending stays chosen when it comes, unless it is gone", async () => {
  const held = holdAnswerTo("jas");
  await renderPalette();
  await openWithShortcut();
  await userEvent.fill(searchBox(), "ja");
  await expectHighlighted(A1);

  await userEvent.fill(searchBox(), "jas");
  await held.requested();
  await userEvent.keyboard("{ArrowDown}");
  await expectHighlighted(A2);

  held.answer({
    ...NO_HITS,
    animals: [animal("a3", "Jasmine"), animal("a2", "Jasper")],
  });
  await rowIsThere("/dashboard/animals/a3");
  await expectHighlighted(A2);

  await userEvent.keyboard("{Enter}");
  expect(routerCalls).toEqual([{ method: "push", href: A2 }]);
});

test("a row that left the list does not take the highlight back when it returns", async () => {
  const held = holdAnswerTo("jack");
  await renderPalette();
  await openWithShortcut();
  await userEvent.fill(searchBox(), "ja");
  await expectHighlighted(A1);

  await userEvent.fill(searchBox(), "jack");
  await held.requested();
  await userEvent.keyboard("{ArrowDown}");
  await expectHighlighted(A2);
  held.answer({
    ...NO_HITS,
    animals: [animal("a1", "Jack"), animal("a3", "Jackie")],
  });
  await rowIsThere("/dashboard/animals/a3");
  await expectHighlighted(A1);

  // Jasper is back, and the query is a new one: it starts on its first row.
  await userEvent.fill(searchBox(), "ja");
  await rowIsThere(A2);
  await expectHighlighted(A1);
  await userEvent.keyboard("{Enter}");
  expect(routerCalls).toEqual([{ method: "push", href: A1 }]);
});

test("the shortcut closes the palette too, and the next open starts on the first row", async () => {
  await renderPalette();
  await openWithShortcut();
  await expectHighlighted("/dashboard");
  await userEvent.keyboard("{ArrowDown}");
  await expectHighlighted("/dashboard/animals");

  // ⌘, not Ctrl: cmdk takes Ctrl+K for "up" and would move the highlight back
  // before the provider closes the dialog.
  await userEvent.keyboard("{Meta>}k{/Meta}");
  await expect.element(palette()).not.toBeInTheDocument();
  await openWithShortcut();

  await expectHighlighted("/dashboard");
});

// Every way of closing resets the box, the same as Escape does above.
test("the shortcut closes the palette too, and the next open starts blank", async () => {
  await renderPalette();
  await openWithShortcut();
  await userEvent.fill(searchBox(), "go");
  await rowIsThere(G1);
  expect(fetchSpy).toHaveBeenCalledTimes(1);

  await userEvent.keyboard("{Meta>}k{/Meta}");
  await expect.element(palette()).not.toBeInTheDocument();
  await openWithShortcut();

  await expect.element(searchBox()).toHaveValue("");
  await rowIsThere("/dashboard");
  expect(headings()).toEqual(["Pages"]);
  expect(rowFor(G1)).toBeNull();
  await new Promise((resolve) => setTimeout(resolve, 350));
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

// The dialog stays mounted while it fades out, so a reopen inside that fade
// has to start blank as well. The fade is stretched here so the reopen cannot
// land after it on a slow runner.
test("reopening with the shortcut while the palette is still fading out starts blank", async () => {
  const slowFade = document.createElement("style");
  slowFade.textContent = '[data-state="closed"] { animation-duration: 5s !important; }';
  document.head.append(slowFade);
  try {
    await renderPalette();
    await openWithShortcut();
    await userEvent.fill(searchBox(), "go");
    await rowIsThere(G1);

    await userEvent.keyboard("{Meta>}k{/Meta}");
    // Still on screen, still holding the old query: the fade has not ended.
    await expect.element(searchBox()).toHaveValue("go");
    await openWithShortcut();

    await expect.element(searchBox()).toHaveValue("");
    await expect.element(searchBox()).toHaveFocus();
    await rowIsThere("/dashboard");
    expect(headings()).toEqual(["Pages"]);
    expect(rowFor(G1)).toBeNull();
  } finally {
    slowFade.remove();
  }
});

test("an answer that arrives after the shortcut closed the palette does not show on the next open", async () => {
  const held = holdAnswerTo("go");
  await renderPalette();
  await openWithShortcut();
  await userEvent.fill(searchBox(), "go");
  await held.requested();

  await userEvent.keyboard("{Meta>}k{/Meta}");
  await expect.element(palette()).not.toBeInTheDocument();
  await openWithShortcut();
  await rowIsThere("/dashboard");

  // The stub ignores the abort signal, as a response already on its way would.
  // If the palette reads the body, wait for that and for the frames React needs
  // to commit what it does with it; a palette that drops the response unread
  // has nothing to wait for. Then look for what must not be there.
  const reads = vi.spyOn(Response.prototype, "json");
  try {
    held.answer(ANSWERS.go);
    await vi
      .waitFor(() => expect(reads).toHaveBeenCalled(), { timeout: 500 })
      .catch(() => {});
    await Promise.all(reads.mock.results.map((read) => read.value));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  } finally {
    reads.mockRestore();
  }

  await expect.element(searchBox()).toHaveValue("");
  expect(headings()).toEqual(["Pages"]);
  expect(rowFor(G1)).toBeNull();
});

test.each(["Control", "Meta"])("%s+K opens the palette", async (modifier) => {
  await renderPalette();

  await userEvent.keyboard(`{${modifier}>}k{/${modifier}}`);

  await expect.element(palette()).toBeVisible();
});

test("one letter asks the server for nothing, and two wait out the debounce", async () => {
  await renderPalette();
  await openWithShortcut();
  await userEvent.fill(searchBox(), "g");
  // The debounce is 200ms, so a request would have gone by now.
  await new Promise((resolve) => setTimeout(resolve, 350));
  expect(fetchSpy).not.toHaveBeenCalled();

  // Timed inside the page, from the input event to the request, so the
  // runner's own latency does not enter it (as in pets-filters.test.tsx).
  let inputAt: number | undefined;
  let fetchedAt: number | undefined;
  const hearInput = (event: Event) => {
    if ((event.target as Element).hasAttribute("cmdk-input")) {
      inputAt = performance.now();
    }
  };
  document.addEventListener("input", hearInput, true);
  fetchSpy.mockImplementation(async (input) => {
    fetchedAt = performance.now();
    return respond(ANSWERS[queryOf(input)] ?? NO_HITS);
  });
  try {
    await userEvent.fill(searchBox(), "go");
    await rowIsThere(G1);

    expect(inputAt).toBeTypeOf("number");
    expect(fetchedAt).toBeTypeOf("number");
    expect(fetchedAt! - inputAt!).toBeGreaterThanOrEqual(180);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  } finally {
    document.removeEventListener("input", hearInput, true);
  }
});

// The debounce timer is faked, so how long the runner takes between the two
// fills cannot let the real 200ms run out first.
test("emptying the box before the debounce ends cancels the search", async () => {
  await renderPalette();
  await openWithShortcut();
  await expect.element(palette()).toBeVisible();

  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    await userEvent.fill(searchBox(), "go");
    await userEvent.fill(searchBox(), "");
    await vi.advanceTimersByTimeAsync(350);

    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

// A new tab is a window.open, and the palette closes without going anywhere.
test.each(["Control", "Meta"])(
  "%s+Enter opens the highlighted row in a new tab",
  async (modifier) => {
    const opened = vi.spyOn(window, "open").mockImplementation(() => null);
    try {
      await renderPalette();
      await openWithShortcut();
      await userEvent.fill(searchBox(), "ja");
      await expectHighlighted(A1);
      await userEvent.keyboard("{ArrowDown}");
      await expectHighlighted(A2);

      await userEvent.keyboard(`{${modifier}>}{Enter}{/${modifier}}`);

      expect(opened).toHaveBeenCalledExactlyOnceWith(
        A2,
        "_blank",
        "noopener,noreferrer",
      );
      expect(routerCalls).toEqual([]);
      await expect.element(palette()).not.toBeInTheDocument();
    } finally {
      opened.mockRestore();
    }
  },
);

test("a middle click opens its row in a new tab", async () => {
  const opened = vi.spyOn(window, "open").mockImplementation(() => null);
  try {
    await renderPalette();
    await openWithShortcut();
    await userEvent.fill(searchBox(), "ja");
    await rowIsThere(A2);

    await page.elementLocator(rowFor(A2)!).click({ button: "middle" });

    expect(opened).toHaveBeenCalledExactlyOnceWith(
      A2,
      "_blank",
      "noopener,noreferrer",
    );
    expect(routerCalls).toEqual([]);
    await expect.element(palette()).not.toBeInTheDocument();
  } finally {
    opened.mockRestore();
  }
});
