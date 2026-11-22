# Meat Me at Chada

QR-based dining and reservation system for Samgyup Chada (IT 14 project).
React + Vite on the front end, Supabase (PostgreSQL, Auth, Realtime, pg_cron, Edge Functions) behind it.

## Run it locally

1. `npm install`
2. Create a `.env` file in the project root:

   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. `npm run dev`

Other scripts: `npm run lint`, `npm run build`, `npm run preview`.

## Set up the database

In the Supabase SQL Editor, run the files in `supabase/sql` in filename order, 01 to 08:

1. `01_schema.sql` – tables, security rules, and functions
2. `02_cron.sql` – the every-minute task that releases late reservations (needs the `pg_cron` extension)
3. `03_decline_reason.sql` – saves the reason staff give when they decline a reservation
4. `04_reports.sql` – the totals behind the Reports screen
5. `05_accounts.sql` – account safety rules and activity records
6. `06_merge_roles.sql` – one `admin` role instead of manager and owner
7. `07_staff_cancel_and_slot_fixes.sql` – staff cancellation and table availability fixes
8. `08_seed.sql` – settings, sample tables and dishes, and the first login account (follow the steps inside the file; it needs the admin role from 06)

## Deploy the account function

Creating logins and resetting passwords runs on the server (`supabase/functions/manage-staff`).
With the Supabase CLI installed and the project linked:

```
supabase functions deploy manage-staff
```

## Roles

| Role | Can do |
| --- | --- |
| Staff | Dashboard, request queue, reservations, dish availability |
| Manager | Everything staff can do, plus tables and QR codes, import, reports, accounts, settings, and editing the menu |

## Pages

| Address | Who | What |
| --- | --- | --- |
| `/menu/<qr-token>` | Customers | QR menu, tray, request status |
| `/reserve` | Customers | Reserve a table, check or cancel a reservation |
| `/login` | Staff, manager | Sign in with a username (the app adds `@chada.app`) |
| `/staff/dashboard` | All logged-in roles | Floor view, walk-ins, seating |
| `/staff/requests` | All logged-in roles | Refill request queue |
| `/staff/reservations` | All logged-in roles | Approve, decline, confirm arrival |
| `/staff/menu` | All logged-in roles | Dish availability; managers also add, edit, delete |
| `/staff/tables` | Manager | Tables and printable QR codes |
| `/staff/import` | Manager | Load the menu or table list from a CSV file |
| `/staff/reports` | Manager | Reservations, no-shows, guests served, busy days, activity log |
| `/staff/accounts` | Manager | Create accounts, reset passwords, change roles, deactivate |
| `/staff/settings` | Manager | Grace period, slot length, opening hours |

## Deploying

The app is a static site (Cloudflare Pages works). Set the two `VITE_` variables in the host's
settings, build with `npm run build`, and publish the `dist` folder. `public/_redirects` makes
links like `/menu/<token>` work after a page refresh.

Print the QR codes from the live site, or set the optional `VITE_PUBLIC_SITE_URL` in Cloudflare Pages if the live site is reached through a different address.

## Before the restaurant uses it

The tables and dishes from `supabase/sql/08_seed.sql` are placeholders. Replace them with the real ones through
**Import** or the **Tables & QR** and **Menu** pages.
