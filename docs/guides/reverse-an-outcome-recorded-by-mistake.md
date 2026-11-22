---
title: Reverse an outcome recorded by mistake
summary: Void an outcome that should never have been recorded, so the animal comes back into care as it was, and see what it puts back.
permissions: [OUTCOMES_REVERSE]
aliases: [undo an outcome, undo an adoption, cancel an adoption, void an outcome, wrong animal outcome, outcome on the wrong animal, wrong outcome type, outcome entered by mistake, unarchive an animal, un-archive, restore an archived animal, delete an outcome]
related: [review-an-application-and-change-its-status, correct-an-outcome, record-an-outcome, find-an-outcome, take-back-an-animal-that-left, record-an-end-of-life-outcome, correct-an-intake, move-an-animal-to-another-unit, read-the-reports]
verified: 2026-11-16
---

## When to use this

Use this when an outcome should never have been recorded: it is on the wrong
animal, it has the wrong type or the wrong adopter, or the animal never left.
The outcome stays on the record, marked as reversed, and stops counting in
the reports. The animal comes back into care as it was before. Only admins
can reverse an outcome.

Don't reverse an outcome for anything else:

- **A detail is wrong** (the day, the partner, the owner, the notes): the
  outcome happened, so correct it from **Edit** on its row. The guide on
  correcting an outcome has the steps.
- **The animal left and came back**, for example a returned adoption: that
  really happened, so record a re-intake with **Create Re-Intake** on the
  animal's page. The guide on taking back an animal that left has the steps.

The other way round matters too: don't use a re-intake to undo a mistake.
The reports count every intake and outcome, so a re-intake for an animal
that never left counts a departure and an arrival that didn't happen, and
splits one stay into two.

## Steps

1. In the sidebar, open **Outcomes**.
2. Type the animal's name in **Filter by animal, applicant, owner, staff, or
   partner name...**, and find the outcome by its **Outcome Date**.
3. Click the **…** button at the end of the row, then **Reverse…**. A box
   opens, for example **Reverse Jasper's adoption outcome?**, saying what the
   reversal does.
4. Type why in the reason box, which reads "Why is this outcome being
   reversed?" until you type, for example "Recorded against the wrong cat."
   **Reverse Outcome** stays greyed out until you type a reason.
5. Click **Reverse Outcome**.

You should see "Outcome reversed." followed by what was put back, for
example "Outcome reversed. The listing was restored to published. The foster
placement with Sam Rivera was reopened."

The outcome stays on the **Outcomes** list, marked **Reversed**. Point at
**Reversed** to see "Reversed by Admin User on Nov 16, 2026:" and the reason.

## What a reversal puts back

Every reversal changes these, whatever else has happened to the animal since:

- **Its adoption applications.** After an adoption, the adopter's
  application reads **Approved** again, and the animal's page offers
  **Complete Adoption** again. Every application the outcome closed reads as
  it did before, for example **Reviewing** or **Pending**.
- **For a death or a euthanasia**, its medical entry is voided.

When this outcome is still what archived the animal, the reversal also puts
the animal back where it was before the outcome:

- **Its listing**, as it was: "The listing was restored to published." (or
  "pending adoption", or "draft"). For an old outcome that didn't keep it:
  "The listing was set to draft, since nothing recorded what it was before
  this outcome."
- **Its foster placement**, if the outcome ended one: "The foster placement
  with Sam Rivera was reopened." The animal is back in foster with the same
  placement, as if it never ended.
- **Otherwise its unit**: "It was put back in Cat room · C-1." It goes back
  even if the unit is full, and the message says so: "Cat room · C-1 is now
  over capacity (4/3)." If the unit has been deleted since, or the animal
  had none, the message ends "place it from its record": move it to a unit
  from its page.
- **Its scheduled care** is back on the **Due** page.

If something has moved the animal since, usually a re-intake recorded to
undo the mistake, the message is "Outcome reversed. The listing was left as
it is, since this outcome is no longer what archived the animal." The
listing, unit and foster placement are left as they are now, and the
re-intake stays on the animal's record. The applications and the medical
entry still change as above.

## What stays on the record

- The outcome, marked **Reversed**. On its row, **…** offers only **View
  reversal**, which opens **Outcome Reversed**: "This return to owner
  outcome for Smokey was reversed by Admin User on Nov 16, 2026, and can no
  longer be corrected." with the reason under it.
- The animal's **Activity**: "Admin User reversed an outcome" (with your
  name). **Show details** gives the type, what was put back and the reason.
  When the animal went back in a unit, a line "moved this animal" says
  where.

A reversal can't be undone. If the outcome was right after all, record it
again.

## If something goes wrong

- **No Reverse… in the menu, only Edit.** Your account can record and
  correct outcomes but not reverse them. Ask an admin.
- **Only View reversal in the menu.** The outcome is already reversed.
- **"This outcome has already been reversed."** Someone reversed it a moment
  before you. The box closes and the list shows it as **Reversed**.
- **"This outcome can't be reversed: without it, the intake on Nov 14, 2026
  would read as a return after this animal's latest outcome that same day,
  and its record would say it is back in care…"** (with the day) Nothing was
  changed. That intake repeats the animal's arrival. Correct the intake to
  an earlier day first, from the **Intakes** list, then reverse this
  outcome.
- **"This outcome can't be reversed: without it, this animal's intakes and
  outcomes would no longer agree with its listing."** Nothing was changed.
  Tell whoever looks after the app, with the animal's name.
- **"The reason cannot exceed 1000 characters."** Shorten the reason.
- **"Database Error: Failed to reverse outcome."** Nothing was changed. Try
  again; if it keeps happening, tell whoever looks after the app.
