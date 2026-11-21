---
title: Read the Housing Board and move animals by dragging
summary: See who is in which kennel and how full each unit is, find unplaced and fostered animals, and drag an animal to another unit.
permissions: [ANIMAL_INFO_READ, ANIMAL_INFO_MANAGE, MEDICAL_MANAGE]
aliases: [housing board, shelter board, kennel board, who is in which kennel, capacity, over capacity, full kennel, drag animal, drag and drop, unplaced animals, fostered animals card, kennel map]
related: [move-an-animal-to-another-unit, add-edit-or-delete-a-location-or-unit, open-a-care-episode-add-a-condition-or-allergy, find-a-foster-or-a-placement, read-an-animals-activity-and-journey, find-an-animal]
verified: 2026-11-21
---

## When to use this

The **Housing Board** shows the whole shelter at once: each location, its
units, and the animals in them. Use it to see where there is room, to find
animals with no unit, and, if you are staff, to move an animal by dragging
its chip to another unit.

To move one animal by editing its record, or to read the care-episode boxes in
full, use the guide on moving an animal to another unit. To add or change the
locations and units themselves, an admin uses **Settings**.

## Read the board

1. In the sidebar, open **Housing Board**. The page title reads **Locations**.
2. At the top, four counts: **Animals on site**, **Units**, **Unplaced** and
   **In foster**.
3. Under **Capacity:**, the legend explains the colours. Each unit shows how
   many animals it holds, then how many it is meant for, for example "2/1":
   - green, **Empty**: no animal in it, and the unit says "Empty".
   - plain, **Has space**: fewer animals than it is meant for.
   - amber, **At capacity**: exactly as many as it is meant for.
   - red, **Over capacity**: more than it is meant for.
4. Each location is a heading with its type, for example **Kennel** or
   **Medical**, and its number of units. Under it, each unit lists the
   animals in it as chips with the animal's name and species. A unit shows
   four chips, then **+1 more** (or however many). Click it to see the rest,
   and **Show less** to fold them away again.
5. Point at a chip to read more: a larger photo, breed, sex, age and where it
   is housed. Click **View full profile** to open the animal.

Animals that have left the shelter are not counted. Animals in foster are not
counted in a unit either, because they are not on the premises.

### Unplaced

The **Unplaced** card lists animals that are on site but have no unit and are
not in foster, under "On site but not assigned to a unit — needs attention."
With none, it says "No unplaced animals." To place one, drag it to a unit.

### In foster

The **In foster** card lists animals living with a foster, under "Fostered
animals aren't shown on the physical board." Each row shows the animal, and
"With Jane Doe · since Nov 15, 2026" (the foster's name and the day it went).
Click the row to open the animal. The foster's name shows only to people who
can read fosters; others read "With a foster · since Nov 15, 2026". The
animals on this card can't be dragged: to bring one back, return it from foster.

## Move an animal by dragging

Only staff who manage animals can move them. If your account can't, a drop
ends with "Failed to move" (see the end of this guide) and nothing changes.

1. Press on the animal's chip, then drag it. Move a little before it lifts, then
   drop it on another unit's box. Both need to be on the screen at once, so a
   tall window or a small zoom helps. To take an animal out of its unit
   without placing it elsewhere, drop it on the **Unplaced** card.
2. While you drag, the unit under the chip gets a dark ring. The ring is red
   if the move would take that unit over capacity.
3. Let go over the unit.

The chip moves at once, and **Saving…** shows next to the legend while it is
saved. Dropping into a unit that is full is allowed. If the unit is then over
capacity, a message pops up, for example "A-3 is now over capacity — 3/2".
Dropping on the unit the animal is already in does nothing.

The animal's record shows the new place under **Location**. Its **Activity**
tab reads "Olivia Chen moved this animal" (with your name). Click **Show
details** for the move, for example "Moved to Medical wing · MED-2." or "Moved
from Dog block A · A-4 to Dog block A · A-3." A move onto **Unplaced** reads
"Removed from Dog block A · A-1 (now unplaced)." This is the same entry the
Edit Profile route writes.

### Moving into or out of a medical area

If you manage medical care, a move into or out of a **Medical** location can
ask whether to open or close a care episode, exactly as it does when you move
an animal from Edit Profile. For example, dropping Leo on MED-2 asks "Leo is
now in Medical wing · MED-2. Open a care episode?" The move is already saved
when the box appears, and **Not now** leaves it as it is. Whether a box
appears, and what it asks, is explained in the guide on moving an animal to
another unit.

## If something goes wrong

- **"Failed to move Rocket."** (with the animal's name) The move wasn't
  saved and the chip jumps back. Your account may not be allowed to move
  animals, or your sign-in may have ended, or the connection failed. Reload
  the page, and if it happens again, ask a staff member.
- **"This animal has left the shelter, so it can't be placed in a unit."** The
  animal was archived while you had the board open. Reload the page.
- **"That unit is no longer available."** An admin deleted the unit or its
  location. Reload the page.
- **"That animal no longer exists."** Reload the page.
- **"Database Error: Failed to move animal."** Nothing was saved. Try
  again; if it keeps happening, tell an admin.
- **"Access Denied".** Your account can't read animals. Ask an admin.
- **The board looks out of date.** Reload it to see what others have changed.
