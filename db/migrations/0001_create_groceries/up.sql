create table groceries_users (
  id integer primary key autoincrement,
  email text not null unique collate nocase,
  password_hash text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table groceries_meals (
  id integer primary key autoincrement,
  user_id integer not null references groceries_users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  unique (user_id, name)
);

create table groceries_ingredients (
  id integer primary key autoincrement,
  meal_id integer not null references groceries_meals(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  quantity text,
  kroger_product_id text,
  kroger_product_name text,
  unique (meal_id, name)
);

create table groceries_kroger_configs (
  user_id integer primary key references groceries_users(id) on delete cascade,
  client_id text not null,
  client_secret text not null,
  location_id text,
  location_name text
);

create table groceries_kroger_tokens (
  user_id integer not null references groceries_users(id) on delete cascade,
  grant_type text not null check (grant_type in ('CLIENT', 'USER')),
  access_token text not null,
  refresh_token text,
  expires_at text not null,
  primary key (user_id, grant_type)
);

create table groceries_orders (
  id integer primary key autoincrement,
  user_id integer not null references groceries_users(id) on delete cascade,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table groceries_order_meals (
  order_id integer not null references groceries_orders(id) on delete cascade,
  position integer not null,
  meal_name text not null,
  primary key (order_id, position)
);
