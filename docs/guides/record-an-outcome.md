---
title: Record an adoption, transfer out, return to owner or other outcome
summary: Record an animal leaving the shelter, and see what changes when you do, from its unit and foster placement to its adoption applications.
permissions: [OUTCOMES_MANAGE]
aliases: [complete an adoption, finalize adoption, adopt out, adopted, transfer out, transfer to a rescue, send to a partner, return to owner, owner reclaim, reclaimed, owner picked up, animal left, discharge, create outcome, process outcome, close the stay]
related: [correct-an-outcome, find-an-outcome, record-an-end-of-life-outcome, reverse-an-outcome-recorded-by-mistake, take-back-an-animal-that-left, move-an-animal-to-another-unit]
verified: 2026-11-16
---

## When to use this

Use this when an animal leaves the shelter: it is adopted, transferred out to
a partner, returned to its owner, or leaves for another reason (**Other**).
The outcome closes the animal's stay and archives its record.

For a death or a euthanasia, see
[Record an end-of-life outcome](./record-an-end-of-life-outcome.md). To fix a
detail of an outcome already recorded, see
[Correct an outcome](./correct-an-outcome.md). If an outcome should never
have been recorded at all, ask an admin to reverse it.

## Record a transfer out, a return to owner or another outcome

1. Open the animal and click **Create Outcome**. When one of its
   applications is approved, **Create Outcome** is the button below
   **Complete Adoption** (or **Choose Application**). The page **Process
   Animal Outcome** opens. If the animal is in foster, a note above the form
   says "Recording this outcome ends that placement."
2. Under **Outcome Type**, pick **Transfer Out**, **Return To Owner** or
   **Other**.
3. Check the **Date of Outcome**. It starts on today. Days after today can't
   be picked.
4. For **Transfer Out**, pick the **Destination Partner**.
5. For **Return To Owner**, check the **Owner**. When the animal was
   surrendered, the person who surrendered it is filled in. To pick someone
   else, click **Clear**, click **Search for a person...**, type part of a
   name, email or phone number, and pick the person. If they aren't in the
   directory, click **Add a new person**.
6. Add anything else under **Notes**, for example why the animal left when
   you picked **Other**.
7. Click **Process Outcome**.

You should see "Outcome processed successfully." The **Outcomes** list opens
with the new outcome at the top.

## Record an adoption

An adoption is recorded from the adopter's approved application, so
**Adoption** isn't offered under **Outcome Type** on its own.

1. Open the animal. When one of its applications is approved, the button
   reads **Complete Adoption**. Click it. You can also open the application
   and, under **Next Step: Finalize Adoption**, click **Create Outcome**.
2. **Outcome Type** is set to **Adoption** and can't be changed. Check the
   **Date of Outcome**, and add any **Notes**.
3. Click **Process Outcome**.

You should see "Outcome processed successfully." The application now reads
**Adopted**, and its page says "This application was finalized on Nov 16,
2026." (with the day) and links to **View Outcome Record**.

If the button reads **Choose Application**, more than one application is
approved. Record the adoption from the adopter's application, as in step 1.

## What changes when you save

- **The animal is archived.** Its card reads **Archived**, and so does its
  row on the **Animals** list. It is no longer on the public adoption
  pages. Where **Create Outcome** was, the button now reads **Create
  Re-Intake**.
- **Its unit is freed.** **Location** reads **Unplaced**, and its unit on
  the **Locations** page counts one animal fewer, for example "C-1 4/3"
  becomes "C-1 3/3".
- **A foster placement ends** on the outcome's day. The foster banner goes,
  and the animal's **Activity** shows "returned this animal from foster",
  with "Foster placement with Sam Rivera ended: transfer out." (with the
  foster's name and the type).
- **Its adoption applications change.** For an adoption, the adopter's reads
  **Adopted**. Every other application still open on the animal (pending,
  reviewing, waitlisted or approved) reads **Closed**. Rejected and withdrawn
  ones stay as they were.
- **Scheduled care leaves the Due page** for the whole shelter, but isn't
  closed. It stays under **Due** on the animal's **Medical** tab. If the
  animal comes back, it is on the **Due** page again, overdue if its day has
  passed.
- **Activity** shows "processed an outcome", with "Animal was processed for
  outcome: transfer out." (with the type).

## If something goes wrong

- **"A destination partner is required for transfers."** Pick the
  **Destination Partner**.
- **"An owner is required for return-to-owner outcomes."** Pick the
  **Owner**.
- **"An outcome type is required."** Pick one under **Outcome Type**.
- **"The outcome date can't be before this stay's intake on Sep 17, 2026."**
  (with the day) The animal left after it arrived. Pick that day or a later
  one, or check the intake's day.
- **"The outcome date can't be before the foster placement with Sam Rivera
  began on Oct 30, 2026."** (it may say "ended") The outcome ends the
  animal's stay, so it comes after its time in foster. Pick that day or a
  later one.
- **Another message about the date.** The rules are the same as for a death:
  see
  [Record an end-of-life outcome](./record-an-end-of-life-outcome.md#if-something-goes-wrong).
- **Outcome Already Processed**, or **"This animal has already been
  processed for an outcome."** Someone recorded an outcome for this animal
  already. Find it on the **Outcomes** list. If it is wrong, see
  [Correct an outcome](./correct-an-outcome.md).
- **"Cannot process adoption: The application has not been approved."** The
  application was changed since you opened it. Open it to see its status.
- **"This application already has an adoption recorded against it."** The
  adoption is already on the **Outcomes** list.
- **Convert the Foster Placement** in place of the form. The adopter is the
  animal's foster, in a foster-to-adopt placement. Click **Convert to
  Adoption**, or ask someone who manages fosters.
- **"This animal has more than one open foster placement. Return all but one
  before recording an outcome."** Ask someone who manages fosters to return
  the extra placement.
- **"This animal's foster placement changed while the outcome was being
  recorded. Please try again."** Nothing was saved. Click **Process
  Outcome** again.
- **Access Denied on the form.** Your account can't record outcomes. Ask a
  staff member who can.
- **"Database Error: Failed to process outcome."** Nothing was saved. Try
  again; if it keeps happening, tell an admin.
