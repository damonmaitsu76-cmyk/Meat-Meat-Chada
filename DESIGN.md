Product: QR table requests and reservations for a Korean BBQ restaurant, used by guests on phones mid-meal and by staff on phones, tablets or a desk mid-service.
Character: fast, sturdy, warm, a little loud.
World: charcoal grill, kitchen order tickets, tear-off stubs, enamel, a paper menu, the neon and black marble of the dining room. Chili red is the ground, charcoal is the ticket, warm paper is the sheet you work on.
Moments: the guest's request ticket, which prints in and shows where their order is; the staff floor map, where table state reads in one glance; the reservation ID, which prints onto a charcoal stub.
Signature: the order ticket. Every screen is a ticket on the chili ground: a dashed perforation with a half circle cut into each end, the condensed heavy display face from the landing page, small tracked capitals for labels, and request numbers and reservation IDs in tabular monospace.

# Design contract

## Direction

The landing page is the reference, and every screen follows it. The page ground is chili red (`--brand`). Work happens on paper sheets (`--bg`, with white `--card` records on them), under a charcoal masthead (`--charcoal`). Titles, table numbers and big figures use the condensed display face (`--font-ticket`, the landing title's face). Body text is Figtree Variable. Copy is short, specific, and sentence case.

Layouts follow the job, not a template:

- Guest on a phone mid-meal (`QRMenu`, `Reserve`): one thumb. A rounded masthead with a table stamp, one paper sheet, a floating charcoal dock for Menu, Tray and Status, and a paper bar above it with the one primary action. Dishes are ticket lines with a dotted leader. A request prints as a receipt with a tear line, and its progress bar fills as staff act. The approved reservation ID prints onto a charcoal stub.
- Staff at the floor (`Dashboard`): the floor plan leads and "Needs attention" is a rail beside it on screens 1000px and wider. On a phone the rail comes first.
- Staff in the kitchen (`RequestQueue`): a rail of columns (New, Accepted, Ready), tickets stacked in each. On a phone the columns stack.
- Manager at a desk: `Reports` opens with a charcoal tape of headline figures. `TableManagement` shows each table as a table tent with its number big. `MenuManagement` is a ledger with dotted leaders. The rest are ledgers and cards on the same sheet.
- Login, Blocked and Forbidden are tickets on the ground. The sign photo, the dining-room photo and the emblem come from `src/assets`; no stock images. The emblem is on black, so it sits on charcoal with `mix-blend-mode: lighten`.

## Tokens and layout

Keep color, spacing, type, radius, and motion values in `src/styles/tokens.css`.

- Color roles: `--brand` is the ground and the action color, `--charcoal` is the masthead and ticket, `--bg` and `--card` are paper surfaces, `--text`/`--text-2`/`--text-3` set text hierarchy, `--line` is decorative only, `--control` draws control borders and perforations, and `--ink-line` and `--neutral-line` are for dividers and text on charcoal. `--ok`, `--warn`, and neutral tokens carry status. Text on chili red is `--bg` or `--white` only.
- Spacing: use the 4px scale `--s1` to `--s12`. Notches use `--size-notch`, `--size-notch-half` and `--notch-offset`.
- Type: `--font-ticket` for display (titles, table numbers, big figures, the 403 stamp), `--font-body` elsewhere, and the `--fs-meta` through `--fs-figure-lg` scale. Display type is never used below 1.15rem.
- Radius: `--r-chip`, `--r-ctrl`, `--r-card`, `--r-sheet`, and `--r-pill` by component role. Pills are reserved for dots, switches and notches.
- Shadow: only on dialogs, sheets and the floating dock (`--shadow-float`).
- Motion: `--ease-out` and `--ease-spring` for curves, `--t-fast`, `--t-enter`, `--t-press`, `--t-slow` and `--t-print` for timing, and `--stagger` between siblings.

## Style layers

`tokens.css`, `global.css`, `shared.css` and `components.css` hold structure. The ticket system loads after every other stylesheet (see `main.jsx`) and wins at equal specificity: `ticket.css` (ground, display face, notches, shared controls), `ticket-customer.css` (guest screens, login, full-page messages), `ticket-staff.css` (masthead, sheet, dashboard rail, request rail, tables, reports) and `motion.css` (every animation and transition). Page styles keep layout details. `Blocked.css` styles the blocked and forbidden pages. `public/blocked.html` and `public/blocked-plain.html` repeat the same look with inline CSS and an embedded emblem, because Cloudflare stores them and they must load nothing else.

## Motion

Motion makes state changes and arrivals feel physical. It is allowed to be big, and it is always one-shot.

- Entrances: a ticket drops in, sheets and lists rise, rows arrive one after another (`--i`, the position among siblings, times `--stagger`), tables on the floor are dealt, receipts and request tickets print from the top, and notches pop open after their ticket lands.
- State changes: a status chip stamps in, an active tab pops, a table that changes state thunks, a progress bar fills from the left, an error shakes once.
- Controls are tactile: buttons fill with ink from the left on hover and squash on press, switches widen under a finger, steppers and chips spring, chairs on a floor tile slide out on hover. Nothing lifts or glows.
- Route changes use the browser's View Transitions API through React Router's `viewTransition` links. The masthead and the dock keep their own names so they stay still while the page changes.
- Nothing loops. No infinite animation, no pulsing, no marquee. The audit script fails on `infinite`.
- Everything respects `prefers-reduced-motion`: `global.css` switches off every animation and transition, `motion.css` switches off the view transition, and the landing page's pointer effect is not attached. Content must read correctly with no motion.

## Component rules

Use the shared Button, Field, StatusChip, Notice, RecordCard, ResponsiveRecords, FilterTabs, Disclosure, Stepper, Switch, EmptyState, and PageToolbar primitives. Give each screen one primary action. A normal state is represented by absence; visible status text accompanies every exception. Phone layouts use purposeful records; dense comparison may use a real table on wide screens. Keep touch actions at least 44px high. The page title is the `h1` that `PageToolbar` renders; it is visible and sits over the perforation.

## Floor map

The staff floor is drawn like a floor plan, and service fills it in.

- An open table is a dashed outline with its chairs drawn as empty outlines and its seat count in the corner. It stays quiet so tables in use stand out.
- A table in use fills in. Dining is solid charcoal with a filled chair for each seated guest, in facing pairs. Reserved or held is warning-soft with a solid edge. Every tile is the same size in every state, so the room does not shift when guests sit.
- State is never color alone: dashed versus solid edge, filled versus empty chairs, and a visible word (Dining, Booked, Held, Reserved) with a mono stamp for the time seated or the booking time.
- On the floor sheet, chili red appears twice: the request flag on a tile, and the count in Needs attention.
- Needs attention is one grouped list of links, in a rail beside the floor on wide screens. Each row says what, where and how long (tables, oldest wait, next reservation). With nothing to do, the section is absent.
- A table that changes state lands with one short thunk and its state block slides in. It never loops.
- Phones show two tables per row. Wider screens fill the row with tiles of at least `--size-tile-min`.
- Tile logic (state, chair fill, attention lines) lives in `src/lib/floor.js` with tests in `floor.test.js`; `/__design` in development shows every state.

## Copy rules

Use sentence case and concrete action labels. Short labels have no terminal period. Help text uses complete sentences. Loading text names what is loading. Empty and error messages say what is missing or happened and what to do next. Never alter stored names to improve display casing. The forbidden page never names or links to the staff address.

## Do not

Do not change Supabase schema, RLS, RPC names, route paths, host logic (`src/lib/hosts.js`), authentication logic, realtime channel logic, import rules, QR URLs, print behavior, or product names. Do not add runtime dependencies, fonts, icon packs, stock images, invented data, gradients, blur, glows, colored shadows, emoji, looping or infinite animation, `transition: all`, hover lift, or decoration without a purpose. Do not show state by color alone. Do not put raw color values anywhere but `tokens.css` (the two static pages in `public/` are the exception, because they must stand alone).

## Checks

`node scripts/audit-design.mjs` checks the contrast of every token pair the design uses (including text on chili red and on charcoal) and counts raw colors, gradients, blur, infinite animation, `transition: all`, wide colored borders and duplicated input styles. `npm test` and `npm run lint` must pass.

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
