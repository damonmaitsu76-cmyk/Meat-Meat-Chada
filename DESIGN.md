Product: QR refill requests and reservations for a Korean BBQ restaurant, used by guests on phones mid-meal and by staff on phones or tablets mid-service.
Character: fast, sturdy, warm.
World: charcoal grill, kitchen order tickets, enamel, a paper menu. Near-black charcoal is structure, chili red is the only accent, warm paper is the ground.
Moments: the guest's request ticket, which shows where their order is; the staff floor map, where table state reads in one glance.
Signature: the order-ticket motif. Request numbers and reservation IDs use small tabular monospace tickets wherever they appear, and the Live dot stays as the only live indicator.

# Design contract

## Direction

Use quiet charcoal and paper surfaces to make the restaurant's working information easy to scan. Reserve chili red for a primary action, the active navigation marker, or one number that needs attention. Use the request ticket and floor map as the memorable details. The body type is Figtree Variable; display type is Bricolage Grotesque Variable. Copy is short, specific, and sentence case.

## Tokens and layout

Keep color, spacing, type, radius, and motion values in `src/styles/tokens.css`.

- Color roles: `--charcoal` is structure, `--bg` and `--card` are paper surfaces, `--text`/`--text-2`/`--text-3` set text hierarchy, `--line` is decorative only, `--control` draws control borders, and `--brand` is the single accent. `--ok`, `--warn`, and neutral tokens carry status.
- Spacing: use the 4px scale `--s1`, `--s2`, `--s3`, `--s4`, `--s5`, `--s6`, `--s8`, `--s10`, and `--s12`. Semantic layout and print tokens preserve fixed clearances and the existing print sheet measurements.
- Type: use `--font-display` (Bricolage Grotesque Variable) for display figures and titles, `--font-body` (Figtree Variable) elsewhere, and the `--fs-meta` through `--fs-figure` scale.
- Radius: use `--r-chip`, `--r-ctrl`, `--r-card`, `--r-sheet`, and `--r-pill` by component role. Pills are reserved for dots and switches.
- Motion: use `--t-fast` for control changes and `--t-enter` for short dialog or sheet entrances. Keep reduced-motion support.

Spacing follows a 4px grid. Hairlines are decorative only; controls use the stronger control token. Text and non-text contrast are checked from the final token pairs. Avoid shadows except on dialogs and sheets.

## Component rules

Use the shared Button, Field, StatusChip, Notice, RecordCard, ResponsiveRecords, FilterTabs, Disclosure, Stepper, Switch, EmptyState, and PageToolbar primitives. Give each screen one primary action. A normal state is represented by absence; visible status text accompanies every exception. Phone layouts use purposeful records; dense comparison may use a real table on wide screens. Keep touch actions at least 44px high.

## Floor map

The staff floor is drawn like a floor plan, and service fills it in.

- An open table is a dashed outline with its chairs drawn as empty outlines and its seat count in the corner. It stays quiet so tables in use stand out.
- A table in use fills in. Dining is solid charcoal with a filled chair for each seated guest, in facing pairs. Reserved or held is warning-soft with a solid edge. Every tile is the same size in every state, so the room does not shift when guests sit.
- State is never color alone: dashed versus solid edge, filled versus empty chairs, and a visible word (Dining, Booked, Held, Reserved) with a mono stamp for the time seated or the booking time.
- Chili red appears twice: the refill flag on a tile, and the count in Needs attention. Nothing else on the floor is red.
- Needs attention is one grouped list of links. Each row says what, where and how long (tables, oldest wait, next reservation). With nothing to do, the section is absent.
- The state block slides in once when a table changes state. It never loops, and reduced motion turns it off.
- Phones show two tables per row. Wider screens fill the row with tiles of at least `--size-tile-min`.
- Tile logic (state, chair fill, attention lines) lives in `src/lib/floor.js` with tests in `floor.test.js`; `/__design` in development shows every state.

## Copy rules

Use sentence case and concrete action labels. Short labels have no terminal period. Help text uses complete sentences. Loading text names what is loading. Empty and error messages say what is missing or happened and what to do next. Never alter stored names to improve display casing.

## Do not

Do not change Supabase schema, RLS, RPC names, route paths, authentication logic, realtime channel logic, import rules, QR URLs, print behavior, or product names. Do not add runtime dependencies, fonts, icon packs, invented data, gradients, blur, glows, colored shadows, emoji, looping motion, `transition: all`, hover lift, or decoration without a product purpose.

## Recon audit

1. File: `src/styles/staff.css`, `src/pages/staff/RequestQueue.jsx`, `src/pages/staff/Reservations.jsx`, `src/pages/staff/MenuManagement.jsx`, `src/pages/staff/TableManagement.jsx`, `src/pages/staff/StaffAccounts.jsx`, `src/pages/staff/Reports.jsx`; Problem: `.q-table` turns cells into label/value stacks below 720px; Fix: use purposeful record cards on phones and real tables only where comparison helps.
2. File: `src/styles/tokens.css`, `src/styles/shared.css`, `src/styles/global.css`, `src/pages/staff/Dashboard.css`; Problem: red is used for actions, declined status, dining state, and active navigation; Fix: reserve it for action/attention uses and move statuses to neutral, warning, ink, or success.
3. File: `src/pages/staff/Dashboard.jsx`, `src/pages/staff/TableManagement.jsx`, `src/pages/customer/QRMenu.jsx`; Problem: Available repeats in tiles, rows, and menu dishes; Fix: show normal state by absence and keep its accessible text.
4. File: `src/pages/staff/StaffLayout.jsx`, `src/styles/staff.css`; Problem: the header wraps on phones, the nav is a top strip, and visible page titles repeat nav labels; Fix: use a compact shell and one page title.
5. File: `src/pages/staff/Dashboard.jsx`, `src/pages/staff/Dashboard.css`; Problem: four equal summary cards remain; the reported 6px left stripe was already absent at recon; Fix: replace the cards with the Needs attention strip and floor summary, with unstriped table tiles.
6. File: `src/pages/customer/Reserve.css`, `src/pages/staff/Reservations.css`, `src/pages/staff/MenuManagement.css`, `src/pages/staff/TableManagement.css`, `src/pages/staff/Reports.css`, `src/pages/staff/StaffAccounts.css`, `src/pages/staff/Dashboard.css`; Problem: fields and selects are restyled in multiple places, and amber notices are separately defined; Fix: use shared Field styles and the shared Notice component.
7. File: all CSS files except `src/styles/tokens.css`; Problem: raw color literals appear outside tokens; Fix: move color literals to semantic tokens.
8. File: `src/styles/global.css`, `src/pages/staff/StaffAccounts.css`, `src/pages/staff/TableManagement.css`; Problem: disabled and removed text uses opacity, and input/off-switch borders use weak decorative lines; Fix: use explicit accessible colors and the control border token.
9. File: `src/pages/staff/RequestQueue.jsx`, `src/pages/staff/Reports.jsx`; Problem: request queries omit the existing `served_at`, so served rows show total age, and report duration includes decimal minutes; Fix: show served duration and format whole minutes.
10. File: `src/pages/customer/QRMenu.jsx`, `src/styles/global.css`; Problem: menu rows repeat Add buttons without inline quantity, lack a sticky review action, and hide the tray count from the Menu tab; Fix: add steppers and a review bar using current tray state.
11. File: `src/pages/staff/Reports.jsx`, `src/pages/staff/Reports.css`; Problem: six equal summary cards, formula copy, repeated date range, and label/value activity rows; Fix: group summary hierarchy and use compact activity rows.
12. File: `src/pages/staff/MenuManagement.jsx`, `src/pages/staff/MenuManagement.css`; Problem: dish rows repeat labels and give Edit/Delete equal weight; Fix: use a compact dish list, inline editing, and confirmed delete.
13. File: `src/pages/staff/TableManagement.jsx`; Problem: Show QR code outranks Print all QR codes and the status column repeats Available; Fix: make print primary and remove normal status.
14. File: `src/pages/staff/StaffAccounts.jsx`, `src/pages/staff/StaffAccounts.css`; Problem: account creation is always open, fields are half width, policy text mixes rules, and roles are inline selects; Fix: collapse the form/help and clarify row actions.
15. File: `src/pages/customer/Reserve.jsx`, `src/pages/customer/Reserve.css`, `src/styles/global.css`; Problem: disabled buttons fade, the Reservation pill resembles logout, and returned open slots use a select; Fix: clarify action hierarchy and render selectable time buttons.
16. File: `src/pages/staff/Reservations.jsx`, `src/pages/staff/Dashboard.jsx`; Problem: guest names retain all-uppercase presentation; Fix: title-case display only when stored text is entirely uppercase.
