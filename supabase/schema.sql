-- En Una Nota: rankings semanales y registro de partidas.
-- Ejecutar una vez en Supabase → SQL Editor. Es idempotente.

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  week date not null,
  mode text not null,
  category_id text not null,
  name text not null,
  score integer not null check (score >= 0),
  created_at timestamptz not null default now()
);

create index if not exists scores_board_idx
  on public.scores (week, mode, category_id, score desc, id);

create table if not exists public.games (
  id bigint generated always as identity primary key,
  mode text not null,
  category_id text,
  players integer not null default 1,
  score integer,
  created_at timestamptz not null default now()
);

create index if not exists games_created_idx on public.games (created_at);
create index if not exists games_mode_idx on public.games (mode);

-- Solo el servidor (service_role) lee y escribe: sin políticas, anon/authenticated no ven nada.
alter table public.scores enable row level security;
alter table public.games enable row level security;

create or replace function public.game_stats()
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object(
    'total', (select count(*) from games),
    'today', (select count(*) from games where created_at >= date_trunc('day', now())),
    'week', (select count(*) from games where created_at >= now() - interval '7 days'),
    'players', (select coalesce(sum(players), 0) from games),
    'byMode', coalesce(
      (select json_object_agg(mode, n) from (select mode, count(*) as n from games group by mode) m),
      '{}'::json
    )
  );
$$;

revoke execute on function public.game_stats() from public, anon, authenticated;
grant execute on function public.game_stats() to service_role;

-- Cache of iTunes search results, so deploys start warm and Apple's rate limit is rarely hit.
create table if not exists public.itunes_cache (
  key text primary key,
  tracks jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.itunes_cache enable row level security;
