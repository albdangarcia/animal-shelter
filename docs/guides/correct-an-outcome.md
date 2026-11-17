---
title: Correct an outcome
summary: Fix the day, partner, owner or notes of an outcome, and tell a correction from a reversal or a re-intake.
permissions: [OUTCOMES_MANAGE]
aliases: [edit an outcome, fix outcome date, wrong outcome date, wrong adoption date, change destination partner, change owner, outcome mistake, update outcome, wrong outcome type]
related: [record-an-outcome, find-an-outcome, reverse-an-outcome-recorded-by-mistake, take-back-an-animal-that-left, record-an-end-of-life-outcome, read-an-animals-activity-and-journey]
verified: 2026-11-16
---

## When to use this

Use this when an animal did leave as recorded, but a detail is wrong: the
day, the destination partner, the owner, or the notes. The outcome is
corrected in place, and the animal's **Activity** keeps a line saying what
changed.

For the medical details of a death or a euthanasia, see
[Record an end-of-life outcome](./record-an-end-of-life-outcome.md).

## Correct, reverse or take back

Three ways to change an outcome, for three different situations:

- **Correct** (this guide): the outcome happened, and a detail is wrong.
- **Reverse**: the outcome should never have been recorded. It was recorded
  against the wrong animal, with the wrong type or the wrong adopter, or the
  animal never left. Only an admin can reverse an outcome: ask an admin to
  reverse it. The outcome stays on the record, marked as reversed, and the
  animal is back in care as it was before.
- **Take back**: the animal really left, and has now come back, for example
  an adopter returning it. Someone who takes animals in records a re-intake
  from the animal's page (**Create Re-Intake**). The outcome stays as it is:
  it happened.

Don't use a re-intake to undo a mistake. The reports count every intake and
outcome, so a re-intake for an animal that never left counts a departure and
an arrival that didn't happen, and splits one stay into two.

## Steps

1. In the sidebar, open **Outcomes**.
2. Type the animal's name in **Filter by animal, applicant, owner, staff, or
   partner name...**. An animal that left more than once has a row for each
   outcome: check the **Outcome Date** to pick the right one.
3. Click the **…** button at the end of the row, then **Edit**. The page
   **Edit Outcome** opens.
4. Change what is wrong:
   - **Date of Outcome**. Days after today can't be picked. If the outcome
     ended a foster placement, the page says "This outcome ended a foster
     placement. Changing the date moves the placement's end day with it."
   - **Destination Partner**, for a transfer out.
   - **Owner**, for a return to owner. Click **Clear**, then **Search for a
     person...**, type part of a name, email or phone number, and pick the
     person.
   - **Notes**.
5. Click **Update Outcome**.

You should see "Outcome updated successfully." The **Outcomes** list opens
with the change. If you changed nothing, you see "No changes to save."
instead.

To see the record of the change, open the animal. Its **Activity** shows
"Olivia Chen corrected an outcome" (with your name). Click **Show details**
for what changed, for example "Outcome was corrected: the date changed from
Nov 16, 2026 to Nov 12, 2026; the owner changed from Elijah Wilson to Abigail
Nguyen; notes were added." When a foster placement's end moved too, it adds
"the foster placement's end moved with it".

## What you can't change here

- **The type.** **Outcome Type** is greyed out, and the page says "A wrong
  type is fixed by reversing this outcome and recording the right one." Ask
  an admin to reverse it, then record the right outcome.
- **The animal, or the adopter of an adoption.** Ask an admin to reverse the
  outcome, then record it again for the right animal or application.

## If something goes wrong

- **"The outcome date can't be before this stay's intake on Sep 17, 2026."**
  (with the day) The animal left after it arrived. Pick that day or a later
  one. If the intake's day is the wrong one, ask someone who corrects
  intakes.
- **"The outcome date can't be before the foster placement with Sam Rivera
  began on Oct 30, 2026."** (it may say "ended") The outcome came after the
  animal's time in foster. Pick that day or a later one.
- **Another message about the date.** The rules are the same as for a death:
  see
  [Record an end-of-life outcome](./record-an-end-of-life-outcome.md#if-something-goes-wrong).
- **View reversal on the row instead of Edit**, or **"This outcome was
  reversed, so it can no longer be corrected."** An admin reversed this
  outcome. The page **Outcome Reversed** says who, when and why. If the
  animal did leave after all, record the outcome again: see
  [Record an outcome](./record-an-outcome.md).
- **No … button on the rows.** Your account can read outcomes but not
  correct them. Ask a staff member who records outcomes.
- **"Database Error: Failed to update outcome."** Nothing was saved. Try
  again; if it keeps happening, tell an admin.
