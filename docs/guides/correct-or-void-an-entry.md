---
title: Correct or void an entry
summary: Fix a detail on a medical entry, or void one that should never have been recorded.
permissions: [MEDICAL_MANAGE]
aliases: [edit a vaccine, fix a typo, wrong lot number, delete an entry, remove a record, wrong animal, undo a vaccine]
related: [record-a-vaccine-test-or-treatment, schedule-care-and-read-the-due-page, medical-status-glossary]
verified: 2026-11-09
---

## When to use this

Use this when a medical entry on an animal's record is wrong.

- **Correct** it when the care happened but a detail is wrong: the date, the
  lot number, the route, a test result. The entry keeps counting, and the old
  value is kept in its history.
- **Void** it when the entry should never have been recorded at all: it was
  entered against the wrong animal, or recorded twice. A voided entry stays on
  the record, struck through, and stops counting. Nothing is ever deleted.

Care that is scheduled but won't be given is declined, not voided: see
[Schedule care and read the Due page](./schedule-care-and-read-the-due-page.md).

## Correct an entry

1. Open the animal, then the **Medical** tab, then **History**.
2. Find the entry and click its **…** menu, then **Edit**.
3. The **Edit** form opens with what was recorded. Change what is wrong.
4. Click **Save Changes**.

You should see "Entry updated." Under the entry, click **Show 1 change** (or
**Show 2 changes**…) to see who changed what, for example "Lot number:
TEST-LOT-1 → TEST-LOT-2".

## Void an entry

1. Open the animal, then the **Medical** tab, then **History**.
2. Find the entry and click its **…** menu, then **Void…**.
3. Read the box that opens. It reminds you to edit, not void, when only a
   detail is wrong.
4. Type why in the box (**Why is this entry being voided?**), for example
   "Entered on the wrong animal".
5. Click **Void Entry**.

You should see "Entry voided."

## What a voided entry looks like

- On **History** it stays in place, struck through, with a **Voided** badge
  and "Voided by *name* *time*: *reason*".
- It no longer shows on **Overview**, **Vaccines & Tests** or the Due page.
- It has no **…** menu any more: a void can't be undone or edited.
- If it was voided by mistake, record the care again.

## If something goes wrong

- **"No changes to save."** You clicked **Save Changes** without changing
  anything. Nothing was saved.
- **The menu shows only Void….** The entry is scheduled, not given. To change
  its day, use **Reschedule** under **Due** on the animal's **Overview**.
  "This entry is scheduled and hasn't been given, so it can't be edited.
  Reschedule it, or void it and schedule it again."
- **"This entry was declined, so it can't be edited. If it was declined in
  error, void it."**
- **"This entry has already been voided. A void can't be undone: if it was
  voided by mistake, record the entry again."** Someone voided it before you.
- **"Record and correct end-of-life medical details through the outcome. Only
  reversing the outcome can void its medical record."** This entry belongs
  to an outcome, such as a euthanasia. Change it from the outcome.
- **The Void Entry button is greyed out.** Type a reason first.
- **No … menu on any entry.** Correcting and voiding need a staff member who
  manages medical care. Ask them.
