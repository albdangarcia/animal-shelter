---
title: Add, edit or delete a location or unit
summary: Add a kennel area and the units in it, change a unit's name or capacity, or delete one that is no longer used.
permissions: [MANAGE_LOCATIONS]
aliases: [add a kennel, new kennel, add a run, add a room, kennel capacity, change capacity, housing units, remove a kennel, restore a location, isolation room, quarantine area, offsite location]
verified: 2026-11-10
---

## When to use this

A location is an area of the shelter, such as "Dog block A". A unit is one
place in it where animals are housed, such as kennel "A-1". Staff pick a
**Location** and a **Unit** when they admit an animal. Use this guide to set
up locations and units, change them, or take them out of use.

## Add a location

1. In the sidebar, open **Settings**, then the **Locations** card. Each
   location is listed with its type and its units.
2. Click **Add Location**.
3. Type the **Name**, for example "Puppy room".
4. Pick the **Type**: **Kennel**, **Isolation**, **Medical**, **Quarantine**,
   **Offsite** or **Other**.
5. Click **Create Location**.

You should see "Location created successfully." The location appears in the
list with "No units yet." Add its units next.

## Add a unit

1. On the location's row, click **Add Unit**.
2. Type the **Name**, for example "P-1".
3. Set the **Capacity**: how many animals it is meant to hold. It starts at 1.
4. Click **Create Unit**.

You should see "Unit created successfully." The unit shows under the location,
for example "P-1 · cap 3". Staff can now pick it.

Capacity doesn't stop anyone. When staff pick a unit, it shows how many
animals it holds, for example "P-1 · 1/3", and "(full)" once it reaches its
capacity, but they can still house an animal there.

## Edit a location or unit

1. Click the **…** button on the location's row, or beside the unit, then
   **Edit**.
2. For a location, change the **Name** or **Type**. For a unit, change the
   **Name** or **Capacity**. A unit can't move to another location.
3. Click **Update Location** or **Update Unit**.

You should see "Location updated successfully." or "Unit updated
successfully.", and the list shows the change.

## Delete a unit or location

Delete one that is no longer used. Nothing is lost: you can restore it later.

1. To delete a unit, click the **…** button beside it, then **Delete**. It
   must have no animals housed in it. There is no confirmation, so check the
   name first.

   You should see "Unit deleted successfully." with an **Undo** button. The
   unit stays in the list, faded, marked **Deleted**. Staff can no longer pick
   it.
2. To delete a location, first delete each of its units. Then click the **…**
   button on the location's row, then **Delete**.

   You should see "Location deleted successfully." with an **Undo** button. The
   location leaves the list.

## See deleted locations, or bring one back

1. Click **Status**, then **Deleted**, then press Esc. Only deleted locations
   show, or "There are no deleted locations." Click **Active** too to see
   both.
2. Click the **…** button on the location's row, then **Restore**.

   You should see "Location restored successfully." It leaves this view,
   because it is no longer deleted. Its units stay deleted. If a live
   location now has its name, in any capitals, rename or delete that one
   first.
3. To bring a unit back, click **Status**, then **Deleted** again to untick
   it, so the active locations show. Then click the **…** button beside the
   unit, then **Restore**.

   You should see "Unit restored successfully." Staff can pick it again.

To bring back a unit or location you just deleted, you can also click **Undo**
on the message.

## If something goes wrong

- **"Name is required."** Type a name.
- **"Pick a location type."** Pick the location's **Type**, then click
  **Create Location** again.
- **A location named "Puppy room" already exists.** No two live locations
  can share a name, in any capitals. Pick another name. If the message says it
  may be deleted, show the deleted locations and restore that one.
- **A unit named "P-1" already exists in this location.** No two live units of
  a location can share a name, in any capitals. Another location can have a
  unit with the same name. If the message says it may be deleted, restore
  that unit instead.
- **"Capacity must be a whole number."** or **"Capacity is required."** Type a
  whole number, 1 or more.
- **"Can't delete this location while it still has units. Delete its units
  first."** Delete each of its units, then the location.
- **"Can't delete this unit while animals are housed in it. Move the animals
  out first."** Move each animal to another unit, then delete it.
- **"Can't restore a unit in a deleted location. Restore the location
  first."** Restore the location, then the unit.
- **Can't restore "Puppy room": a location named "puppy room" already
  exists. Rename or delete that one first.** (with the names; for a unit,
  "already exists in this location") A live location, or a live unit of the
  same location, has the same name, perhaps in other capitals. Edit it to
  rename it, or delete it, then restore the one you wanted.
- **Add Unit is greyed out.** The location is deleted. Restore it first.
