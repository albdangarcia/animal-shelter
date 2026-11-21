---
title: Edit a person's details and household
summary: Correct a person's contact details or write down their household, and know what staff can't change for someone who has a login.
permissions: [PERSONS_MANAGE]
aliases: [edit a person, update a contact, change phone number, change address, correct a person's name, edit contact info, add household info, edit household info, household profile, update household, no children, landlord permission]
related: [add-a-person, find-a-person-and-read-their-record, add-edit-or-delete-a-note-on-a-person, unlink-a-login-from-the-wrong-person, enter-an-adoption-application-for-someone, edit-an-adoption-application-for-an-applicant]
verified: 2026-11-21
---

## When to use this

Use this to fix a person's name, phone or address, or to record the home they
live in. A person with a login can also change their own details from their
account. To add someone who isn't in the directory, see
[Add a person](./add-a-person.md). To record something you learned about them
that has no field, write a note: see
[Add, edit or delete a note on a person](./add-edit-or-delete-a-note-on-a-person.md).

## Edit contact details

1. In the sidebar, click **People Directory** and click the person. On the
   **Profile** tab, under **Contact & Account Details**, click **Edit Contact
   Info**. You can also click **…** at the end of their row in the list, then
   **Edit Contact Info**.
2. The page **Edit Person** opens with what the shelter has now. Change
   **Name**, **Email**, **Phone**, **Street Address**, **City**, **State** or
   **Zip Code**. You still need an **Email** or a **Phone**.
3. Click **Save Changes**.

You should see "Person updated successfully." and you go back to the person's
**Profile** tab, or to the list if you started from there. The phone and email
follow the rules in [Add a person](./add-a-person.md), including the warning
for a phone or email another record already has.

### A person who has a login

On the **Profile** tab, **Login Account** says **Yes** for a person who has
one. Two things follow:

- You can't change their **Email** while the login can sign in. It is the
  address they sign in with. The form says "This person has an account and
  signs in with this address. They can change it from their own profile."
  Everything else on the form you can change. If the person's record shows
  **Deactivated**, their login can't sign in and you can change the email.
- A new **Name** is copied to their login as well.

If the login isn't theirs at all, it was linked to the wrong record. Ask an
admin to unlink it: see "Unlink a login from the wrong person" in **Help**.

## Edit the household

The household is the home a person lives in: it is what an adoption
application asks about.

1. On the **Profile** tab, find **Household & Lifestyle** and click **Edit
   Household Info**. If nothing is on file it says "No household information
   on file." and the button reads **Add Household Info**.
2. Fill in the form. The questions are worded to the person, such as "Do you
   have a yard?". Answer for them.
   - **Living Situation**: **Own Home**, **Rent Apartment**, **Rent House**,
     **Live With Family** or **Other**.
   - **Household Size**: everyone in the home, from 1 to 50.
   - **Do you have a yard?**
   - **Do you have landlord permission?** It shows only for **Rent
     Apartment** and **Rent House**. If you change to another living
     situation, the answer is dropped.
   - **Do you have children at home?** When you pick **Yes**, **Ages of
     children** appears: type the ages with commas, such as `5, 8, 12`. When
     you pick **No**, any ages are cleared.
   - **Other Animals in the Home** is optional.
   - **Experience with Animals**.
3. Click **Save**.

You should see "Household profile updated." and the **Profile** tab opens.
Under the household, a line says who last changed it and when, for example
"Last edited by Olivia Chen on November 21, 2026". Staff can edit the household
of a person who has a login too, and the line shows it was staff.

## How the household and applications meet

- An adoption application, and a foster application, starts with the person's
  household answers filled in. See
  [Enter an adoption application for someone](./enter-an-adoption-application-for-someone.md).
- Each application keeps its own copy of the answers. Changing the household
  later doesn't change an application already filed.
- Filing an application saves its household answers back to the household,
  whether staff or the person files it, and so does a staff edit of an
  application. A person editing their own application does not. The person can
  also change the household themselves from their account. Whoever saves last
  wins, and the "Last edited by" line says who. The app doesn't point out when
  the household and an application disagree.

## If something goes wrong

- **"Name is required."** Type the **Name**.
- **"Provide an email or phone number so this person can be contacted."**
  Type an **Email** or a **Phone**.
- **"This person has an account and signs in with this address. They can
  change it from their own profile."** Put the **Email** back as it was. You
  can't change or clear it.
- **"This email is already the sign-in address for another account."** Another
  login uses that address. Use a different one.
- **"This email is already in use."** Another record or login took that
  address a moment ago. Use a different one.
- **"Household size is required."** or **"Household size must be a number."**
  Type the number of people in the home, from 1 to 50.
- **"Household size must be between 1 and 50."** Type a number in that range.
- **"Living situation is required."**, **"Yard information is required."**,
  **"Children information is required."** or **"Animal experience is
  required"**. Answer the question.
- **"Landlord permission is required when renting."** Answer the landlord
  question.
- **"Please provide the ages of the children if 'Yes' is selected."** Type the
  ages, or pick **No**.
- **"Ages must be a comma-separated list of numbers."** Type numbers with
  commas, such as `5, 8`.
- **"Person not found."** The record was removed. Go back to **People
  Directory**.
- **"Database Error: Failed to update person."** or **"Database Error: Failed
  to update household profile."** Nothing was saved. Try again. If it keeps
  happening, tell an admin.
- **Access Denied**, or no **Edit Contact Info** button. Your account can read
  people but not change them. Ask a staff member.
