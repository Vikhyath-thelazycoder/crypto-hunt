-- Crypto Hunt schema (TRD.md › Database). One game at a time: `games` has a single row (id = 1).
-- Secrets (answers, QR tokens and keys, seal codes, assignments, clues) live only here; players read them
-- through RPCs that return their own data (SECURITY.md T1).

create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ── Admin ───────────────────────────────────────────────────────────────────────────────────────────
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null unique check (char_length(name) between 2 and 40),
  created_at timestamptz not null default now()
);

-- ── Game ────────────────────────────────────────────────────────────────────────────────────────────
create table public.games (
  id int primary key default 1 check (id = 1),
  status text not null default 'SETUP'
    check (status in ('SETUP', 'REGISTRATION', 'READY', 'RUNNING', 'PAUSED', 'FINISHED')),
  registration_open boolean not null default false,
  hints_enabled boolean not null default false,
  hint_penalty_ms int not null default 120000 check (hint_penalty_ms >= 0),
  paused_at timestamptz,
  broadcast text check (char_length(broadcast) <= 200),
  broadcast_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  end_reason text
);
insert into public.games (id) values (1);

-- ── Teams and players ───────────────────────────────────────────────────────────────────────────────
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  number int not null unique check (number >= 1),
  name text not null unique check (char_length(name) between 2 and 40),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  status text not null default 'forming'
    check (status in ('forming', 'locked', 'active', 'eliminated', 'finished', 'disqualified')),
  eliminated_in_round int,
  final_rank int check (final_rank >= 1),
  completion_key text unique,
  -- D-026: the crew's seal code for the final mark; null until all 4 final clue pieces are solved.
  final_code text unique,
  eliminated_view text check (eliminated_view in ('game_over', 'spectator')),
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 40),
  is_active boolean not null default true,
  -- One active session per player (D-005): the phone that claimed it last; other phones get SESSION_MOVED.
  session_id uuid,
  claim_nonce text,
  claim_expires_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index players_team_name_key on public.players (team_id, lower(btrim(name)));
create index players_team_idx on public.players (team_id);

-- Teams are exactly 4 (D-004): never a 5th member, even under concurrent joins.
create function public._players_max_four() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.players where team_id = new.team_id) >= 4 then
    raise exception 'TEAM_FULL';
  end if;
  return new;
end $$;
create trigger players_max_four before insert on public.players
  for each row execute function public._players_max_four();

-- ── Venue ───────────────────────────────────────────────────────────────────────────────────────────
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  notes text,
  map_x real check (map_x between 0 and 1),
  map_y real check (map_y between 0 and 1),
  reveal_radius real not null default 0.08 check (reveal_radius > 0 and reveal_radius <= 0.5),
  clue_pieces text[] not null check (cardinality(clue_pieces) = 4),
  hint text,
  created_at timestamptz not null default now()
);

create table public.venue_map (
  id int primary key default 1 check (id = 1),
  image_path text,
  width int,
  height int
);

-- ── Plan: rounds, QRs, links, team paths ────────────────────────────────────────────────────────────
create table public.rounds (
  number int primary key check (number >= 1),
  qr_count int not null check (qr_count >= 1),
  advance_count int not null check (advance_count >= 1),
  difficulty int not null check (difficulty between 1 and 5),
  is_final boolean not null default false,
  closed_at timestamptz
);

create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  round int references public.rounds (number) on delete cascade,
  kind text not null check (kind in ('universal', 'target', 'final', 'prank')),
  is_spare boolean not null default false,
  location_id uuid references public.locations (id) on delete restrict,
  token text not null unique,
  key text not null check (key ~ '^[A-HJ-NP-Z2-9]{6}$'),
  label text not null unique,
  check ((kind in ('target', 'final')) = (round is not null)),
  check ((kind = 'universal') = (location_id is null))
);
create unique index qr_codes_one_universal on public.qr_codes (kind) where kind = 'universal';

create table public.qr_links (
  from_qr uuid primary key references public.qr_codes (id) on delete cascade,
  to_qr uuid not null references public.qr_codes (id) on delete cascade
);

create table public.assignments (
  team_id uuid not null references public.teams (id) on delete cascade,
  round int not null references public.rounds (number) on delete cascade,
  qr_id uuid not null references public.qr_codes (id) on delete cascade,
  primary key (team_id, round)
);
create index assignments_qr_idx on public.assignments (qr_id);

-- ── Progress ────────────────────────────────────────────────────────────────────────────────────────
create table public.team_state (
  team_id uuid primary key references public.teams (id) on delete cascade,
  round int not null default 1,
  phase text not null default 'SOLVING'
    check (phase in ('SOLVING', 'SEEKING', 'CHECKING_IN', 'PENALTY', 'COMPLETED', 'FINISHED', 'ELIMINATED')),
  penalty_ms int not null default 0,
  penalty_until timestamptz,
  round_started_at timestamptz not null default now(),
  -- D-025: later-round scans this round; the 3rd raises a possible-sweep alert.
  locked_scans int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.round_results (
  team_id uuid not null references public.teams (id) on delete cascade,
  round int not null references public.rounds (number) on delete cascade,
  completed_at timestamptz not null default now(),
  completion_order int not null,
  primary key (team_id, round),
  unique (round, completion_order)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) between 3 and 600),
  format text not null check (format in ('mcq', 'text', 'number')),
  options jsonb check (options is null or jsonb_typeof(options) = 'array'),
  answer text not null,
  alternatives text[] not null default '{}',
  hint text,
  difficulty int not null check (difficulty between 1 and 5),
  category text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  check ((format = 'mcq') = (options is not null))
);
create index questions_pick_idx on public.questions (difficulty) where is_enabled;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  player_id uuid references public.players (id) on delete set null,
  round int not null references public.rounds (number) on delete cascade,
  question_id uuid references public.questions (id) on delete set null,
  piece_index int not null check (piece_index between 0 and 3),
  opened_at timestamptz,
  solved_at timestamptz,
  solved_by uuid references public.players (id) on delete set null,
  hint_used boolean not null default false,
  wrong_count int not null default 0,
  focus_events int not null default 0,
  unique (team_id, round, piece_index)
);
create unique index tasks_player_round_key on public.tasks (player_id, round) where player_id is not null;
create index tasks_team_round_idx on public.tasks (team_id, round);

create table public.checkins (
  player_id uuid not null references public.players (id) on delete cascade,
  round int not null references public.rounds (number) on delete cascade,
  qr_id uuid not null references public.qr_codes (id) on delete cascade,
  scanned_at timestamptz not null default now(),
  key_ok_at timestamptz,
  seal_ok_at timestamptz,
  primary key (player_id, round)
);

-- D-025: the only way into submit_key. Issued by scan_qr for the team's own current-round QR only.
create table public.scan_tickets (
  player_id uuid primary key references public.players (id) on delete cascade,
  qr_id uuid not null references public.qr_codes (id) on delete cascade,
  round int not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);

-- ── Logs ────────────────────────────────────────────────────────────────────────────────────────────
create table public.events (
  id bigint generated always as identity primary key,
  team_id uuid references public.teams (id) on delete cascade,
  player_id uuid references public.players (id) on delete set null,
  kind text not null,
  data jsonb not null default '{}',
  at timestamptz not null default now()
);
create index events_at_idx on public.events (at desc);

create table public.alerts (
  id bigint generated always as identity primary key,
  team_id uuid references public.teams (id) on delete cascade,
  player_id uuid references public.players (id) on delete set null,
  kind text not null,
  data jsonb not null default '{}',
  acknowledged boolean not null default false,
  at timestamptz not null default now()
);
create index alerts_open_idx on public.alerts (at desc) where not acknowledged;

create table public.admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid,
  action text not null,
  target text,
  reason text,
  data jsonb not null default '{}',
  at timestamptz not null default now()
);

create table public.rate_limits (
  subject text not null,
  bucket text not null,
  window_start timestamptz not null,
  count int not null,
  primary key (subject, bucket)
);

-- Leaderboard and map ships for /screen and every phone. Names and progress only (no codes, keys, places).
create table public.public_state (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}',
  event_seq bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.public_state (id) values (1);
