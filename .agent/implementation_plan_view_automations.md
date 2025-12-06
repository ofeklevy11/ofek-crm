# Implementation Plan - View-Based Automations

This feature allows users to create automations triggered by metrics from Manual Views (Analytics Views).

## Files Modified

1. `components/analytics/ViewAutomationModal.tsx`: New component to configure view automations.
2. `app/analytics/page.tsx`: Added "Add Automation" button to `AnalyticsCard` and integrated the modal.
3. `app/actions/analytics.ts`: Refactored to export `calculateViewStats` for reuse.
4. `app/actions/automations.ts`: Added `processViewAutomations` to check view triggers on record updates.

## How it works

1. **User Action**: Click the "Zap" icon on a manual View card in `/analytics`.
2. **Configuration**:
   - Select metric (e.g., Conversion Rate, Count).
   - Select operator (Less Than / Greater Than).
   - Set threshold value.
   - Select Trigger Type: `VIEW_METRIC_THRESHOLD`.
   - Select Action: `SEND_NOTIFICATION` or `CREATE_TASK`.
3. **Trigger Execution**:
   - Whenever a record is updated, created, or task status changes, `processViewAutomations` is called.
   - It finds active rules related to the changed table/context.
   - It calculates the _current_ metric for the view using `calculateViewStats`.
   - It compares the metric against the threshold.
   - If condition met, it executes the action.

## Supported Actions

- **Send Notification**: Sends an internal system notification to a user.
- **Create Task**: Creates a new task in the system (e.g., "Investigate Drop in Conversion").
