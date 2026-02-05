# Shipyard Daily Report System

A comprehensive web application for managing shipyard operations, built with React, TypeScript, and Vite. This system helps track work orders, progress, verifications, and materials with complete activity logging for accountability.

## Key Features

- **Work Order Management** - Create and track work orders for vessels
- **Work Details Tracking** - Detailed breakdown of tasks and assignments
- **Progress Monitoring** - Real-time progress updates with photo evidence
- **Work Verification** - Quality control and verification workflows
- **BASTP Management** - Document and invoice preparation
- **Material Control** - Track materials used in projects
- **Activity Logging** - Complete audit trail of all system activities

---

## Activity Logging System

One of the most powerful features of this system is the **Activity Log** - think of it as your system's memory or a detailed history book that remembers everything that happens.

### Why Do We Need This?

Imagine you're managing a busy shipyard. You need to know:

- Who added that new work order last week?
- When was the material list updated?
- Who verified the pipe installation yesterday?
- What changes were made to the invoice?

Without proper tracking, these questions become impossible to answer. That's where our Activity Log comes in!

### What Gets Logged?

**Everything important!** Here's what we track:

#### 1. Work Orders

- When someone creates a new work order
- Any updates to existing work orders
- If a work order gets deleted (along with all its related work details)

_Example: "John Doe created new Work Order WO-2024-001 for Vessel MV Liberty"_

#### 2. Work Details

- Adding new work tasks
- Updating task information (descriptions, dates, locations, etc.)
- Removing work details

_Example: "Jane Smith updated Work Details: Changed target date for Pipe Installation"_

#### 3. Work Progress

- Progress reports with percentage completion
- Updates to existing progress entries
- Photo evidence uploads

_Example: "Mike Johnson created work progress report (75%) for Hull Painting"_

#### 4. Work Verification

- When supervisors verify completed work
- Verification notes and dates

_Example: "Sarah Lee verified work details: Valve Replacement - Quality approved"_

#### 5. Material Control

- Adding materials to projects
- Updating material quantities or specifications
- Removing materials from the list

_Example: "Tom Brown added material control: 20x Steel Pipes (6 inch) for Deck Repair"_

#### 6. BASTP Documents

- Creating new BASTP records
- Updating BASTP information
- Linking work details to BASTP

_Example: "Admin updated BASTP-2024-005: Added 3 work details"_

#### 7. Invoices

- Creating invoices from BASTP
- Updating invoice details (prices, dates, payment info)
- Deleting or canceling invoices

_Example: "Finance Team created invoice INV-2024-123 for BASTP-2024-005"_

### What Information Is Captured?

For every single action, we record:

- **Who did it** - User's full name and email
- **When it happened** - Exact date and time
- **What they did** - Clear description in plain English
- **What changed** - Before and after values for updates
- **Technical details** - IP address and browser info (for security)
- **Where in the system** - Which module/table was affected

### How to Use the Activity Log

#### Accessing the Logs

1. Click on **"Activity Logs"** in the sidebar menu
2. You'll see a chronological list of all activities (newest first)

#### Filtering Your View

The Activity Log has powerful filters to help you find exactly what you're looking for:

**By Action Type:**

- **Create** - See all new items added to the system
- **Update** - Track what got modified
- **Delete** - Review what was removed

**By Module:**

- Work Order
- Work Details
- Work Progress
- Work Verification
- Material Control
- BASTP
- Invoice

**By Date Range:**

- Pick a start date and end date
- Perfect for monthly reviews or specific incident investigations

#### Reading Activity Descriptions

We've made the logs read like a conversation, not computer code:

**Good (What you see):**

- "John Doe created new Work Order (ID: 123)"
- "Jane Smith updated Work Details: Pipe Installation"
- "Mike Johnson deleted Invoice (ID: 456)"

**Bad (What you DON'T see):**

- "INSERT INTO work_order VALUES..."
- "UPDATE operation on table..."
- "Record #123 modified"

#### Viewing Detailed Changes

When someone updates something, you can click **"View X changes"** to see exactly what changed:

**Example:**

```
target_date:
  Old: 2024-01-15
  New: 2024-01-20

quantity:
  Old: 10
  New: 15
```

### Real-World Scenarios

#### Scenario 1: "Who Changed My Invoice?"

Your finance team notices an invoice amount is different than expected.

**Solution:**

1. Go to Activity Logs
2. Filter by "Invoice" table
3. Filter by "Update" action
4. Look for your invoice in the results
5. Click "View changes" to see exactly what was modified and by whom

#### Scenario 2: "When Did We Complete That Work?"

Your client asks when the valve installation was verified.

**Solution:**

1. Go to Activity Logs
2. Filter by "Work Verification"
3. Search by date range if you remember roughly when it was done
4. Find the verification entry with full details and timestamp

#### Scenario 3: "Audit Trail for Management"

Your manager needs a report of all activities for the month.

**Solution:**

1. Go to Activity Logs
2. Set start date to the 1st of the month
3. Set end date to the last day of the month
4. Export or review the complete list
5. Filter by specific modules if needed

#### Scenario 4: "Tracking Deleted Items"

Someone accidentally deleted a work order, and you need to know what it contained.

**Solution:**

1. Go to Activity Logs
2. Filter by "Delete" action
3. Find the deletion entry
4. View the "Old Data" to see what was deleted
5. The system also shows all associated items that were deleted (cascade deletes)

### Security & Privacy

**What's Safe:**

- User activity is logged for accountability, not surveillance
- Only authorized managers and admins can view activity logs
- Data is stored securely in the database
- No sensitive passwords or authentication tokens are logged

**IP Address & Browser Info:**

- We log these for security purposes
- Helps detect suspicious activity or unauthorized access
- Can help troubleshoot issues ("It works on my computer!")

### Tips for Best Practices

1. **Regular Reviews**: Check activity logs weekly to spot patterns or issues
2. **Training Tool**: Use logs to understand how the system is being used
3. **Quality Control**: Monitor verification activities to ensure proper procedures
4. **Dispute Resolution**: Use timestamps and user info to resolve disagreements
5. **Performance Insights**: See which modules are used most frequently

### Technical Details for Developers

The activity logging system is implemented across the following components:

- **Service**: `src/services/activityLogService.ts` - Core logging functionality
- **Component**: `src/components/activityLog/` - UI for viewing logs
- **Database**: `activity_logs` table in Supabase
- **Integration**: Automatically called after create/update/delete operations

**Tables Being Monitored:**

- work_order
- work_details
- work_progress
- work_verification
- material_control
- bastp
- invoice_details

The system uses soft deletes (setting `deleted_at` timestamp) rather than hard deletes, which means deleted data is never permanently removed - it's just hidden and logged.

---

## Getting Started

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default tseslint.config([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs["recommended-typescript"],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```
