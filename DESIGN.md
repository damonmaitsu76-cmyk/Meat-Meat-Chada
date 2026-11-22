Product: QR refill requests and reservations for a Korean BBQ restaurant, used by guests on phones mid-meal and by staff on phones or tablets mid-service.
Character: fast, sturdy, warm.
World: charcoal grill, kitchen order tickets, enamel, a paper menu. Near-black charcoal is structure, chili red is the only accent, warm paper is the ground.
Moments: the guest's request ticket, which shows where their order is; the staff floor map, where table state reads in one glance.
Signature: the order-ticket motif. Request numbers and reservation IDs use small tabular monospace tickets wherever they appear, and the Live dot stays as the only live indicator.

# Design contract

## Direction

Use quiet charcoal and paper surfaces to make the restaurant's working information easy to scan. Reserve chili red for a primary action, the active navigation marker, or one number that needs attention. Use the request ticket and floor map as the memorable details. The body type is Figtree Variable; display type is Bricolage Grotesque Variable. Copy is short, specific, and sentence case.

## Tokens and layout

Keep color, spacing, type, radius, and motion values in `src/styles/tokens.css`. Spacing follows a 4px grid. Hairlines are decorative only; controls use the stronger control token. Text and non-text contrast are checked from the final token pairs. Avoid shadows except on dialogs and sheets.

## Component rules

Use the shared Button, Field, StatusChip, Notice, RecordCard, ResponsiveRecords, FilterTabs, Disclosure, Stepper, Switch, EmptyState, and PageToolbar primitives. Give each screen one primary action. A normal state is represented by absence; visible status text accompanies every exception. Phone layouts use purposeful records; dense comparison may use a real table on wide screens. Keep touch actions at least 44px high.

## Copy rules

Use sentence case and concrete action labels. Short labels have no terminal period. Help text uses complete sentences. Loading text names what is loading. Empty and error messages say what is missing or happened and what to do next. Never alter stored names to improve display casing.

## Do not

Do not change Supabase schema, RLS, RPC names, route paths, authentication logic, realtime channel logic, import rules, QR URLs, print behavior, or product names. Do not add runtime dependencies, fonts, icon packs, invented data, gradients, blur, glows, colored shadows, emoji, looping motion, `transition: all`, hover lift, or decoration without a product purpose.

## Recon audit

1. `src/styles/staff.css` and staff list pages: `.q-table` turns cells into label/value stacks below 720px; use purposeful record cards on phones and real tables only where comparison helps.
2. `src/styles/tokens.css`, `src/styles/shared.css`, `src/styles/global.css`, `src/pages/staff/Dashboard.css`: red is used for actions, declined status, dining state, and active navigation; reserve it for the action/attention uses and move statuses to neutral, warning, ink, or success.
3. `src/pages/staff/Dashboard.jsx`, `src/pages/staff/TableManagement.jsx`, `src/pages/customer/QRMenu.jsx`: Available is visibly repeated in tiles, rows, and menu dishes; show normal state by absence and keep its accessible text.
4. `src/pages/staff/StaffLayout.jsx`, `src/styles/staff.css`: the header can wrap to two rows on phones, the nav is a top strip, and visible page titles repeat nav labels; use a compact shell and one page title.
5. `src/pages/staff/Dashboard.jsx`, `src/pages/staff/Dashboard.css`: four equal summary cards remain; the reported 6px left stripe is already absent in the current CSS.
6. `src/pages/customer/Reserve.css`, `src/pages/staff/Reservations.css`, `src/pages/staff/MenuManagement.css`, `src/pages/staff/TableManagement.css`, `src/pages/staff/Reports.css`, `src/pages/staff/StaffAccounts.css`: fields and selects are restyled in multiple places; consolidate on shared Field styles. Amber notices are separately defined in Dashboard, Reservations, and Table Management; replace them with Notice.
7. All CSS files except `src/styles/tokens.css`: raw color literals appear outside tokens; migrate them to semantic tokens.
8. `src/styles/global.css`, `src/pages/staff/StaffAccounts.css`, `src/pages/staff/TableManagement.css`: disabled and removed text is faded with opacity, and input/off-switch borders use weak decorative lines; use explicit accessible colors and the control border token.
9. `src/pages/staff/RequestQueue.jsx`, `src/pages/staff/Reports.jsx`: request queries omit the schema's existing `served_at`, so served rows show their total age; report duration keeps a decimal minute value. Use served duration and whole-minute formatting.
10. `src/pages/customer/QRMenu.jsx`, `src/styles/global.css`: menu rows have repeated Add buttons without inline quantity, no sticky review action, and the tray count is hidden from the Menu tab; add steppers and a review bar using current tray state.
11. `src/pages/staff/Reports.jsx`, `src/pages/staff/Reports.css`: six equal summary cards, formula copy, repeated date range, and a label/value activity table remain; group summary hierarchy and compact activity rows.
12. `src/pages/staff/MenuManagement.jsx`, `src/pages/staff/MenuManagement.css`: each dish is a table row with a redundant Available label and equal Edit/Delete actions; use a compact dish list, inline edit, and confirmed delete.
13. `src/pages/staff/TableManagement.jsx`: Show QR code is a primary button on each row while Print all QR codes is secondary, and the status column repeats Available; reverse action priority and remove normal status.
14. `src/pages/staff/StaffAccounts.jsx`, `src/pages/staff/StaffAccounts.css`: account creation is always open with half-width fields, the policy paragraph mixes validation and account rules, and roles are inline selects; collapse the form/help and clarify row actions.
15. `src/pages/customer/Reserve.jsx`, `src/pages/customer/Reserve.css`, `src/styles/global.css`: disabled buttons fade, the outlined Reservation header resembles a logout control, and open slots are rendered as a select despite the RPC returning slot records; use clear action hierarchy and selectable time buttons.
16. `src/pages/staff/Reservations.jsx`, `src/pages/staff/Dashboard.jsx`: guest name casing is displayed exactly as stored, and no CSS applies all-caps to names; use a display-only title-case helper only for entirely uppercase input.
