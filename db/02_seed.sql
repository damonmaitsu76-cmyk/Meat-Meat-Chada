-- =====================================================================
-- MEAT ME AT CHADA - starter data
-- Run after 01_schema.sql. Safe to run again (it skips rows that exist).
-- The tables and dishes below are PLACEHOLDERS for testing. Replace them
-- with the real ones later (manually or through the CSV import).
-- =====================================================================

-- Settings the manager can change (see the Settings screen)
insert into public.settings (setting_key, setting_value) values
  ('arrival_grace_minutes', '15'),
  ('slot_length_minutes',   '90'),
  ('opening_time',          '11:00'),
  ('closing_time',          '23:00')
on conflict (setting_key) do nothing;

-- Sample tables (QR tokens are generated automatically)
insert into public.restaurant_tables (table_number, capacity) values
  (1, 2), (2, 2), (3, 4), (4, 4), (5, 4), (6, 6), (7, 6), (8, 8)
on conflict do nothing;

-- Sample dishes
insert into public.menu_items (item_name, category) values
  ('Pork Belly',        'meats'),
  ('Marinated Pork',    'meats'),
  ('Beef Slices',       'meats'),
  ('Chicken',           'meats'),
  ('Shrimp',            'meats'),
  ('Lettuce',           'sides'),
  ('Kimchi',            'sides'),
  ('Garlic',            'sides'),
  ('Steamed Egg',       'sides'),
  ('Rice',              'sides'),
  ('Iced Tea',          'drinks'),
  ('Soda',              'drinks')
on conflict do nothing;

-- =====================================================================
-- LOGIN ACCOUNTS
-- Supabase Auth needs an email, so the app logs people in as
-- <username>@chada.app (the login screen adds the "@chada.app" itself).
--
-- STEP 1: Supabase dashboard > Authentication > Users > Add user > "Create new user"
--         Tick "Auto Confirm User". Create these (use any password you like):
--             owner@chada.app
--             manager@chada.app
--             staff1@chada.app
-- STEP 2: Run the block below (re-run it any time you add more accounts that
--         follow the same pattern). owner@ -> owner, manager@ -> manager,
--         everything else -> staff.
-- =====================================================================
insert into public.users (user_id, username, role)
select id,
       split_part(email, '@', 1),
       case split_part(email, '@', 1)
         when 'owner'   then 'owner'
         when 'manager' then 'manager'
         else 'staff'
       end
from auth.users
where email like '%@chada.app'
on conflict (user_id) do nothing;
