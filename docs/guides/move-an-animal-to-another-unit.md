---
title: Move an animal to another unit
summary: Change the kennel, room or other unit an animal is housed in, and open or close a care episode when it moves in or out of a medical area.
permissions: [ANIMAL_INFO_MANAGE, MEDICAL_MANAGE]
aliases: [move kennel, change kennel, rehouse, relocate an animal, move to medical, unplaced, assign a kennel]
related: [edit-an-animals-details, add-edit-or-delete-a-location-or-unit, open-a-care-episode-add-a-condition-or-allergy, take-in-a-new-animal]
verified: 2026-11-16
---

## When to use this

Use this when an animal moves to another kennel, room or run, or when you
find out where an animal you recorded as **Unplaced** is. The animal's record
shows where it is under **Location**, for example "Dog block A · A-2".

The locations and units to pick from are set up by an admin in
**Settings**.

## Steps

1. Open the animal, then click **Edit Profile**. The page **Edit Animal
   Details** opens.
2. Under **Location**, pick the area, for example "Dog block A".
3. Under **Unit**, pick the unit. Each shows how many animals it holds, then
   how many it is meant for, for example "A-1 · 2/1 (full)". You can still
   pick a full one.
4. If you don't know where the animal is, pick **Unplaced** under
   **Location** instead.
5. Click **Save Changes**.

You should see "Animal updated successfully." The record shows the new place
under **Location**.

The **Activity** tab shows "Olivia Chen moved this animal" (with your name).
Click **Show details** to see the move, for example "Moved from Dog block A ·
A-2 to Dog block A · A-3.", "Moved to Dog block A · A-2." for an animal that
was unplaced, or "Removed from Dog block A · A-2 (now unplaced)."

## Moving in or out of a medical area

When you move an animal into a unit of a location whose type is **Medical**,
such as "Medical wing", from somewhere that isn't medical (or from
**Unplaced**), a box asks "Charlie is now in Medical wing · MED-1. Open a care
episode?" (with the animal and the unit). Moving doesn't open one by itself.
No box appears if the animal already has a care episode open, or if it is
archived.

- To open one, check the **Kind of care** (it starts on **Hospitalised in
  house**) and the **Start date**, type the **Reason**, and click **Open
  Episode**. The record then shows, for example, "Hospitalised in house since
  Nov 16, 2026".
- To skip it, click **Not now**.

When you move an animal that is hospitalised in house out of a medical
location to one that isn't medical (or to **Unplaced**), a box asks "Close Charlie's care episode (hospitalised in house
since Nov 16, 2026)?". Pick the **End date** and click **Close Episode**, or
click **Not now** to leave the episode open.

Moving between two medical units asks nothing. These boxes appear only for
staff who manage medical care. For anyone else,
the move is saved and nothing is asked. Care episodes are explained in the
guide on care episodes, conditions and allergies.

## If something goes wrong

- **Location and Unit are greyed out.** The animal is archived: it has left
  the shelter, so it can't be housed.
- **"Database Error: Failed to update animal record."** Nothing was saved.
  Try again; if it keeps happening, tell an admin.
