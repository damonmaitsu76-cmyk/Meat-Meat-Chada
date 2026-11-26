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

In the Supabase SQL Editor, run the files in `supabase/sql` in filename order, 01 to 13:

1. `01_schema.sql` – tables, security rules, and functions
2. `02_cron.sql` – the every-minute task that releases late reservations (needs the `pg_cron` extension)
3. `03_decline_reason.sql` – saves the reason staff give when they decline a reservation
4. `04_reports.sql` – the totals behind the Reports screen
5. `05_accounts.sql` – account safety rules and activity records
6. `06_merge_roles.sql` – one `admin` role instead of manager and owner
7. `07_staff_cancel_and_slot_fixes.sql` – staff cancellation and table availability fixes
8. `08_seed.sql` – settings, sample tables and dishes, and the first login account (follow the steps inside the file; it needs the admin role from 06)
9. `09_add_on_category.sql` – adds the `add-on` menu category (meats, sides, drinks, add-on)
10. `10_samgyup_menu.sql` – a starter samgyupsal menu: more meats, sides, drinks, and add-ons (needs 09)
11. `11_phone_validation.sql` – reservations only accept a Philippine mobile number (09XXXXXXXXX)
12. `12_state_machine_fixes.sql` – unanswered reservation requests expire, guests can be seated at another table, safer table status changes, no duplicate requests when a tap is retried, and the last manager account cannot be removed
13. `13_bulk_orders_and_auto_release.sql` – one table request can hold up to 100 different dishes (it was 30), and tables free themselves: once a party is past the time slot, everything it ordered is served, and nothing new was requested for 20 minutes (Settings, 0 turns it off)

Already running an older version? Run `12_state_machine_fixes.sql` and then `13_bulk_orders_and_auto_release.sql`, and run them **before** you deploy the new front end (the new QR menu sends an extra field that the old database function does not know). The rules behind them are written down in `docs/STATE_MACHINES.md`.

If the QR menu says "Could not find the function public.submit_refill_request", the database is missing those files: run 12, then 13, in that order.

## Deploy the account function

Creating logins and resetting passwords runs on the server (`supabase/functions/manage-staff`).
With the Supabase CLI installed and the project linked:

```
supabase functions deploy manage-staff
```

## Hardening

Run `supabase/sql/14_hardening.sql` after 13 (SQL Editor, same as the others), then deploy the matching front end straight away: the reservation lookup and cancel functions now take the last 4 digits of the guest's phone number. It adds a 20-second cooldown per table, a Reject action for table requests, a cap on pending online reservations (`max_pending_reservations`, 40), and masks reservation phone numbers after `contact_retention_days` (60) days. If you change that number, change "60 days" in the reservation form notice too.

`public/_headers` adds security headers on Cloudflare Pages. Its Content-Security-Policy is report-only: click through every screen, and if the browser console shows no "Refused to..." lines, rename `Content-Security-Policy-Report-Only` to `Content-Security-Policy` and redeploy.

## Turn off the old addresses

Once `VITE_PUBLIC_SITE_URL` and `VITE_STAFF_SITE_URL` are set, the app only runs on those two addresses (plus `www` and `localhost`). Any other address, such as the old `*.workers.dev` one, shows an "address retired" page with a button to the same page on the right address (`src/pages/Blocked.jsx`). That is a courtesy, not a lock, so also switch the old addresses off in Cloudflare:

1. Worker > Settings > Domains & Routes: disable **workers.dev** and, separately, **Preview URLs**. Disabling workers.dev does not disable preview, version or deployment URLs.
2. Put the same two settings in the Worker's config file, or the next deploy turns them back on (a dashboard-only change is undone by the next `wrangler deploy`, which is what Workers Builds runs):

   ```jsonc
   // wrangler.jsonc: keep your existing name and assets settings, add the last two lines
   {
     "workers_dev": false,
     "preview_urls": false
   }
   ```

   `name` must match the Worker's name in Cloudflare exactly. `npm run build` output goes to `dist`.

Clearing the DNS cache on your computer (`ipconfig /flushdns`) does not matter here: a workers.dev address is answered by Cloudflare, not by a DNS record you control.

## Branded blocked page

Cloudflare's default "Sorry, you have been blocked" page can only be replaced on a paid plan (Pro or higher). `public/blocked.html` is a ready, self-contained replacement in the app's look. After deploying:

1. Cloudflare dashboard > your domain > **Rules** > **Error Pages** (or **Custom Errors**) > WAF block > **Edit** > **Custom page**.
2. Enter `https://meat-me-at-chada.tech/blocked.html` and confirm.
3. After any later change to the file, select **Fetch custom page again** (Cloudflare keeps its own copy).

**On the Free plan** the Cloudflare page cannot be replaced, so stop using a Block rule for things a visitor can be sent away from:

- A rule that only blocks `/staff` or `/login` on `meat-me-at-chada.tech`: delete it. The app already moves those paths to the staff address.
- A rule you want to keep (bots, a country, an IP list): the block page stays Cloudflare's. To show the branded one instead, turn the Block rule into a Redirect rule (**Rules** > **Redirect Rules** > **Create rule**): keep the same expression, add `and http.request.uri.path ne "/blocked-plain.html"` (without it, a country or IP rule catches the redirect itself and loops), choose **Static** and enter `https://meat-me-at-chada.tech/blocked-plain.html`. `public/blocked-plain.html` is `blocked.html` without Cloudflare's request code, which only the Custom page route can fill in.

A redirect sends the visitor on, it does not stop the request, so do not use it for anything that must be kept out. Keep a real Block rule for those and accept Cloudflare's page.

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
| `/staff/requests` | All logged-in roles | Request queue |
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

### Before you print the QR codes

1. Deploy the site.
2. Open the live site and log in.
3. Open **Tables & QR**, then select **Print all QR codes**.

A printed code contains the full web address. If the address changes later, print the codes again; the table tokens do not change.

## Before the restaurant uses it

The tables and dishes from `supabase/sql/08_seed.sql` and `supabase/sql/10_samgyup_menu.sql` are placeholders. Replace them with the real ones through
**Import** or the **Tables & QR** and **Menu** pages.
