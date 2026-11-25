# Shipyard Daily Report System: Usage Guideline (source document)

This file is the single reference for how the website is used. The user guideline
that people read will be written from it, so every rule, role and step lives here
first. When the website changes, change this file in the same commit and add a line
to the [Changelog](#13-changelog).

- **App:** Daily Report Shipyard, PT Barokah Galangan Perkasa
- **Live address:** https://shipyard-report.barokahperkasagroup.tech
- **First compiled:** 24 November 2026, from the code at commit `56eb1ff`
- **Language of the app:** English, except the Activity Log and the readiness checklist, which are Indonesian

---

## 1. How to keep this document up to date

1. Change this file whenever a feature, role rule, number format, status or screen changes. Do it in the same commit as the code change.
2. Update the matching topic in the in-app guide, `src/content/guide/` (one file per group, edited as plain text). The guide people read in the website is written from this file. It is in **Indonesian**, while this file stays in English. Names of menus, buttons, pages and roles stay exactly as on screen (English) so people can find them.
3. Add one line to the [Changelog](#13-changelog): date, what changed, which section.
4. Mark anything you could not confirm with **[To confirm]** and list it in [section 11](#11-open-questions-and-known-inconsistencies). Move it out once the team has answered.
5. Describe what the code does today, not what was planned. Plans go in [section 12](#12-plan-for-the-user-guideline).
6. Use the exact role names and menu names as they appear in the app.

### Screenshots in the guide

- Steps in the in-app guide can show a picture. The files are in `public/guide/`, and a step names its picture in `src/content/guide/` (`image: { src, alt }`). The `alt` text must say what the picture shows.
- They are taken with Playwright against the local dev server, signed in as the role the topic is for (the Shipping topics use a Shipping account).
- Use only test data: plans named "[TEST] ...". Real plans, projects, vessels, prices and people must not appear. Where a real list cannot be avoided, blur the rows before the shot (for example the Work Verification table). Hide the top bar when taking a page-only picture so the account name does not show.
- Retake a picture whenever its screen changes visibly. Current pictures: menu, plans list, new plan form, plan page, import dialog (empty and with a file), sent-back plan, Work Verification (blurred rows), Additional WO Approvals, sign-in page (taken signed out, fields empty), converted plan, readiness form (empty, filled, submitted). The readiness pictures come from the test project "[TEST] HT SAMALAJU JAYA - Docking - Apr 2027" (project 110, plan 58); its form was then approved by HSSE (signed off as "Test HSSE") for the review pictures: Readiness Queue, review, sign-off, approved.
- Still missing: the other topics of PPIC, HSSE, Production, Finance, Admin and Manager.

Tags used below:

| Tag | Meaning |
|---|---|
| (no tag) | Confirmed in the code on the compile date |
| **[To confirm]** | The code is unclear, or the team has not decided |
| **[Known gap]** | Behaviour that looks unintended and is listed in section 11 |

---

## 2. The system at a glance

### 2.1 Words used in the app

| Term | Meaning |
|---|---|
| **Vessel** | A ship that comes to the shipyard. Shown with a type (TB, BG, SPOB and so on) and a company. A vessel with no fleet number counts as outside the company's own fleet. |
| **Project** | One docking event of one vessel. Work orders live inside a project. |
| **Docking type (Jenis Docking)** | Docking, Docking - IS (Intermediate Survey), Docking - AS (Annual Survey), Docking - SS (Special Survey), Repair, New Building. |
| **Docking plan** | A plan Shipping drafts about two months before a vessel docks. PPIC approves it, then converts it into a real project. See [6.1](#61-docking-plans-shipping-planning). |
| **Work order (WO)** | A job order for a vessel inside a project. **Original** work orders are the planned scope. **Additional** work orders are added later and need approval. |
| **Work detail** | One task line under a work order: description, location, scope, quantity, dates. |
| **Work progress** | A dated percentage report on one work detail. |
| **Work verification** | The Operation Head duty (now done by Shipping): the review of a work detail that reached 100%. |
| **Readiness form (FM-OPS-04-11)** | The checklist that shows a vessel is safe to enter the shipyard. HSSE approves it. |
| **BASTP** | Berita Acara Serah Terima Pekerjaan: the work handover minutes for a vessel, listing finished work details and general services. |
| **Form Penawaran** | The quotation PDF uploaded to a BASTP. |
| **General services** | Docking, electrical, security, fresh water and other services added to a BASTP and priced on the invoice. |
| **Invoice** | Created from a BASTP that is ready for invoice. |
| **Kapro** | The customer-side responsible person attached to a work order. |
| **UOM** | Unit of measure. |

### 2.2 Two different things both called "Docking planning"

- **Docking Plans** (menu Planning): Shipping's plan made ahead of docking. See [6.1](#61-docking-plans-shipping-planning).
- **"Docking Planning" panel** inside Edit Work Order: a schedule estimate of docking stages (docking, floating, vessel on dock, undocking) with start and close dates. See [6.4](#64-work-orders).

Use the full names in the guideline so readers do not mix them up.

### 2.3 The whole flow in one picture

```
Shipping plan (optional, about 2 months ahead)
   Draft -> Submitted -> PPIC approves -> PPIC converts
                                              |
                                              v
Project  ->  Readiness form (HSSE approves)  ->  Original work order(s)
                                                       |
                                                       v
                                       Work details (PPIC plans, PRODUCTION executes)
                                                       |
                                                       v
                                  Work progress (PRODUCTION) up to 100%
                                                       |
                                                       v
                    Work verification (Operation Head; auto-approved after 2 days)
                                                       |
                                                       v
                 BASTP: Draft -> Verified -> Ready for invoice (materials + Form Penawaran)
                                                       |
                                                       v
                                      Invoice (Finance): Unpaid -> Paid

Side branches:  Additional work order -> Operation Head approval (or Chairman Directive)
                Import / Export, Master data, User management, Activity log, Alerts
```

---

## 3. Roles and access

There are nine roles: **MASTER, PPIC, PRODUCTION, ADMIN, FINANCE, MANAGER, HSSE, ADMIN_SHIPPING, SHIPPING.** The former OP_HEAD role was retired on 25 November 2026: its people are SHIPPING now, and SHIPPING also does everything OP_HEAD did. "Operation Head" still names the duty (approving additional work orders, verifying finished work) and appears in some screen texts. An administrator creates accounts and assigns the role. See [6.15](#615-user-management).

### 3.1 Who can do what

"View" means the menu item and page open. "Change" means create, edit or delete where the module allows it.

| Module | View | Change | Approve or review |
|---|---|---|---|
| Dashboard | Every role | n/a | n/a |
| Docking Plans | Every role | MASTER, SHIPPING (SHIPPING only on its own plans) | PPIC reviews; PPIC or MASTER reopens and converts. MASTER can act for PPIC. |
| Projects | MASTER, PPIC, PRODUCTION, SHIPPING, ADMIN, MANAGER, HSSE, ADMIN_SHIPPING | MASTER, PPIC, PRODUCTION, ADMIN, ADMIN_SHIPPING | n/a |
| Readiness form | Same as Projects | Fill and submit: PPIC, MASTER, ADMIN_SHIPPING, SHIPPING (plan projects only) | HSSE and MASTER review and sign off |
| Readiness Queue | MASTER, HSSE, MANAGER | n/a | HSSE, MASTER (through the form) |
| Work Orders | MASTER, PPIC, PRODUCTION, SHIPPING, ADMIN, MANAGER, HSSE, ADMIN_SHIPPING | MASTER, PPIC, PRODUCTION, ADMIN, ADMIN_SHIPPING | n/a |
| Additional WO Approvals | MASTER, SHIPPING, MANAGER | n/a | MASTER, SHIPPING |
| Work Details | Same as Work Orders | Add: PPIC, MASTER, ADMIN_SHIPPING. Edit: PPIC (planning fields), PRODUCTION (execution fields), MASTER (both). ADMIN and ADMIN_SHIPPING get the full form **[To confirm]** | n/a |
| Work Progress | MASTER, PPIC, PRODUCTION, SHIPPING, ADMIN, MANAGER, HSSE | PRODUCTION, MASTER | n/a |
| Work Verification | MASTER, SHIPPING, MANAGER, plus one named external verifier | n/a | MASTER, SHIPPING |
| BASTP | MASTER, PPIC, PRODUCTION, SHIPPING, ADMIN, FINANCE, MANAGER | MASTER, PPIC, PRODUCTION, ADMIN | n/a |
| Invoices | MASTER, FINANCE, MANAGER | MASTER, FINANCE | n/a |
| Export Data | MASTER, PPIC, PRODUCTION, SHIPPING, ADMIN, MANAGER | n/a | n/a |
| Import Data | Menu: MASTER, PPIC, PRODUCTION, SHIPPING, ADMIN, MANAGER, ADMIN_SHIPPING. The page only lets PPIC, MASTER, ADMIN_SHIPPING import. | PPIC, MASTER, ADMIN_SHIPPING (the Work Progress tab: PPIC, MASTER only) | n/a |
| Master Data | MASTER, PPIC, MANAGER | MASTER, PPIC | n/a |
| User Management | MASTER, MANAGER | MASTER | n/a |
| Activity Logs | Every role, each seeing a different scope | n/a | n/a |
| API Documentation | MASTER only | MASTER | n/a |

### 3.2 Special rules per role

- **MANAGER** is read-only everywhere.
- **HSSE** and **SHIPPING** can view Projects, Work Orders, Work Details and Progress but never change them. HSSE keeps write access to the readiness form review. SHIPPING keeps Docking Plans, Work Verification and Additional WO Approvals, and fills the readiness form of projects made from its own plans.
- **FINANCE** and **SHIPPING** can view BASTP but not edit it.
- **PPIC** plans work details (price, dates, scope). **PRODUCTION** executes them (PIC, SPK, permits, progress). Only PPIC and MASTER see or edit the PPIC price.
- **ADMIN_SHIPPING** creates work orders and work details, and may leave planned dates empty for PPIC to fill later. A "create only" limit for this role exists in the code but is switched off for now **[To confirm]**.
- **SHIPPING** (which now includes the former Operation Head role) has the Dashboard, alerts, Docking Plans, Work Verification and Additional WO Approvals, plus view access to Projects, Work Orders, Work Details, Work Progress, BASTP and Export Data. It can fill the readiness form only for projects made from its own plans, and can read the others.
- One named PPIC user (acting as PPIC Manager) can also review Work Verification, but only for vessels outside the company fleet. It is set by user id in the code.

---

## 4. Getting started

### 4.1 Signing in and out

1. Open the live address and enter your email and password. The eye icon shows or hides the password.
2. After signing in you go to the page you asked for, otherwise the Dashboard.
3. **Logout** is the red button at the top right.

There is no self-signup and no "forgot password" screen. Ask an administrator for an account or a reset. How the administrator creates accounts and resets passwords is outside this app **[To confirm]**.

If your account is deactivated, or has no profile, you are signed straight out with "Access denied. You don't have permission to access this system."

### 4.2 Finding your way around

- The left sidebar can collapse to icons, and the app remembers your choice. On a phone or narrow window it becomes a **Menu** button that opens a drawer.
- Menu groups, in order:
  - (no title): Dashboard
  - Planning: Docking Plans
  - Operations: Projects, Work Orders, Work Details, Work Progress
  - Approvals & Review: Readiness Queue, Additional WO Approvals, Work Verification
  - Finance & Documents: BASTP, Invoices
  - Data Tools: Export Data, Import Data
  - Developer: API Documentation
  - Administration: Activity Logs, User Management, Master Data
  - Bantuan: Panduan Pengguna (every role)
- You only see the items your role may open. Typing the address of a page you cannot open sends you home.
- The **bell** at the top shows the number of active alerts ("9+" above nine) and opens the Alerts page.
- There is no global search. Each page has its own search box, and pickers for vessel, project and work order are searchable.
- Keyboard: Tab moves through controls, Escape closes dialogs, and a "Skip to main content" link appears on the first Tab.

---

## 5. How a vessel's work moves through the system

1. **Plan (optional).** Shipping drafts a docking plan about two months ahead. PPIC approves it and, near the docking date, converts it to a project. Skip this step for work that is not planned ahead.
2. **Project.** Create a project for the vessel and docking type, or get one from a converted plan.
3. **Readiness form.** The project needs its readiness form approved by HSSE before its first original work order can be created. Plans converted by PPIC create their work orders straight away **[Known gap]**, see [11](#11-open-questions-and-known-inconsistencies).
4. **Work orders and work details.** Original work orders and their work details are created and planned. Later extra scope becomes an additional work order with Operation Head approval.
5. **Progress.** PRODUCTION reports progress percentages on each work detail.
6. **Verification.** At 100%, the Operation Head reviews each work detail. If nobody reviews it, it is approved automatically after 2 days.
7. **BASTP.** Finished work details, materials and general services go into a BASTP. It moves to Ready for Invoice once materials are submitted and the Form Penawaran PDF is uploaded.
8. **Invoice.** Finance prices the BASTP, applies tax, and tracks payment.

---

## 6. Module guides

### 6.1 Docking Plans (Shipping planning)

**Purpose.** Let Shipping plan a vessel's docking about two months ahead, have PPIC check the plan, and turn it into a real project without retyping. Plans live in their own tables. They never appear on the dashboard, alerts, exports or the work order pages until they are converted.

**Menu and screens.** Planning, Docking Plans (`/plans`). The list has status chips with counts, a search box, and for PPIC a "plans waiting" notice. Each plan has a details page, an edit page, and a convert page.

**Who can do what.**

| Action | Who |
|---|---|
| View plans | Every role |
| Create, edit, delete, submit | SHIPPING (own plans) and MASTER (any plan), only while the plan is Draft or Sent back |
| Review (approve or send back) | PPIC, or MASTER acting for PPIC |
| Reopen an approved plan, convert it | PPIC or MASTER |

**Statuses.**

| Status | Meaning |
|---|---|
| Draft | Shipping is still building the plan. Editable. |
| Awaiting review | Submitted. Locked. Waiting for PPIC. |
| Sent back | PPIC returned it with notes. Shipping can edit it again. |
| Approved | PPIC approved. Locked. Waiting to be converted. |
| Converted to project | A real project, work orders and work details were created from it. Locked for good. |

**Steps.**

1. **Create the plan** (Shipping or MASTER): choose the vessel, docking type and target docking date. The name is suggested as "Vessel - type - Mon YYYY" and can be changed. Notes are optional.
2. **Add work orders.** Each has an optional work location, customer WO number and notes.
3. **Add work details** under each work order. Required: description, location, work scope, quantity (0 or more), UOM (Ls, Unit, Pcs or Lbr). Optional: planned start date, target close date (not before the start), notes. There is no price, PIC, SPK or permit number on a plan. PPIC adds those after conversion.
4. **Import instead of typing** (optional): see below.
5. **Submit for review.** Needs at least one work order, and every work order needs at least one work detail. The plan becomes Awaiting review and locks.
6. **PPIC reviews.**
   - **Approve:** one PPIC approval makes the plan Approved. HSSE does not review the plan. HSSE's approval is the project's readiness form.
   - **Send back:** needs a note, either overall or on individual work orders and work details. The plan becomes Sent back. The notes show as flags on the exact lines.
7. **If sent back,** Shipping fixes the lines and submits again. Each submission is numbered. The review history keeps every round.
8. **Convert** (PPIC or MASTER, only when Approved):
   - The convert page suggests the project name and the shipyard WO numbers.
   - For each work order PPIC sets the shipyard WO date and the Kapro (required), and optionally the customer WO date.
   - One click creates the project, work orders and work details together, or nothing at all if something fails.
9. **Reopen** (PPIC or MASTER, only when Approved, with a reason): the plan returns to Draft and the approval is void.

**Import from Excel** (on a Draft or Sent back plan).

1. Press **Import from Excel**, then **Download template**. The file has a Work Orders sheet, a Work Details sheet, an Instructions sheet and reference lists. Location, Work Scope and UOM have dropdowns.
2. In the Work Orders sheet give each work order a short **Work Order Ref** such as `WO-1`. Work Location, Customer WO Number and Notes are optional.
3. In the Work Details sheet put the Work Order Ref of the work order each line belongs to. Required: Description, Location, Work Scope, Quantity, UOM. Optional: dates (YYYY-MM-DD), notes.
4. Delete the example rows, choose the file, and read the check. Any problem is listed by sheet and row, and nothing is saved until the file has no problems. A work order with no work details is only a warning.
5. Press **Import into plan**. Everything in the file is added after the work orders already in the plan. Existing work orders are not changed.
6. Limits: `.xlsx` only, 5 MB, 500 rows per sheet. The Work Order Ref is only a label for the import and is not saved.

**What conversion copies.**

- Project: the confirmed name, the plan's vessel and docking type.
- Work orders: vessel, customer WO number, work location, work type (the plan's docking type), plus the shipyard WO number, WO date, customer WO date and Kapro typed on the convert page.
- Work details: description, scope, location, quantity, UOM, planned start, target close, notes.
- Not copied: the plan's own notes, work order notes, and the review history. Prices, PIC, SPK and permit numbers are added later.
- The live rows are owned by the PPIC user who converted, not by the Shipping author.

**After conversion.**

- The plan, its work orders, work details and review history stay as a locked record. Each plan line records which live row it became, and the plan records the project, date and person.
- Editing or deleting the live project never changes the plan, and the plan can never change the live rows.
- Shipping gets a link to the project's readiness form from the converted plan. Everyone else gets a link to the project.
- The Plans list has a **Status** column and a **Checked by** column. Checked by shows, for every plan, a PPIC tag (Not submitted yet, Awaiting review, Sent back, Approved) and an HSSE tag. The HSSE tag reads "After conversion" until the plan is converted, then shows the project's readiness form status. The same two tags show under the title on the plan's page.

**Where plans do not appear:** dashboard, alerts, exports and the work order pages read only the live tables.

### 6.2 Projects

**Purpose.** A project groups the work orders of one docking event of one vessel.

**Menu.** Operations, Projects (`/projects`).

**Projects list.**
- Columns: Project, Vessel (with company), Planned dates, Work orders (count), Checked by.
- Planned dates come from the original (non-additional) work orders' work details only.
- **Checked by** shows two tags:
  - **PPIC:** "Plan approved" if the project came from an approved docking plan, otherwise "Not required".
  - **HSSE:** the readiness form status: No form yet, Form in draft, Awaiting review, Needs clarification or Approved.
- Search by project name, vessel or company. Chips filter by readiness status with counts. 20 projects per page, newest first. Clicking a row opens the project.

**Create a project** (New project). Choose the vessel, the docking type, and confirm the name. All three are required. The name fills in by itself until you type your own. The screen says the vessel cannot be changed once created, but Rename can move it **[Known gap]**. A project can also be created while adding a work order ("New Project" link), using that work order's work type as docking type.

**Project name format.** `COMPANY-VESSEL NAME-DOCKING TYPE-YYYY-##`, for example `BAROKAH GEMILANG PERKASA-MT M PATRICIA-Repair-2026-01`. YYYY is the current year and ## is that vessel's number of projects created that year, two digits. Nothing forces a typed name to follow it.

**Project details page.**
- Header: name, vessel, docking type, the PPIC and HSSE tags, and the buttons Rename project, Assign existing work order, Add work order (hidden for MANAGER, HSSE, SHIPPING).
- Project timeline: from the original work orders. Additional work orders do not move it, but a warning shows if one runs past the project's finish.
- Vessel readiness form: status and a button to start or open it.
- Work orders table: WO number (link), date, type (Original or Additional), deadline (flagged "Beyond project deadline"), progress, Edit and Remove. **Remove only un-assigns the work order from the project.** The work order and its data stay.

**Rename.** Pick a vessel and docking type. The new name is built from them and keeps the project's year and sequence. A duplicate name is blocked. Picking a different vessel moves the whole project (work orders, readiness form, additional-WO requests) and gives it a new sequence for that vessel. This is not possible once any of its work details are in a BASTP.

**Assign existing work order.** Lists work orders of the same vessel that have no project. Once assigned, no other project can take them.

### 6.3 Vessel Readiness Form and Readiness Queue

**Purpose.** Confirm the vessel is safe to enter the shipyard before the original work order is created. Form FM-OPS-04-11, shown as "WO Shipyard".

**Who.**
- Fill, save as draft, submit, resubmit: PPIC, MASTER, ADMIN_SHIPPING, and SHIPPING (only for projects converted from its plans).
- Review and sign off: HSSE and MASTER. HSSE is the only sign-off role.
- MANAGER cannot change anything. Other roles who reach the page see it read-only.

**Form.**
- Vessel information: docking or berthing date, owner.
- Eleven Ya/Tidak checklist items in four sections (Indonesian text): gas condition before arrival (4), liquid, cargo and oil tanks (3), vessel status verification (2), fuel and lube tanks (2). Choosing "Tidak" opens a box to explain.
- Additional information: free text about the last cargo, and the gas test upload.
- HSSE sign-off.

**Statuses.** Draft, Awaiting HSSE review, Needs clarification, Approved. The form is turn-based: the filler edits in Draft and Needs clarification, and HSSE reviews in Awaiting HSSE review.

**Steps.**
1. Fill the header and answer every item. Submit. If not every item is answered it stays Draft.
2. HSSE approves or rejects each item. A rejected item needs a note and its answer flips to "Tidak".
3. If any item is rejected the form goes back as Needs clarification. The filler coordinates with the vessel owner, updates, and resubmits. Every item returns to Pending and HSSE reviews the whole list again.
4. If all items are approved, HSSE enters a name and a date (not in the future) and presses **Approve & Sign Off**. The form becomes Approved.

**Gas test document (form FR-02-01).** Available after the form is first saved. PDF, JPG or PNG, up to 10 MB. Uploading replaces the old file. It is not required to submit or approve, but the queue flags it as missing. The filler can upload while the form is editable, HSSE and MASTER at any time.

**The gate.** An original work order cannot be created until its project's readiness form is Approved. The app checks this again when saving. Additional work orders are exempt.

**Readiness Queue** (`/readiness-queue`; MASTER, HSSE, MANAGER). Lists every form, most recently updated first. Filters: Awaiting your review (default), With vessel owner, Approved, All. Cards show the project, status, vessel, and how long ago it was submitted. A badge flags a missing gas test result.

### 6.4 Work Orders

**Menu.** Operations, Work Orders (`/work-orders`, "Work Order Dashboard"). It has stat cards, a toggle between "By Vessel" and "By Work Order Number", and filters. Each vessel opens an expandable list of its work orders and work details.

**Create a work order** (`/add-work-order`).
1. Choose the **Project** (required), or create one inline.
2. Choose the **Shipyard WO Date** (required). The **Shipyard WO Number** fills in and is locked. See [7](#7-numbering-and-naming-rules).
3. Choose the **Kapro** (required).
4. Optional: work type, work location (Pulau Atas, Pendingin, or Other), customer WO number and date.
5. **Create Work Order.** You return to the project.

**Original and additional.**
- An **original** work order needs the project's readiness form Approved.
- The **Additional Work Order** box stays disabled until the project already has an original work order. See [6.5](#65-additional-work-orders).

**Edit** (`/edit-work-order/:id`). Required: vessel, WO number, WO date, Kapro. Read-only roles see "View Work Order" with no save. The edit form's own "additional" box does not run the approval check **[Known gap]**.

**Docking Planning panel (in Edit).** A schedule estimate of docking stages from the General Services list. Tick a stage and set both start and close dates. Total days = close minus start plus 1. Saving replaces all earlier entries. Everyone who can see the work order can view it. MASTER, PPIC and ADMIN_SHIPPING can edit it.

**Delete.** From the vessel's work order list, with a confirm that shows how many work details go too. It is a soft delete and also soft-deletes the work details.

**Print.** Each work order prints or downloads as PDF: "Work Order" (Perintah Kerja) or "Kick Off Meeting". Choose which work details to include (All, Original only, Additional only, Custom). A hand-typed "No." is saved on the work order, except when a MANAGER prints.

**Progress shown.** A work order's progress is the average of the latest progress of its non-cancelled work details. It counts as completed only when it has at least one active work detail and every active one is at 100%.

### 6.5 Additional Work Orders

An additional work order is extra scope added after the original. It needs one of two things.

1. **Operation Head approval.** On the Add Work Order form, tick "Additional Work Order", write a reason, and press **Request Operation Head approval**. Wait for the Operation Head to decide. Once approved, a green message appears and you can create the work order. If rejected, the notes are shown.
2. **Chairman Directive.** Tick it and write the explanation. The request is saved as approved at once and nobody reviews it. It is tagged "Chairman Directive" for monitoring.

Each approval backs exactly one work order.

**Additional WO Approvals** (`/additional-wo-approvals`; MASTER, SHIPPING, MANAGER view). Filters: Pending (default), Approved, Rejected, All. A decider opens **Review**, writes notes (required to reject), then Approve or Reject. MASTER and SHIPPING decide. MANAGER views only.

### 6.6 Work Details

**Menu.** Operations, Work Details (`/work-details`, "Work Order Details"). A paged, searchable, sortable table with filters for vessel, project, work order, work scope, location and additional yes/no. Rows expand for full information.

**Add** (PPIC, MASTER, ADMIN_SHIPPING).
1. Choose the work order (search by WO number, customer WO number or vessel).
2. Fill one or more rows. Required per row: description, location, work scope, quantity (above 0), UOM (Ls, Unit, Pcs, Lbr), planned start date, target close date (not before the start), period close target (a month, January to December, suggested from the target close date).
3. Optional: price in IDR (PPIC and MASTER only), "Is Additional Work Order Details".
4. ADMIN_SHIPPING may leave the three date fields empty. PPIC completes them later in Edit.

**Edit.**
- **PPIC:** description, location, scope, quantity, UOM, additional flag, planned start, target close, period close target, price.
- **PRODUCTION:** PIC, SPK number, SPKK number, work permit file, PTW number, notes, actual start, actual close (not before the actual start).
- **MASTER:** both sets.
- MANAGER, HSSE and SHIPPING are redirected away.

**Cancel** (PPIC, PRODUCTION, MASTER, with optional reason). A cancelled work detail leaves the progress average and verification and cannot get new progress. It can still go into a BASTP at zero price, for the record. **Uncancel** restores it.

**Delete.** A soft delete, with a confirm.

**Badges.** Needs Rework (sent back and no newer progress), Additional Work, Cancelled.

### 6.7 Work Progress

**Menu.** Operations, Work Progress (`/work-progress`). Every progress report is a row. Filters: vessel, project, work order, work type, location, Kapro, additional, and text search.

**Add** (PRODUCTION, MASTER).
1. Choose the work order, then the work detail. Work details already at 100% are hidden unless sent back for rework.
2. Enter the **percentage** (0 to 100, comma decimals) and the **report date** (defaults to today).
3. Optional: notes, and an evidence photo (JPEG, PNG, GIF or WebP, up to 10 MB).

**Rules.**
- Current progress is the latest report by report date.
- A new report cannot be lower than the current progress, and none can be added once a work detail is at 100%.
- Exception: after a work detail is sent back for rework, the first new report may start lower. It goes back to review when it reaches 100% again.
- Cancelled work details cannot get progress.
- Editing a report can change percentage, date, notes and evidence, and does not apply the "no lower" floor.
- There is no delete for progress reports.

### 6.8 Work Verification

**Purpose.** The Operation Head duty, now done by Shipping: the review of work details that reached 100%, before they go into a BASTP. Menu Approvals & Review, Work Verification (`/work-verification`).

**Tabs.**
- **Pending Review:** at 100%, not approved, not open for rework, not yet in a BASTP.
- **Pending Review with BASTP:** the same, already linked to a BASTP, grouped by BASTP.
- **Needs Rework:** sent back and no newer progress yet.
- **Verified:** the latest review is approved. Auto-approved items say "Auto-approved (2-day deadline)".

**Review steps** (MASTER, SHIPPING).
1. Open the item and read its history.
2. Set the review date (not in the future).
3. Add notes (up to 500 characters). Notes are optional to approve and required to send back.
4. Press **Approve** or **Send Back for Rework**.

A sent-back item waits for a new progress report, then returns to Pending Review. Each review is kept in the history.

**Auto-approval.** An unreviewed 100% item is approved automatically 2 days after its latest progress report was created. This runs in the browser only when someone allowed to review has the queue open. There is no background job. **[To confirm]** whether this is acceptable.

### 6.9 BASTP

**Menu.** Finance & Documents, BASTP (`/bastp`, "BASTP Management").

**List.** Two tabs: BASTP Records (counters, search, status filter, a "Form Penawaran missing" badge) and Completed Work Details (All, Not in BASTP, In BASTP, with Excel export).

**Create** (MASTER, PPIC, PRODUCTION, ADMIN).
1. Pick the BASTP date first. The number fills in and is locked.
2. Pick the vessel (required). It locks once work details are added.
3. Optional handover details, printed on the BASTP: recipient name and role, Tanggal Sandar, Tanggal Naik Docking, Tanggal Turun Docking, Tanggal Tambat Setelah Turun Dock.
4. Optional general services (below).
5. Add work details. Only those at 100% (or cancelled) are offered, and none already in another BASTP.
6. Save. A BASTP needs at least one work detail, unless it has fresh water only.

**General services.** Grouped like the docking quotation: Docking, Docking Report/SN, Electrical, Security, Toilet, Trash, Facilities, Work-equipment assistance, Other.
- Day services need a start and close date. Total days = close minus start plus 1.
- Ton services (Fresh Water Supply) need one or more deliveries, each with a date and a quantity above 0.
- Kali and Ls services need a quantity above 0 only.
- Prices start at 0 and are set on the invoice.
- A BASTP with only fresh-water services and no work details is allowed.

**Statuses.** They are set automatically when someone other than MANAGER opens the list.

| Status | When |
|---|---|
| DRAFT | Just created |
| VERIFIED | Every non-cancelled work detail has an approved latest verification |
| READY_FOR_INVOICE | Every non-cancelled work detail has materials submitted, and the Form Penawaran PDF is uploaded |
| INVOICED | An invoice exists |

A fresh-water-only BASTP becomes Verified at once and Ready for Invoice when the Form Penawaran is uploaded. Changing the work details of a BASTP resets it to DRAFT. Editing replaces its general services each time.

**Details page.** Print (A4 preview, download PDF), Export Excel, Edit, Material Control, and the Form Penawaran section (PDF, up to 10 MB). Edit, materials and upload only work while the status is DRAFT or VERIFIED. After that the page shows "Locked".

**Printed BASTP.** Dated "Samarinda". The three signature blocks are for handwritten signing:
- Di Serahkan Oleh: Marketing & PPIC Department Head (name hard-coded in the print template).
- Di Terima Oleh: the recipient name from the form, shown as "-" when blank, captioned Owner Surveyor.
- Di Saksikan Oleh: General Manager (name hard-coded).

**Material Control** (`/bastp/:id/materials`). For each work detail: add, edit or delete materials, using the material's calculation mode (Area, Dimensional, Circular, Count, Pipe Length, Repair, Pembubutan), then **Submit Materials**. Submitting with no materials asks you to confirm "needs no materials". A submitted work detail changes only through **Reopen for Editing**.

There is no BASTP delete in the screen.

### 6.10 Invoices

**Menu.** Finance & Documents, Invoices (`/invoices`, "Invoice Management"). Counters: Total, Paid, Unpaid, Ready for Invoice. Tabs: Ready for Invoice (hidden for MANAGER), Unpaid, Paid. Export Excel covers all invoices and the BASTPs still awaiting one.

**Create** (MASTER, FINANCE).
1. The BASTP must be READY_FOR_INVOICE and not yet invoiced. Press **Create Invoice** on its row.
2. The invoice date defaults to today. The invoice number fills in and is locked.
3. Fill the BASTP collection date, company, faktur number, due date, delivery date, collection date by customer, receiver name, remarks.
4. Enter the **unit price** for each work detail and general service. Line amount = unit price x quantity. At least one price above 0 is required.
5. Tick **Apply PPN (11%)** if tax applies.
6. Optionally tick **Mark as Paid** and give the payment date.

**Calculation.**
- Subtotal = sum of all lines.
- PPN = 11% of the subtotal, rounded, only when ticked.
- PPh 23 = 2% of the subtotal, rounded, always applied.
- **Total = Subtotal + PPN - PPh 23.**

**Status.** Only Paid or Unpaid. Saving sets the BASTP to INVOICED.

**Rules.**
- Once an invoice is Paid, pricing is locked. Untick "Mark as Paid" to unlock it.
- In edit mode the number is editable. Changing the invoice date within the same year changes only the Roman month. A new year gives the next free number. A hand-typed non-standard number is never auto-changed. A duplicate number is rejected. A blank number prints as "Draft Invoice".
- Delete is a soft delete with a stronger warning if paid. It returns the BASTP to READY_FOR_INVOICE and resets the priced service amounts.
- MANAGER cannot change anything.

### 6.11 Dashboard and Alerts

**Dashboard** (`/`; every role).
- **Header strip:** Projects, In progress, Completed. A project is completed only when all its work orders are.
- **Needs attention** (never filtered): Overdue work details, Ready to invoice, Invoiced but not paid (value and count).
- **Filter:** Vessel and Month. It filters only Work orders, Work details and Work to payment.
- **Work orders:** In progress and Completed by Docking, Repair and New Building, plus an Original vs Additional bar. A work order is completed when all its non-cancelled work details are 100%.
- **Work details:** Completed (100%), In progress (1 to 99), No progress (0). Deadline performance: On time or early, Missed.
- **Work to payment:** Not made into a BASTP yet, In a BASTP awaiting verification, Ready for invoice, Invoiced unpaid, Invoiced paid, with paid and unpaid values in Rupiah. A VERIFIED BASTP has no segment of its own **[Known gap]**.
- **Vessels:** cards or table with search, an alerts filter, sorting, and per-vessel progress and tags.
- A missed deadline is an incomplete item past its target close date, or a completed item judged by its actual close date (or last report date) against the target. Cancelled work details are excluded everywhere.

**Alerts** (`/alerts`). Two lists, 10 per page: **Overdue** (high priority: "Overdue by N days", or "Completed past its planned close date") and **Ready to invoice** (medium).

### 6.12 Export Data

Menu Data Tools, Export Data (`/export-data`).

1. Search and tick vessels. If none are ticked, all vessels are exported.
2. Press **Export Full/Operational Data**.
3. You get one CSV, readable in Excel. There is no Excel or PDF output. The name looks like `vessel_data_<vessel>_<timestamp>.csv`.

Content: one row per progress report with its vessel, project, work order, work detail, latest verification, BASTP and invoice. Work details with no progress and work orders with no work details are included. Invoice prices, PPN, PPh 23 and totals appear only for MASTER, FINANCE and MANAGER. The PPIC price appears only for MASTER and PPIC. With nothing to export, the page says so.

### 6.13 Import Data

Menu Data Tools, Import Data (`/import-data`). PPIC, MASTER and ADMIN_SHIPPING can import. MANAGER sees a view-only notice. PRODUCTION, SHIPPING and ADMIN see the menu item but get a message that they cannot import **[Known gap]**.

**Tabs:** Work Orders, Work Details, Work Progress (PPIC and MASTER only). Files: `.csv`, `.xlsx`, `.xls`.

**Steps.**
1. Download a template. The combined Excel template covers Work Orders and Work Details and has dropdowns and an Instructions sheet. Do not change row 1.
2. Fill it and upload.
3. Read the preview (total, valid, invalid). Invalid rows are skipped and valid rows still import. The import button is off when no row is valid.
4. Press **Import N ...**. Imports are written to the Activity Log.
5. A combined file fills both the Work Orders and Work Details tabs. Import each in its own tab.

**Work order rows.** Required: vessel (must exist), shipyard WO number (unique per vessel inside the file), shipyard WO date. Optional: customer WO number and date, additional yes/no, Kapro, work location, work type. Duplicates against existing data are not checked in the preview **[To confirm]**.

**Work detail rows.** Required: vessel, work order number (existing, or in the same file), description, location, work scope, quantity above 0, UOM, planned start, target close, period close target. Dates are YYYY-MM-DD. Optional initial progress: percentage and report date, both or neither, applied once when the item is created.

**Work progress rows.** Match a work item by vessel, WO number and description. Needs percentage and report date. Each work item keeps one imported progress row, and a re-upload updates it. A row older than the stored one is skipped. Manually entered progress is never changed.

Docking plans have their own Excel import, described in [6.1](#61-docking-plans-shipping-planning).

### 6.14 Master Data

Menu Administration, Master Data (`/master-data`; MASTER, PPIC change, MANAGER views). Tabs: Vessels, Locations, Work Scopes.

- **Vessels:** name (required, no active duplicate), type, company, fleet, fleet number. A vessel with no fleet number counts as outside the company fleet.
- **Locations and Work Scopes:** one required text value, unique among active entries.
- **Remove** is a soft delete, with a confirm. The entry becomes Inactive and can be restored with **Restore**. Existing work details keep it. It only disappears from the pickers for new entries.
- Filter Active only (default), Inactive only, All. Search and pagination.

### 6.15 User Management

Menu Administration, User Management (`/user-management`; MASTER changes, MANAGER views).

- Table: name, email, company, role (a dropdown), status, actions. Search, role filter, Active/Inactive/All.
- **Change role:** pick a role and confirm. It is applied by a server function and logged.
- **Deactivate or Reactivate:** a deactivated user loses access until reactivated and keeps the previous role when reactivated. Both are logged.
- You cannot deactivate yourself, and a MASTER cannot change their own role away from MASTER.
- There is no "create user" screen here **[To confirm]** how accounts are created.
- To let a Shipping team member plan dockings, set the role to **SHIPPING**.

### 6.16 Activity Logs

Menu Administration, Activity Logs (`/activity-logs`, "Log Aktivitas User", mostly Indonesian). Everyone can open it. MASTER and MANAGER see all users. Others see a narrower scope set by the database **[To confirm]** whether that is "only their own" or "users with the same role".

- **Records:** every create, update and delete with user, table, record, old and new values, description, IP address (best effort) and browser. Covered areas include work orders, work details, progress, verification, materials, BASTP, invoices, user profiles, projects, additional WO requests, readiness forms, docking plans and their lines, and API key creation and revocation.
- **Period:** 7 hari, 14 hari, 30 hari, Bulan Ini (default), arrows to move, or a custom Dari and Sampai range with **Terapkan**.
- **Tabs:** Dashboard (Total Aksi, User Aktif, User Tanpa Aksi, Dokumen Disentuh, Rata-rata Aksi/Hari, and a daily chart), Per User, Rincian (search, action and table filters).
- User Aktif and User Tanpa Aksi count staff in the roles PPIC, PRODUCTION, FINANCE, HSSE, ADMIN_SHIPPING and SHIPPING. They show for MASTER and MANAGER only.
- Logs are written by the app, so only actions made through the app appear.

### 6.17 API Documentation (Developer)

Menu Developer, API Documentation (`/developer/api`; MASTER only). Documents the read-only **Shipyard Report API** (JSON).

- **Create an access key:** name (up to 80 characters), duration (7, 30, 90 days, or Permanent, which never expires and must be revoked by hand), and which tables it may read (all, or a chosen list).
- The token is shown **once**. If lost, create a new key and revoke the old one. Keys that expire start with `srt_`.
- **Manage keys:** see Active, Expired or Revoked, revoke, or change the tables.
- `profiles` and `activity_logs` are sensitive tables. "All tables" includes them.
- Read options: `limit` (1 to 5000, default 1000), `offset`, `updated_since`, `include_deleted`.
- Tabs: Overview, Access keys, Manage keys, Integration guide, Table reference, Help. A Postman collection is provided.
- Key creation and revocation are logged.

---

## 7. Numbering and naming rules

| Item | Format | How the sequence works |
|---|---|---|
| Work order number | `####/WO-PPIC/GAL-PL/<Roman month>/<YYYY>` | One more than the highest number used that year, four digits. Shared by original and additional work orders, ignores deleted ones, not per vessel. Month and year come from the shipyard WO date, not today. Locked on create, editable later in Edit Work Order. |
| BASTP number | `####/HR-PPIC/<Roman month>/<YYYY>` | Same method. Month and year from the BASTP date. Locked on create, editable on edit. |
| Invoice number | `####/GAL-SMD/<Roman month>/<YYYY>` | Same method. See [6.10](#610-invoices) for what happens when the date changes. |
| Project name | `COMPANY-VESSEL NAME-DOCKING TYPE-YYYY-##` | ## counts that vessel's projects created in the current year, two digits. The tail is kept on rename. |
| Docking plan name | `Vessel - docking type - Mon YYYY` | Suggested only. Can be changed. |

Dates typed or imported are always `YYYY-MM-DD`.

---

## 8. Rules that apply everywhere

- **Deleting is soft.** Work orders, work details, invoices, master data and plans are marked deleted, not erased. Deleting a work order also deletes its work details.
- **Cancelled work details** are excluded from progress averages, verification and dashboard counts, and can be added to a BASTP at zero price.
- **Progress** never goes down, and cannot be added at 100%, except after a rework request.
- **Original work orders** need an approved readiness form. **Additional work orders** need Operation Head approval or a Chairman Directive.
- **BASTP and invoice locks:** a BASTP locks at Ready for Invoice. A paid invoice locks its prices.
- **Read-only roles** (MANAGER everywhere, HSSE and SHIPPING on operations, FINANCE and SHIPPING on BASTP) see the pages without any change buttons.
- **Everything is logged** in the Activity Log.
- **The browser matters.** Auto-approval of unreviewed work and the automatic BASTP statuses run in the browser when an allowed user opens the page. They are not background jobs.

---

## 9. Frequently asked questions (draft)

- **I cannot see a menu item.** Your role does not include it. Ask a MASTER user if you think it should.
- **I cannot create the original work order.** The project's readiness form is not approved yet. Open the project and check the HSSE tag.
- **The additional work order box is greyed out.** The project has no original work order yet.
- **I cannot add progress.** The work detail is already at 100%, cancelled, or you are not PRODUCTION or MASTER.
- **My progress was refused.** It is lower than the current progress. Edit the existing report instead.
- **Why did a work detail become Verified by itself?** Nobody reviewed it within 2 days of reaching 100%.
- **I cannot edit a BASTP.** It is Ready for Invoice or Invoiced and therefore locked.
- **I cannot change the invoice prices.** The invoice is marked Paid. Untick it first.
- **I cannot edit a docking plan.** It is Awaiting review, Approved or Converted, or it is another Shipping user's plan. Only Draft and Sent back plans can be edited.
- **A converted plan has no PPIC or HSSE tick.** Check the Projects list: PPIC shows Plan approved, and HSSE shows the readiness form status.

---

## 10. Where things live (for maintainers)

| Topic | Place |
|---|---|
| Role lists per feature | `src/hooks/useAuth.tsx` (`FEATURE_ACCESS`, role flags) |
| Menu and groups | `src/components/common/Layout.tsx` |
| Routes | `src/App.tsx` |
| Docking plans | `src/components/plans/`, `src/utils/dockingPlans.ts`, `src/utils/planImport.ts`, `supabase/migrations/20261124*` |
| Check tags on projects and plans | `src/components/projects/ApprovalTags.tsx` |
| Readiness form and gate | `src/components/readiness/`, `src/components/workOrders/AddWorkOrder.tsx` |
| Numbering | `src/utils/workOrderNumbering.ts`, `src/utils/documentNumbering.ts`, `src/utils/projectNaming.ts` |
| Import and export | `src/utils/importHandler.ts`, `src/utils/exportHandler.ts` |
| Database changes | `supabase/migrations/` (schema `daily_report_shipyard`) |
| In-app user guide (written in Indonesian) | `src/content/guide/` (topics and role paths), `src/components/guide/` (pages), menu item "Panduan Pengguna" in `Layout.tsx`, routes `/guide` and `/guide/:topicId` in `App.tsx` |
| Deploying | Push, then run the deploy command on the VPS (see the team's deployment notes) |

---

## 11. Open questions and known inconsistencies

These need a decision, or a check with the team. Remove a line once it is settled and say how in the changelog.

**Decisions for the team**

1. **Converted plans skip the readiness gate.** Conversion creates the work orders at once, even before HSSE has approved the project's readiness form. Options: convert creates only the project and work orders come after approval, or keep it and show a "readiness pending" warning on the project. The tags on the Projects list show the status, but nothing blocks work.
2. **Docking plan permissions are enforced in the screens, and in the database for plan tables only.** SHIPPING's view-only access to operations is a screen rule. The live work order and project tables are open to any signed-in user at database level. A later tightening is planned, not done.
3. **ADMIN_SHIPPING "create only" limit** is switched off in the code. Decide when to turn it back on, then update 3.2 and 6.4.
4. **Auto-approval after 2 days** runs only when an allowed user opens the verification queue.
5. **Hard-coded names and ids:** the named external verifier (user id) and the two BASTP signer names in the print template.

**Looks unintended**

6. The New Project screen says the vessel cannot be changed, but Rename can move a project to another vessel.
7. The Edit Work Order form has an "additional" box that does not run the approval check. Whether the database blocks it is unknown.
8. A VERIFIED BASTP has no segment in the dashboard "Work to payment" bar.
9. Paid and unpaid invoice values show on the dashboard to every viewer, including roles that cannot open Invoices.
10. PRODUCTION, SHIPPING and ADMIN see the Import Data menu but cannot import.
11. Import preview does not check work order numbers against existing data. Whether the database stops duplicates is unknown.
12. The readiness form does not force the header fields before submitting.

**Information missing**

13. How accounts are created, and how passwords are reset.
14. Whether deactivating a user ends an already-open session at once.
15. Exactly which logs a non-MASTER user sees in the Activity Log (own only, or same role).
16. Whether ADMIN and ADMIN_SHIPPING saves on work details are limited at database level.

---

## 12. Plan for the user guideline

This source file is detailed on purpose. The guideline people read should be shorter and aimed at one reader at a time.

**Suggested parts.**

1. **Quick start for everyone:** sign in, the menu, alerts, who to ask for access.
2. **One short guide per role,** each with only that role's daily tasks:
   - SHIPPING: making a docking plan, importing, answering PPIC's notes, the readiness form, verification and additional work order approvals.
   - PPIC: reviewing and converting plans, planning work details, BASTP.
   - HSSE: readiness queue and sign-off.
   - PRODUCTION: execution fields and progress.
   - FINANCE: invoices.
   - MANAGER: where to look (read-only).
   - MASTER and ADMIN: administration and master data.
3. **Process guides:** from plan to invoice, additional work orders, importing data.
4. **Reference:** numbering rules, statuses, FAQ.

**Before writing it,** settle section 11 items 1 to 5, add screenshots from a test project (the two test docking plans can serve), and ask each role's owner to check their guide.

**Format:** a page inside the app, built on 24 November 2026 (menu item Panduan Pengguna, under Bantuan, written in Indonesian). It has a path per role, a search box, and a step-by-step topic for each task. A PDF handbook is still possible later. Whatever is chosen, this file stays the source.

---

## 13. Changelog

| Date | Change | Sections |
|---|---|---|
| 2026-11-25 | Docking Plans list: added a "Checked by" column next to Status with PPIC and HSSE tags for every plan; the same tags show on the plan page. | 6.1 |
| 2026-11-24 | The in-app guide is written in Indonesian; the menu item is now "Panduan Pengguna" under "Bantuan". This file stays in English. | 1, 4.2, 10, 12 |
| 2026-11-25 | Guide screenshots retaken as a Shipping account (menu, plans, import, Work Verification, Additional WO Approvals) and added the sign-in page, converted plan and readiness form pictures; added a screenshots section to the maintenance rules. | 1 |
| 2026-11-25 | OP_HEAD role retired: its users are SHIPPING, and SHIPPING now has everything OP_HEAD had (Dashboard, alerts, Work Verification, Additional WO Approvals, view access to operations and BASTP, Export Data) on top of Docking Plans. SHIPPING is no longer limited to the plan pages. The guide has no Operation Head path any more; its topics moved to the Shipping path. | 3, 4, 5, 6.1, 6.3, 6.5, 6.8, 6.11, 12 |
| 2026-11-24 | In-app User Guide added (menu Help, User Guide; `/guide`): 26 step-by-step topics from this file, a start-here path for each of the 10 roles, search. Open to every role, including Shipping. | 1, 4.2, 10, 12 |
| 2026-11-24 | First version, compiled from the code at commit `56eb1ff`. Covers every module. Docking plans: Shipping drafts plans, all roles view them, only MASTER and SHIPPING change them, PPIC alone approves, HSSE's approval stays on the readiness form, Shipping can fill the readiness form of plan projects, Excel import for plans, and PPIC and HSSE check tags on projects and converted plans. | All |
