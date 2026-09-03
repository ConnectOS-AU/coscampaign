# COSCampaign User Manual

*Last updated: 2026-09-03 (v0.5.5). This file is maintained alongside the code — see the note at the bottom.*

COSCampaign is ConnectOS's internal tool for sending email campaigns, running events with
registration, and collecting survey feedback. This manual covers everything a user can do
in the app, organized by task.

---

## 1. Signing in

Go to the app and sign in one of two ways:

- **Email and password** — enter your credentials. If two-factor authentication is enabled
  on your account, you'll be asked for a 6-digit code from your authenticator app afterward.
- **Sign in with Microsoft** — if your organization has this set up, click "Sign in with
  Microsoft" and use your normal Microsoft 365 account. Your permissions in COSCampaign are
  then controlled by which Entra ID (Microsoft 365) security groups you belong to — see
  [Section 10](#10-users--permissions-admin-only).

Closing your browser fully (not just the tab) signs you out — you'll need to sign in again
next time, even if "remember me" behavior exists elsewhere. This is deliberate.

---

## 2. Campaigns

### Creating a campaign

**Campaigns → New campaign** creates a blank draft and opens the editor.

### The editor

The main canvas is a drag-and-drop email builder. Drag blocks in from the sidebar — text,
image, button, divider, social links, table, and more — and click any block to edit it.

- **Images**: click an image block's **Select Image** icon to choose from your organization's
  shared image library, or **Upload Image** to add a new one (which also adds it to the
  library for reuse). See [Section 6](#6-image-library).
- **Tables**: drag the **Table** block onto the canvas for tabular content (schedules,
  pricing, comparisons).
- **Personalization tags**: any text block's merge-tag menu offers **First name** and
  **Last name** — insert one and it's replaced with each recipient's actual name when the
  campaign sends (blank if that person isn't in the employee directory).
- **Importing an existing email**: the **Import HTML/EML** button lets you upload a raw
  `.html` file or a `.eml` exported from Outlook (drag the email out of Outlook onto your
  desktop, or File → Save As). It loads as a single block you can edit as source, with any
  embedded images carried over automatically.
- **Templates**: **Save as template** stores the current design for reuse; **Load
  template...** replaces the canvas with a saved one.

### Choosing recipients

Pick one recipient source (not available for resend drafts, which reuse the original list):

- **Employees** — filter the active employee directory by any combination of: Client,
  Calendar, Client Country, Client Province, Work Arrangement, and Current Province.
  Selecting more than one value within a filter matches any of them; filters across
  different categories narrow the result together. Check **Send to all active employees**
  to ignore every filter. The matching count updates live as you adjust filters. Recipients
  are resolved fresh at the moment you send, not when you picked the filter.
- **Event registrants** — send to everyone registered (confirmed and waitlisted) for a
  chosen event. Only shown if you can manage events.
- **Individual recipients** — search and hand-pick specific people from the employee
  directory by name or email.

### Sending

Before you can send, you need:
- A subject line
- A verified **sender** (from the dropdown)
- An **unsubscribe group** (SendGrid requires this)
- At least one matching recipient

Buttons across the top of the editor:

- **Send test** — emails whatever's currently in the editor (saved or not) to your own
  selected sender's inbox, so you can see it land before committing to a real send.
- **Schedule** — asks for a future date/time, then queues the campaign to go out then.
- **Send now** — sends immediately.

Both Schedule and Send now show a confirmation prompt naming how many recipients will
receive it — nothing goes out without that confirmation. Sending doesn't block the editor:
recipients are imported into SendGrid in the background, and the campaign moves through
**queued → sending → sent** on its own; refresh the report page to check progress.

### Cancelling a send

If a campaign is still **queued** (waiting on the recipient import) or **scheduled** (a
future send SendGrid hasn't fired yet), its report page shows a **Cancel send** button that
reverts it to a draft. Once a campaign reaches **sending** or **sent**, there's no way to
recall it — no email provider can pull back mail that's already left, so cancellation
isn't offered at that point.

### After sending: the report

Each sent campaign's report page shows:
- Delivered / opened / clicked / bounced counts and an estimated average read depth
- A **Recipients** table — per-person status, Client, COSID, and read depth
- A **Link clicks** table — per-link click counts and who clicked each one
- A **Recent activity** feed of every tracked event
- **Resend...** — pick specific people (e.g. everyone who didn't open) and it creates a new
  draft targeted at just them, which you review and send like any other campaign

A copy of every sent campaign is also emailed to the original sender's own inbox as a
record of what actually went out.

---

## 3. Events

### Creating an event

**Events → New event**, then fill in:

- **Name, description, location, start/end time** — times are entered and displayed in
  Philippines time throughout the app.
- **Capacity** — optionally cap total attendance; once full, further registrations are
  waitlisted automatically.
- **Max tickets per person** — how many tickets one registration can claim (1 by default).
  When set above 1, the registration form asks for each additional guest's **name** and
  **relationship** to the registrant. Capacity counts total tickets claimed, not just
  registration submissions — a 3-ticket registration takes 3 slots.
- **Banner image & accent color** — theme the registration page and its emails.
- **Registration form fields** — build a custom form with short text, paragraph, email,
  phone, number, date, dropdown, multiple choice, checkboxes, yes/no, and section-heading
  field types. Drag fields to reorder them.
- **Invite flow**:
  - **Manual** — you copy the registration link or QR code yourself and paste it into a
    campaign.
  - **Auto-embed** — creates a draft campaign with the link and QR code already placed in
    it, ready to review and send.
- **Status** — Draft (not visitable yet), Open (accepting registrations), Closed.

### How registration works

A registrant fills in their name, email, employee ID (COSID), and any custom fields you
added. Their COSID is checked against the active employee directory, and a confirmation
email is sent to the **verified** email on file for that COSID (not necessarily the email
they typed) with an "Add to calendar" link and a confirmation button. **If they don't
confirm within 72 hours, the registration is automatically cancelled** and they're notified.
If a confirmed spot frees up (a cancellation), the longest-waiting *verified* waitlisted
registrant is promoted automatically and notified — as long as there's enough remaining
capacity for their full ticket count.

### Managing registrations

**Events → [event] → Registrations** lists everyone registered, their status, verification
state, ticket count, guest details, and every custom field answer, with an **Export CSV**
button for the full list.

---

## 4. Surveys

**Surveys → New survey**, add questions (short text, multiple choice, or 1–5 rating), and
share the survey link — it accepts an `{{email}}` merge tag in the URL so a link dropped
into a campaign personalizes itself per recipient automatically.

**Results** shows aggregate answers per question (bar breakdowns for multiple choice,
average + distribution for ratings, a list of free-text answers). **Export CSV** on that
page gives you one row per respondent with every answer, for anything more detailed than
the aggregate view.

---

## 5. Image library

**Images** is the shared library every campaign and event draws from. Upload images there
directly, or upload while editing a campaign (which adds to the library automatically).
Delete images you no longer need from the same page.

---

## 6. Templates

**Templates** lists every design saved via a campaign editor's **Save as template**. Click
**Use template** to start a new campaign pre-loaded with that design.

---

## 7. Recipient filtering reference

The employee filters (used when choosing campaign recipients) combine data from three
places, joined by employee ID (COSID):

| Filter | Source |
|---|---|
| Client, Calendar, Client Country, Client Province | Active employee directory |
| Work Arrangement | Position details |
| Current Province | Contact details |

Work Arrangement and Current Province may be blank for someone missing a matching record
in those source tables.

---

## 8. Content calendar

**Calendar** shows a month view of every scheduled and sent campaign on the day it went
(or will go) out, plus a list of unscheduled drafts below. Click any entry to jump straight
to that campaign.

---

## 9. Timestamps

Every date and time shown anywhere in the app — dashboards, reports, and the content of
outbound emails — displays in **Philippines time**, regardless of where the viewing
browser or the server happens to be. The one exception is the "Add to calendar" (.ics) file
on event confirmations, which correctly uses each recipient's own calendar app timezone
handling instead, as calendar files should.

---

## 10. Users & permissions (admin only)

**Users** (visible only if you have user-management access) has two sections:

**Local users** — add someone with an email and temporary password, and tick which of the
six permissions they get: manage users, manage campaigns, manage templates, manage images,
manage surveys, manage events. Reset a password or delete an account from the same table.

**Entra ID groups** — if Microsoft SSO is set up, permissions for anyone signing in that way
come from their Entra ID group membership instead of the checkboxes above. Paste in a
group's Object ID (from the Entra admin center) and a friendly name, then tick the
permissions that group grants. A person's SSO-derived permissions take effect at their next
sign-in — removing them from a group doesn't revoke access instantly, only when their
current session expires or they sign in again. Users signed in this way show a
"Managed via Entra ID" badge in the local users table instead of editable checkboxes.

---

## 11. Your account & security

**Security** (top right, available to everyone) lets you:
- **Change your password**
- **Enable or disable two-factor authentication** — scan the QR code with an authenticator
  app (Google Authenticator, Authy, 1Password, etc.) and confirm with a 6-digit code to
  turn it on.

---

## Keeping this manual current

This file lives at `docs/USER_MANUAL.md` in the repository and is the single source of
truth — there is no separate copy to keep in sync. Whenever a change to this app affects
what a user can do or how they do it, this document gets updated as part of that same
change, per the standing instruction in `CLAUDE.md`.
