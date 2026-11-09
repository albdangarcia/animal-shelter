import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { useState } from "react";
import { AnimalNavTabs } from "./animal-nav-tabs";
import { LinkTabs } from "./link-tabs";
import { resetNavigation, setUrl } from "@/tests/components/next-navigation";

vi.mock("next/navigation", () => import("@/tests/components/next-navigation"));

const base = "/dashboard/animals/example/medical";
const links = [
  ["", "Overview"], ["/history", "History"],
  ["/vaccines-tests", "Vaccines & Tests"], ["/medications", "Medications"],
  ["/conditions", "Conditions"], ["/vitals", "Vitals"], ["/documents", "Documents"],
].map(([suffix, label]) => ({ href: `${base}${suffix}`, label }));

beforeEach(() => resetNavigation(`${base}/history`));

test("the collapsed animal menu names the current section and marks it in the menu", async () => {
  await render(<div style={{ width: 340 }}><AnimalNavTabs /></div>);
  const trigger = page.getByRole("button", { name: "Animal sections: Medical", exact: true });
  await expect.element(trigger).toHaveTextContent("Medical");
  await trigger.click();
  await expect.element(page.getByRole("menuitem", { name: "Medical", exact: true })).toHaveAttribute("aria-current", "page");
  await expect.element(page.getByRole("menuitem", { name: "Activity", exact: true })).not.toHaveAttribute("aria-current");
  await userEvent.keyboard("{Escape}");
  // Route changes, including browser history, update the collapsed label too.
  setUrl("/dashboard/animals/example/photos");
  await expect.element(page.getByRole("button", { name: "Animal sections: Photos", exact: true })).toHaveTextContent("Photos");
});

function ResizableTabs() {
  const [width, setWidth] = useState(750);
  return (
    <>
      <button onClick={() => setWidth(300)}>Shrink</button>
      <button onClick={() => setWidth(750)}>Expand</button>
      <div data-testid="viewport" style={{ width }}>
        <LinkTabs links={links} scrollable />
      </div>
    </>
  );
}

test("a selected tab stays in view on resize and navigation without scrolling the page", async () => {
  setUrl(`${base}/documents`);
  await render(<ResizableTabs />);
  const viewport = () => page.getByTestId("viewport").element().getBoundingClientRect();
  const selectedFits = () => {
    const selected = document.querySelector('[aria-current="page"]')!.getBoundingClientRect();
    const bounds = viewport();
    return selected.left >= bounds.left && selected.right <= bounds.right;
  };
  await page.getByRole("button", { name: "Shrink", exact: true }).click();
  await expect.poll(selectedFits).toBe(true);
  const scroller = page.getByTestId("viewport").element().querySelector<HTMLDivElement>(".overflow-x-auto")!;
  expect(scroller.scrollLeft).toBeGreaterThan(0);
  const verticalPosition = window.scrollY;

  setUrl(base);
  await expect.element(page.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute("aria-current", "page");
  await expect.poll(selectedFits).toBe(true);
  await expect.poll(() => scroller.scrollLeft).toBe(0);
  expect(window.scrollY).toBe(verticalPosition);

  await page.getByRole("button", { name: "Expand", exact: true }).click();
  await expect.poll(() => scroller.scrollWidth <= scroller.clientWidth).toBe(true);
});
