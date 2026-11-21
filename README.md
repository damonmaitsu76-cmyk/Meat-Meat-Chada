# Meat Me at Chada

QR-based dining and reservation system for Samgyup Chada (IT 14 project).
React + Vite on the front end, Supabase (PostgreSQL, Auth, Realtime, pg_cron) behind it.

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

In the Supabase SQL Editor, run the files in `db/` in this order:

1. `01_schema.sql` – tables, security rules, and functions
2. `02_seed.sql` – settings, sample tables and dishes, and the login accounts (follow the steps inside the file)
3. `03_cron.sql` – the every-minute task that releases late reservations (needs the `pg_cron` extension)
4. `04_decline_reason.sql` – saves the reason staff give when they decline a reservation, so customers can see it

## Pages

| Address | Who | What |
| --- | --- | --- |
| `/menu/<qr-token>` | Customers | QR menu, tray, request status |
| `/reserve` | Customers | Reserve a table, check or cancel a reservation |
| `/login` | Staff, manager, owner | Sign in with a username (the app adds `@chada.app`) |
| `/staff/dashboard` | All staff roles | Floor view, walk-ins, seating |
| `/staff/requests` | All staff roles | Refill request queue |
| `/staff/reservations` | All staff roles | Approve, decline, confirm arrival |
| `/staff/menu` | All staff roles | Dish availability; manager and owner also add, edit, delete |
| `/staff/tables` | Manager, owner | Tables and printable QR codes |
| `/staff/settings` | Manager, owner | Grace period, slot length, opening hours |

## Deploying

The app is a static site (Cloudflare Pages works). Set the two `VITE_` variables in the host's
settings, build with `npm run build`, and publish the `dist` folder. `public/_redirects` makes
links like `/menu/<token>` work after a page refresh.

Before printing QR codes, open **Tables & QR** and enter the real website address in the
address box so the codes do not point to `localhost`.

## Before the restaurant uses it

The tables and dishes from `02_seed.sql` are placeholders. Replace them with the real ones on the
**Tables & QR** and **Menu** pages.
