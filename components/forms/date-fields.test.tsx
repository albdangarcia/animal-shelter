import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { page, userEvent, type Locator } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { ReactNode } from "react";
import { useForm, useWatch, type Control } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { DateField } from "@/components/forms/date-field";
import { DateInput } from "@/components/forms/date-input";
import { DayField } from "@/components/forms/day-field";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

// The date picker every form shares: DateInput, wrapped by DayField (a
// `yyyy-MM-dd` day) and DateField (an instant). The forms' own browser tests
// read only that each passes `required` (the trigger's "<Label> *:" name);
// what a click on the calendar does to the value is checked here.
//
// The tests run in the shelter's zone (vitest.config.mts) with the clock
// frozen at noon on 15 October 2026, so every day below is a known value and
// no run depends on the day it happens on: the calendar opens on the frozen
// today's month.

type Values = { when: string | Date | null; name: string };

// The date, and a second required field. Submitting with the name empty
// always raises the name's message, so a test can wait for validation to
// have run before it checks the date has no message of its own.
const name = z.string().min(1, "Enter a name.");
const schemas = {
  requiredDay: z.object({ when: z.string("Pick a day."), name }),
  optionalDay: z.object({ when: z.string().nullable(), name }),
  requiredInstant: z.object({ when: z.date("Pick a day."), name }),
  optionalInstant: z.object({ when: z.date().nullable(), name }),
};

// Tells every value apart. `value ?? ""` would hide the difference between
// null and undefined, which is what the clear tests are about (#137).
const shown = (value: unknown) =>
  value === null
    ? "null"
    : value === undefined
      ? "undefined"
      : value instanceof Date
        ? value.toISOString()
        : String(value);

function WatchedValue({ control }: { control: Control<Values> }) {
  const value = useWatch({ control, name: "when" });
  return <output data-testid="when">{shown(value)}</output>;
}

function Harness({
  schema,
  initial,
  field,
}: {
  schema: z.ZodType<Values, Values>;
  initial: Values["when"];
  field: (control: Control<Values>) => ReactNode;
}) {
  const form = useForm<Values>({
    resolver: standardSchemaResolver(schema),
    defaultValues: { when: initial, name: "" },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})}>
        {field(form.control)}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <WatchedValue control={form.control} />
        <Button type="submit">Save</Button>
      </form>
    </Form>
  );
}

const value = () => page.getByTestId("when");

/** Waits until the form's date reads exactly `expected`. */
const expectValue = (expected: string) =>
  expect.poll(() => value().element().textContent).toBe(expected);

// The popover does not close when a day is picked.
const openCalendar = async (trigger: Locator) => {
  await trigger.click();
  await expect.element(page.getByRole("dialog")).toBeVisible();
};

const closeCalendar = async () => {
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
};

/** A day's button in the open calendar, by a selector for its cell. */
const dayButton = async (cell: string) =>
  page.elementLocator(
    await vi.waitFor(() => {
      const button = document.querySelector(`${cell} button`);
      if (!button) throw new Error(`No day button in ${cell}`);
      return button;
    }),
  );

// react-day-picker marks the selected day's cell, and only that one.
const clickSelectedDay = async (trigger: Locator) => {
  await openCalendar(trigger);
  await (await dayButton('td[data-selected="true"]')).click();
  await closeCalendar();
};

// Only Date is faked: the popover, the form and the waits keep real timers.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 15, 12));
});
afterEach(() => {
  vi.useRealTimers();
});

// Today, and the instant a DateField starts on (noon, local to the shelter).
const TODAY = "2026-10-15";
const TODAY_LONG = "October 15th, 2026";
const noonToday = () => new Date(2026, 9, 15, 12);

describe("a required date", () => {
  test("DayField: clicking the selected day again keeps the day", async () => {
    await render(
      <Harness
        schema={schemas.requiredDay}
        initial={TODAY}
        field={(control) => (
          <DayField control={control} name="when" label="Day" required />
        )}
      />,
    );
    const trigger = page.getByRole("button", { name: /^Day \*:/ });
    await expect.element(trigger).toHaveAccessibleName(`Day *: ${TODAY_LONG}`);
    await expect.element(trigger).toHaveTextContent(TODAY_LONG);

    await clickSelectedDay(trigger);

    await expectValue(TODAY);
    await expect.element(trigger).toHaveAccessibleName(`Day *: ${TODAY_LONG}`);
    await expect.element(trigger).toHaveTextContent(TODAY_LONG);
  });

  test("DateField: clicking the selected day again keeps the instant", async () => {
    await render(
      <Harness
        schema={schemas.requiredInstant}
        initial={noonToday()}
        field={(control) => (
          <DateField control={control} name="when" label="Day" required />
        )}
      />,
    );
    const trigger = page.getByRole("button", { name: /^Day \*:/ });
    await expect.element(trigger).toHaveAccessibleName(`Day *: ${TODAY_LONG}`);
    await expect.element(trigger).toHaveTextContent(TODAY_LONG);

    await clickSelectedDay(trigger);

    await expectValue(noonToday().toISOString());
    await expect.element(trigger).toHaveAccessibleName(`Day *: ${TODAY_LONG}`);
    await expect.element(trigger).toHaveTextContent(TODAY_LONG);
  });

  // The re-click tests above never write a new value; the DayField journeys
  // in the browser specs do, but no form's DateField does.
  test("DateField: choosing another day stores that day", async () => {
    await render(
      <Harness
        schema={schemas.requiredInstant}
        initial={noonToday()}
        field={(control) => (
          <DateField control={control} name="when" label="Day" required />
        )}
      />,
    );
    const trigger = page.getByRole("button", { name: /^Day \*:/ });

    await openCalendar(trigger);
    await (await dayButton('td[data-day="2026-10-20"]')).click();
    await closeCalendar();

    // The calendar hands back the day at local midnight.
    await expectValue(new Date(2026, 9, 20).toISOString());
    await expect
      .element(trigger)
      .toHaveAccessibleName("Day *: October 20th, 2026");
    await expect.element(trigger).toHaveTextContent("October 20th, 2026");
  });

  // The symptom the browser tests caught (#136): after the re-click, saving
  // said "An intake date is required." under a picker that still showed a day.
  test("DayField: after the re-click, a submit raises no message on the date", async () => {
    await render(
      <Harness
        schema={schemas.requiredDay}
        initial={TODAY}
        field={(control) => (
          <DayField control={control} name="when" label="Day" required />
        )}
      />,
    );
    const trigger = page.getByRole("button", { name: /^Day \*:/ });
    await clickSelectedDay(trigger);

    await page.getByRole("button", { name: "Save" }).click();
    // Validation has run once the name's message shows.
    await expect.element(page.getByText("Enter a name.")).toBeVisible();

    const dateItem = trigger.element().closest('[data-slot="form-item"]')!;
    expect(
      dateItem.querySelector('[data-slot="form-message"]')?.textContent ?? null,
    ).toBeNull();
    await expectValue(TODAY);
    await expect.element(trigger).toHaveAccessibleName(`Day *: ${TODAY_LONG}`);
    await expect.element(trigger).toHaveAttribute("aria-invalid", "false");
  });

  // The control for the test above: this harness does show the date's own
  // message when the date is missing, so its absence there means something.
  test("DayField: a submit with no day shows the date's message", async () => {
    await render(
      <Harness
        schema={schemas.requiredDay}
        initial={null}
        field={(control) => (
          <DayField control={control} name="when" label="Day" required />
        )}
      />,
    );
    const trigger = page.getByRole("button", { name: /^Day \*:/ });

    await page.getByRole("button", { name: "Save" }).click();
    await expect.element(page.getByText("Enter a name.")).toBeVisible();

    const dateItem = trigger.element().closest('[data-slot="form-item"]')!;
    expect(
      dateItem.querySelector('[data-slot="form-message"]')?.textContent ?? null,
    ).toBe("Pick a day.");
    await expect.element(trigger).toHaveAttribute("aria-invalid", "true");
  });
});

describe("an optional date", () => {
  // As the task form uses it: optional, with the X.
  test("DayField: clicking the selected day again clears it to null", async () => {
    await render(
      <Harness
        schema={schemas.optionalDay}
        initial={TODAY}
        field={(control) => (
          <DayField control={control} name="when" label="Day" clearable />
        )}
      />,
    );
    const trigger = page.getByRole("button", { name: /^Day:/ });
    await expect.element(trigger).toHaveAccessibleName(`Day: ${TODAY_LONG}`);
    await expect.element(page.getByRole("button", { name: "Clear date" })).toBeVisible();

    await clickSelectedDay(trigger);

    await expectValue("null");
    await expect.element(trigger).toHaveAccessibleName("Day: Pick a date");
    await expect.element(trigger).toHaveTextContent("Pick a date");
    await expect
      .element(page.getByRole("button", { name: "Clear date" }))
      .not.toBeInTheDocument();
  });

  test("DateField: clicking the selected day again clears it to null", async () => {
    await render(
      <Harness
        schema={schemas.optionalInstant}
        initial={noonToday()}
        field={(control) => (
          <DateField control={control} name="when" label="Day" />
        )}
      />,
    );
    const trigger = page.getByRole("button", { name: /^Day:/ });
    await expect.element(trigger).toHaveAccessibleName(`Day: ${TODAY_LONG}`);

    await clickSelectedDay(trigger);

    await expectValue("null");
    await expect.element(trigger).toHaveAccessibleName("Day: Pick a date");
  });

  test("DayField: the X clears the day to null, then goes", async () => {
    await render(
      <Harness
        schema={schemas.optionalDay}
        initial={TODAY}
        field={(control) => (
          <DayField control={control} name="when" label="Day" clearable />
        )}
      />,
    );
    const clear = page.getByRole("button", { name: "Clear date" });

    await clear.click();

    await expectValue("null");
    await expect
      .element(page.getByRole("button", { name: /^Day:/ }))
      .toHaveAccessibleName("Day: Pick a date");
    await expect.element(clear).not.toBeInTheDocument();
  });
});

// As the placement form refuses an expected return date in the past.
test("DateInput: the calendar disables the days disabledDates refuses", async () => {
  const today = new Date(2026, 9, 15);
  await render(
    <DateInput
      value={undefined}
      onChange={() => {}}
      disabledDates={(date) => date < today}
      aria-label="Expected return"
    />,
  );
  await openCalendar(page.getByRole("button", { name: "Expected return" }));

  await expect
    .element(await dayButton('td[data-day="2026-10-15"]'))
    .toBeEnabled();
  await expect
    .element(await dayButton('td[data-day="2026-10-14"]'))
    .toBeDisabled();
});

// DateField hands disabledDates on to the calendar, as the vitals and
// assessment forms rely on to refuse a future day. Their predicate, read
// against the frozen clock: today (before noon's instant) is allowed,
// tomorrow is not.
test("DateField: the calendar disables the days disabledDates refuses", async () => {
  await render(
    <Harness
      schema={schemas.requiredInstant}
      initial={noonToday()}
      field={(control) => (
        <DateField
          control={control}
          name="when"
          label="Day"
          required
          disabledDates={(date) => date > new Date()}
        />
      )}
    />,
  );
  await openCalendar(page.getByRole("button", { name: /^Day \*:/ }));

  await expect
    .element(await dayButton('td[data-day="2026-10-15"]'))
    .toBeEnabled();
  await expect
    .element(await dayButton('td[data-day="2026-10-16"]'))
    .toBeDisabled();
});
