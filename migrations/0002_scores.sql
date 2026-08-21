create table if not exists high_scores (
  id serial primary key,
  user_id text not null,
  level_id text not null,
  score integer not null,
  updated_at timestamptz not null default now(),
  unique (user_id, level_id)
);
create index if not exists high_scores_user_id_idx on high_scores (user_id);
