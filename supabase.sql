-- ============================================================
-- חידון המשפחה — Supabase Schema v3
-- חיי מדף: 7 ימים | מנצח שבועי | מניעת כפילות
-- ============================================================

-- משפחות רשומות
create table if not exists families (
  name text primary key,
  pin text not null,
  created_at timestamp default now()
);

-- חדרי חידון (תוקף 7 ימים)
create table if not exists quiz_rooms (
  code text primary key,
  topic text not null,
  questions jsonb not null,
  creator_family text not null,
  creator_pct integer not null,
  created_at timestamp default now(),
  expires_at timestamp default (now() + interval '7 days')
);

-- תוצאות אתגרים
-- unique constraint מונע שמשפחה תשחק אותו קוד פעמיים
create table if not exists quiz_challenges (
  id uuid default gen_random_uuid() primary key,
  code text references quiz_rooms(code) on delete cascade,
  family_name text not null,
  family_pct integer not null,
  played_at timestamp default now(),
  unique(code, family_name)
);

-- ניקוד שבועי מצטבר
create table if not exists family_scores (
  family_name text primary key,
  weekly_points integer default 0,
  total_games integer default 0,
  streak integer default 0,
  last_played date,
  week_started date default current_date,
  all_time_wins integer default 0
);

-- ארכיון מנצחים שבועיים
create table if not exists weekly_winners (
  id uuid default gen_random_uuid() primary key,
  week_start date not null,
  week_end date not null,
  family_name text not null,
  points integer not null,
  games_played integer not null,
  announced_at timestamp default now()
);

-- RLS
alter table families enable row level security;
alter table quiz_rooms enable row level security;
alter table quiz_challenges enable row level security;
alter table family_scores enable row level security;
alter table weekly_winners enable row level security;

create policy "read families"           on families          for select using (true);
create policy "insert families"         on families          for insert with check (true);
create policy "read quiz_rooms"         on quiz_rooms        for select using (true);
create policy "insert quiz_rooms"       on quiz_rooms        for insert with check (true);
create policy "read quiz_challenges"    on quiz_challenges   for select using (true);
create policy "insert quiz_challenges"  on quiz_challenges   for insert with check (true);
create policy "read family_scores"      on family_scores     for select using (true);
create policy "insert family_scores"    on family_scores     for insert with check (true);
create policy "update family_scores"    on family_scores     for update using (true);
create policy "read weekly_winners"     on weekly_winners    for select using (true);
create policy "insert weekly_winners"   on weekly_winners    for insert with check (true);

-- VIEW: לוח תוצאות שבועי
create or replace view weekly_leaderboard as
  select family_name, weekly_points, total_games, streak, all_time_wins
  from family_scores
  where last_played >= current_date - interval '7 days'
  order by weekly_points desc
  limit 50;

-- פרוצדורת סיום שבוע (הרץ כל יום ראשון)
create or replace function end_of_week()
returns void language plpgsql as $$
declare
  v_winner record;
  v_week_start date := current_date - interval '7 days';
begin
  select family_name, weekly_points, total_games into v_winner
  from family_scores
  where last_played >= v_week_start
  order by weekly_points desc limit 1;

  if v_winner.family_name is not null then
    insert into weekly_winners (week_start, week_end, family_name, points, games_played)
    values (v_week_start, current_date, v_winner.family_name, v_winner.weekly_points, v_winner.total_games);
    update family_scores set all_time_wins = all_time_wins + 1 where family_name = v_winner.family_name;
  end if;

  update family_scores set weekly_points = 0, week_started = current_date;
  delete from quiz_challenges where code in (select code from quiz_rooms where expires_at < now());
  delete from quiz_rooms where expires_at < now();
end;
$$;

-- הרצה ידנית כל יום ראשון: select end_of_week();
-- מנצח השבוע: select * from weekly_leaderboard limit 1;
-- ארכיון: select * from weekly_winners order by week_end desc;
