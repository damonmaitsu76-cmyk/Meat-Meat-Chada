-- =====================================================================
-- MEAT ME AT CHADA - samgyupsal menu (meats, sides, drinks, add-ons)
-- Run after supabase/sql/09_add_on_category.sql. Safe to run again (it skips
-- dishes that already exist, so the 08_seed.sql dishes are kept as they are).
--
-- The dishes below are what Philippine unli-samgyupsal / Korean BBQ places
-- commonly serve (menus of Romantic Baboy, Samgyupsalamat, Samgyup Masarap,
-- Bulgogi Brothers, Unli Samgyeop King, Chung Choon Yeon Ga, Gentleman
-- Korean BBQ, K's Samgyupsal, Ramyeon Nook and similar). They are a starting
-- list, not Chada's own menu: remove what you do not serve, or mark it
-- unavailable on the Menu screen.
-- =====================================================================

insert into public.menu_items (item_name, category) values
  -- Meats: pork -------------------------------------------------------
  ('Daepae (Thin Pork Belly)',        'meats'),
  ('Buljib (Honeycomb Pork Belly)',   'meats'),
  ('Gochujang Pork Belly',            'meats'),
  ('Garlic Pork Belly',               'meats'),
  ('Black Pepper Pork Belly',         'meats'),
  ('Spicy Pork Bulgogi',              'meats'),
  ('Pork Galbi',                      'meats'),
  ('Pork Enoki Wrap',                 'meats'),
  -- Meats: beef -------------------------------------------------------
  ('Beef Bulgogi',                    'meats'),
  ('Spicy Beef Bulgogi',              'meats'),
  ('Woo Samgyup (Beef Short Plate)',  'meats'),
  ('Beef Brisket',                    'meats'),
  -- Meats: chicken ----------------------------------------------------
  ('Honey Galbi Chicken',             'meats'),
  ('Gochujang Chicken',               'meats'),
  ('Salt-Grilled Chicken',            'meats'),

  -- Sides: sauces ----------------------------------------------------
  ('Ssamjang Sauce',                  'sides'),
  ('Gochujang Sauce',                 'sides'),
  ('Sesame Oil',                      'sides'),
  -- Sides: banchan ----------------------------------------------------
  ('Japchae',                         'sides'),
  ('Fishcake',                        'sides'),
  ('Potato Marbles',                  'sides'),
  ('Buttered Corn',                   'sides'),
  ('Pickled Radish',                  'sides'),
  ('Pickled Onion',                   'sides'),
  ('Bean Sprouts',                    'sides'),
  ('Dilis (Anchovies)',               'sides'),
  ('Sauteed Sayote',                  'sides'),

  -- Drinks ------------------------------------------------------------
  ('Bottled Water',                   'drinks'),
  ('Lemon Iced Tea',                  'drinks'),
  ('Blue Lemonade',                   'drinks'),
  ('Pineapple Juice',                 'drinks'),
  ('Yakult',                          'drinks'),
  ('Milkis',                          'drinks'),
  ('Chilsung Cider',                  'drinks'),
  ('Barley Tea',                      'drinks'),
  ('Soju',                            'drinks'),
  ('Makgeolli',                       'drinks'),
  ('San Miguel Pale Pilsen',          'drinks'),
  ('San Miguel Light',                'drinks'),

  -- Add-ons: extras ordered on top of the unlimited grill -------------
  ('Cheese Sauce',                    'add-on'),
  ('Boiled Egg',                      'add-on'),
  ('Roasted Seaweed',                 'add-on'),
  ('Ramyun',                          'add-on'),
  ('Cheese Ramyun',                   'add-on'),
  ('Tteokbokki (Rice Cakes)',         'add-on'),
  ('Cheesy Tteokbokki',               'add-on'),
  ('Rabokki (Ramyun + Rice Cakes)',   'add-on'),
  ('Kimchi Fried Rice',               'add-on'),
  ('Bibimbap',                        'add-on'),
  ('Kimchi Jjigae (Kimchi Stew)',     'add-on'),
  ('Kimchi Jeon (Kimchi Pancake)',    'add-on'),
  ('Mandu (Dumplings)',               'add-on'),
  ('Korean Fried Chicken',            'add-on')
on conflict do nothing;

-- Check:  select category, count(*) from public.menu_items group by category order by category;
