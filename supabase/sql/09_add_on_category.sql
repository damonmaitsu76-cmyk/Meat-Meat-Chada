-- =====================================================================
-- MEAT ME AT CHADA - "add-on" menu category
-- Run after supabase/sql/01_schema.sql ... 08_seed.sql. Safe to run again.
--
-- Before: menu_items.category was meats / sides / drinks.
-- After:  meats / sides / drinks / add-on.
--   * Add-ons are the extras a table orders on top of the unlimited grill
--     (ramyun, cheese, tteokbokki, seaweed, and so on).
--   * Existing dishes are not touched.
--   * The customer menu, the Menu screen and the CSV import now use the same
--     four names, so run this before adding any add-on dishes.
-- =====================================================================

-- One statement, so the table is never left without the rule.
alter table public.menu_items
  drop constraint if exists menu_items_category_check,
  add constraint menu_items_category_check
    check (category in ('meats', 'sides', 'drinks', 'add-on'));

-- Check:  select category, count(*) from public.menu_items group by category order by category;
