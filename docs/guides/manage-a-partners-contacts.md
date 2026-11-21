---
title: Manage a partner's contacts
summary: Link people to a partner as contacts, set the primary contact, change a contact's role, and deactivate or reactivate a contact.
permissions: [PARTNERS_MANAGE]
aliases: [partner contact, add a contact to a partner, primary contact, who to call at a rescue, contact person, intake coordinator, deactivate a contact, reactivate a contact, set as primary, partner contacts tab]
related: [find-a-partner-and-read-its-animal-history, add-or-edit-a-partner, add-edit-or-delete-a-note-on-a-partner, add-a-person]
verified: 2026-11-21
---

## When to use this

Use this to record who to call at a partner. A contact is a person from the
People Directory linked to the partner, with a role. If the person isn't in
the directory yet, add them first: see "Add a person" in **Help**. To change
the partner's own details, see
[Add or edit a partner](./add-or-edit-a-partner.md).

A partner can have many contacts and one **Primary** contact. The primary
contact is the one the partner's page shows under **Primary Contact**. One
person can be a contact at several partners.

## Add a contact

1. In the sidebar, click **Partner Directory**, click the partner, then the
   **Contacts** tab.
2. Click **Add Contact**. The box **Add Contact** opens.
3. Click **Search for a person...** and type a name or an email. Click the
   person in the list. People who are already active contacts here aren't
   listed. The list shows everyone else in the system, including
   administrators, whose People Directory records you can't open. A person who
   used to be a contact here is marked **Deactivated here**, and the form says
   adding them will reactivate the link. It doesn't: the app refuses with
   "This person is already a contact here." For those people, use
   **Reactivate** (see below) instead of **Add Contact**.
4. Under **Role**, type what they do there, such as "Intake Coordinator". It is
   optional.
5. Tick **Primary contact** if this is the person to call first. Setting it
   unsets whoever was primary before. Leave **Active** ticked. Don't tick
   **Primary contact** and untick **Active** together: the app saves both, the
   list shows **Primary**, but the partner's page says "No primary contact
   set." because only an active contact counts. A contact who isn't active
   can't really be the primary.
6. Click **Add Contact**.

You should see "Contact added successfully." The person is in the list with
their role, email and phone. A **Primary** badge marks the primary contact,
who is listed first. The name is a link to their record in the People
Directory.

## Change who is primary

1. Point at the contact and click the **…** button at its top right, then
   **Set as primary**.

You should see "Primary changed from NAME to NAME." with an **Undo** button.
Click **Undo** to put the earlier contact back. If nobody was primary, the
message reads "NAME set as primary contact." and has no **Undo**.

## Change a contact's role

1. Click **…** on the contact, then **Edit**. The box **Edit Contact** opens.
2. Change **Role**, or tick or untick **Primary contact**.
3. Click **Update Contact**.

You should see "Contact updated successfully." You can't change which person
the contact is. The box says "Remove this contact and add another", but there
is no Remove: deactivate the old contact (see below), then add the right
person as a new one. The same rule applies to **Active** here: untick it only
if the contact is not primary, or use **Deactivate**, which also clears
primary.

## Deactivate and reactivate a contact

When someone leaves the partner, keep the link for history instead of
deleting it.

1. Click **…** on the contact, then **Deactivate**.

You should see "Contact deactivated." The contact stays in the list, greyed
out and marked **Inactive**. A contact that was primary stops being primary,
so the partner shows "No primary contact set." until you pick another.

To bring someone back, click **…** on the inactive contact, then
**Reactivate**. You should see "Contact reactivated." They are not primary
again: use **Set as primary** if they should be.

## If something goes wrong

- **"Please select a person."** Click **Search for a person...** and pick one.
- **"This person is already a contact here."** The person is already linked to
  this partner. If the picker showed **Deactivated here**, they are an
  **Inactive** contact further down the list: the form's promise to reactivate
  them doesn't hold, so find them there and use **Reactivate**. If they are
  an active contact, there is nothing to do.
- **"Failed to set primary contact."** or **"Failed to update contact."**
  Nothing changed. Try again.
- **"Couldn't undo."** Use **Set as primary** on the contact you want.
- **"Database Error: Failed to add contact."** or **"Database Error: Failed to
  update contact."** Nothing was saved. Try again. If it keeps happening, tell
  an admin.
- **Add Contact** is greyed out, and the contacts have no **…** button. Your
  account can read partners but not change them. Ask a staff member.
