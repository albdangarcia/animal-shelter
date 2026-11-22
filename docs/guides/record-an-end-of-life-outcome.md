---
title: Record an end-of-life outcome and add missing details later
summary: Record a euthanasia or a death with its medical details, add the details to an outcome recorded without them, and correct them.
permissions: [OUTCOMES_MANAGE]
aliases: [euthanasia, put to sleep, animal died, found dead, death record, cause of death, necropsy, body disposition, late euthanasia paperwork]
related: [correct-or-void-an-entry, upload-and-manage-medical-documents, medical-status-glossary, correct-an-intake, record-an-outcome, correct-an-outcome, reverse-an-outcome-recorded-by-mistake, find-an-outcome]
verified: 2026-11-22
---

## When to use this

Use this when an animal has been euthanized or has died. The outcome closes
the animal's stay, archives its record and cancels its open tasks, as any
outcome does (see "What changes when you save" in
[Record an outcome](./record-an-outcome.md#what-changes-when-you-save)). Its
medical details (drug,
dose, who authorized it, cause of death) go on its medical **History**. Both
are recorded together, from the outcome.

Use the second part when an older outcome was recorded without its medical
details, or when the paperwork arrives later.

You need to be able to record outcomes, and to read and manage medical
records. Without the medical part, **Euthanized** and **Deceased** aren't
offered when you create an outcome.

## Record a euthanasia

1. Open the animal and click **Create Outcome**.
2. Under **Outcome Type**, pick **Euthanized**. A **Medical details** part
   appears.
3. Check the **Date of Outcome**.
4. Under **Source**, pick **In house** or **Outside vet**.
5. Under **Reason category**, pick **Medical**, **Behavioral** or **Other**,
   and say more under **Reason notes**. **Other** needs a note.
6. Under **Authorized by**, type a name and pick the person. This records who
   authorized it; it doesn't ask them to approve.
7. For **Outside vet** only: pick the clinic under **Vet clinic**, or leave
   **No clinic recorded** and type it under **Vet name** if you know it.
8. For **Outside vet** only: under **Performer type**, pick **Person in
   directory** if the vet is in the shelter's directory, or **Outside vet
   name** if not.
9. Under **Performed by**, type a name and pick the person. If you picked
   **Outside vet name**, type the vet's name under **Performed by outside
   vet** instead.
10. Type the **Drug**, the **Dose including unit** (for example "3 mL") and
    the **Route** (for example "Intravenous").
11. Fill in **Witness** and **Body disposition** if you know them.
12. Click **Process Outcome**.

You should see "Outcome processed successfully." The Outcomes list opens with
the new outcome at the top. On the animal's **Medical** tab, **History** shows
a **Euthanasia** entry with every detail and a **Correct through outcome**
link.

## Record a death

1. Open the animal and click **Create Outcome**.
2. Under **Outcome Type**, pick **Deceased**, and check the **Date of
   Outcome**.
3. Under **Circumstances**, pick **Found dead**, **During a procedure** or
   **Other**, and say more under **Circumstance notes**. **Other** needs a
   note.
4. Under **Cause knowledge**, pick **Unknown** or **Known**. For **Known**,
   type the **Cause**.
5. Under **Necropsy requested**, pick **Yes**, **No** or leave **Unknown**.
6. Fill in **Body disposition** if you know it.
7. Click **Process Outcome**.

You should see "Outcome processed successfully." **History** shows a
**Death** entry with the details.

## Add details to an outcome recorded without them

1. In the sidebar, open **Outcomes**.
2. Find the outcome, click the **…** menu on its row, then **Edit**.
3. The page **Edit Outcome** says "Medical details not recorded". Click
   **Add medical details**.
4. Fill in the **Medical details** as above.
5. Click **Update Outcome**.

You should see "Outcome updated successfully." The animal's **History** now
shows the **Euthanasia** or **Death** entry, recorded by you today. The
outcome's own day and who processed it don't change.

## Correct the details

1. Open the animal, then the **Medical** tab, then **History**.
2. Under the **Euthanasia** or **Death** entry, click **Correct through
   outcome**. The outcome's **Edit Outcome** page opens.
3. Change what is wrong under **Medical details**, for example **Body
   disposition**.
4. Click **Update Outcome**.

You should see "Outcome updated successfully." On **History**, **Show 1
change** under the entry lists what changed, for example "Body disposition:
unknown → Communal cremation".

These entries can't be edited or voided from **History**. An outcome
recorded against the wrong animal, or of the wrong type, is reversed by an
admin, which also voids its medical entry.

After a death or a euthanasia the animal can't be taken back in: its page
shows "Outcome: Deceased" (or "Outcome: Euthanized") where **Create
Re-Intake** would be. If the outcome was recorded by mistake, an admin
reverses it from the **Outcomes** list, and the animal is back in care.

## If something goes wrong

- **"The outcome date can't be before this animal's latest intake on Nov
  3, 2026."** (it may name its latest outcome instead) The outcome archives
  the animal, so it has to come after every intake and outcome on its
  record. Pick a day after the one named. If the animal really died before
  that day, the records dated after the death are the ones that are wrong:
  an admin reverses any outcome that never happened, someone who can
  correct intakes moves the intakes dated after the death to before it, and
  then you record this outcome.
- **"The outcome date can't be on or before this animal's latest intake on
  Nov 14, 2026: that intake repeats an earlier one…"** An earlier outcome
  was reversed, so the animal never left, and that intake doesn't record a
  real return: it repeats the arrival, and its day doesn't matter. Pick a
  later day, or, if the outcome happened that day, ask someone who can
  correct intakes to move that intake to an earlier day, then record the
  outcome.
- **"The outcome date can't be Jul 15, 2026: the intake on Oct 1, 2026
  would then read as a return after this animal's latest outcome that same
  day…"** (on **Edit Outcome**, with the days) With this outcome on the new
  day, nothing on the record says the animal left between its return and
  that later day, so the later intake reads as coming back after it left
  for good.
  - If the animal stayed in care until that later day, that intake repeats
    its arrival. Ask someone who can correct intakes to move it to an
    earlier day, then save this outcome again.
  - If the animal did leave again before that day, that departure is
    missing from its record, and an outcome can't be added between two
    intakes. Keep this outcome's day as it was, and write the right day in
    its **Notes**.
- **"Pick a reason category."**, **"Pick who authorized it."**, **"The drug
  is required."**, **"The dose with its unit is required."** or **"The route
  is required."** Fill in every field marked with *.
- **"Pick who performed the procedure."** Pick the person under **Performed
  by**.
- **"No matching person found. Add them to the people directory first, then
  pick them here."** (under **Authorized by** or **Performed by**) The person
  isn't in the shelter's directory, and these fields can't add anyone. Ask
  someone who manages the **People Directory** to add them, or add them
  there yourself if your account can, then pick them. For an outside vet
  who isn't in the directory, pick **Outside vet name** under **Performer
  type** and type the vet's name instead.
- **"Pick a performer or give the outside vet's name."** For an outside vet,
  pick a person or type the vet's name.
- **"Pick a performer or give the outside vet's name, not both."** Clear one
  of them.
- **"Describe the reason."** or **"Describe the circumstances."** You picked
  **Other**: say more in the notes.
- **"Pick the circumstances."** or **"Say whether the cause is known."** Pick
  one in each.
- **"Give the known cause, or choose Unknown."** Type the **Cause**, or pick
  **Unknown** under **Cause knowledge**.
- **No Euthanized or Deceased under Outcome Type, or no Add medical details
  on Edit Outcome.** Your account can record outcomes but not manage medical
  records. Ask a staff member who can do both.
- **The Date of Outcome is greyed out on Edit Outcome.** It says "Changing
  this date also changes the medical record and requires medical
  management." Ask a staff member who manages medical care.
- **The type is wrong.** As the note under **Outcome Type** on **Edit
  Outcome** says, a wrong type is fixed by reversing the outcome and
  recording the right one. Ask an admin to reverse it.
- **"View outcome" under the entry instead of "Correct through outcome".**
  Correcting needs a staff member who can both record outcomes and manage
  medical care. Ask them.
