-- Gatduell: konto, premium och global ranking.
-- Kör i Supabase SQL Editor. Lägg aldrig service-role key i frontend.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Spelare' check (char_length(display_name) between 1 and 40),
  is_premium boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.match_results (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  city_slug text not null,
  won boolean not null,
  player_score smallint not null default 0,
  opponent_score smallint not null default 0,
  difficulty text not null default 'hard',
  opponent_name text not null default 'Motståndare',
  created_at timestamptz not null default now()
);

create table if not exists public.leaderboard_entries (
  user_id uuid not null references public.profiles(id) on delete cascade,
  city_slug text not null,
  wins integer not null default 0,
  matches integer not null default 0,
  points integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, city_slug)
);

alter table public.profiles enable row level security;
alter table public.match_results enable row level security;
alter table public.leaderboard_entries enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.match_results from anon, authenticated;
revoke all on public.leaderboard_entries from anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant update(display_name) on public.profiles to authenticated;
grant select on public.match_results to authenticated;
grant select on public.leaderboard_entries to anon, authenticated;

create policy "profiles are publicly readable"
on public.profiles for select
using (true);

create policy "users may update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "users may read own match history"
on public.match_results for select
to authenticated
using (auth.uid() = user_id);

create policy "leaderboard is publicly readable"
on public.leaderboard_entries for select
using (true);

create or replace function public.handle_new_gatduell_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1), 'Spelare'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_gatduell on auth.users;
create trigger on_auth_user_created_gatduell
after insert on auth.users
for each row execute procedure public.handle_new_gatduell_user();

create or replace function public.record_gatduell_match(
  p_city_slug text,
  p_won boolean,
  p_player_score integer,
  p_opponent_score integer,
  p_difficulty text,
  p_opponent_name text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  earned_points integer := case when p_won then 3 else 0 end;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  insert into public.match_results(user_id,city_slug,won,player_score,opponent_score,difficulty,opponent_name)
  values(uid, left(coalesce(p_city_slug,'umea'),40), p_won, greatest(0,least(p_player_score,99)), greatest(0,least(p_opponent_score,99)), left(coalesce(p_difficulty,'hard'),20), left(coalesce(p_opponent_name,'Motståndare'),40));

  insert into public.leaderboard_entries(user_id,city_slug,wins,matches,points,updated_at)
  values(uid,left(coalesce(p_city_slug,'umea'),40),case when p_won then 1 else 0 end,1,earned_points,now())
  on conflict(user_id,city_slug) do update set
    wins=public.leaderboard_entries.wins + case when excluded.wins > 0 then 1 else 0 end,
    matches=public.leaderboard_entries.matches + 1,
    points=public.leaderboard_entries.points + earned_points,
    updated_at=now();
end;
$$;

revoke all on function public.record_gatduell_match(text,boolean,integer,integer,text,text) from public;
grant execute on function public.record_gatduell_match(text,boolean,integer,integer,text,text) to authenticated;

-- Premiumstatus ska sättas av en betrodd backend/betalnings-webhook med service_role,
-- aldrig direkt från klienten. Exempel administrativt test:
-- update public.profiles set is_premium=true where id='<user-uuid>';
