-- IOTA Compass MVP schema (Neon Postgres 17).
--
-- Access model
--  * Only the Next.js server connects (DATABASE_URL, server env only).
--  * Every transaction runs `SET LOCAL ROLE compass_app`, a NOLOGIN role with
--    the minimum grants below and no BYPASSRLS, so RLS is enforced even though
--    the connection itself uses the project owner role.
--  * Member-owned tables have FORCE ROW LEVEL SECURITY keyed on the
--    transaction-local setting app.member_id, which the server sets ONLY from
--    the verified session (never from request input).
--  * Answer text is never written to logs or sync_events.


do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'compass_app') then
    create role compass_app nologin;
  end if;
end $$;
grant compass_app to current_user;

create or replace function public.current_member_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.member_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- Identity and auth (server-internal; no member policies needed)
-- ---------------------------------------------------------------------------
create table public.members (
  id                uuid primary key default gen_random_uuid(),
  mighty_member_id  text not null unique,
  role              text not null default 'member' check (role in ('member')),
  connected_at      timestamptz not null default now(),
  disconnected_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- AES-256-GCM ciphertext produced by the app; the key is never in the DB.
create table public.oauth_credentials (
  member_id              uuid primary key references public.members(id) on delete cascade,
  access_token_enc       text not null,
  access_token_expires   timestamptz not null,
  refresh_token_enc      text,
  scopes                 text not null,
  updated_at             timestamptz not null default now()
);

create table public.oauth_states (
  state_hash      text primary key,
  verifier_enc    text not null,
  mode            text not null check (mode in ('popup', 'redirect', 'iframe')),
  expires_at      timestamptz not null,
  used_at         timestamptz
);
create index oauth_states_expiry_idx on public.oauth_states(expires_at);

create table public.auth_handoffs (
  code_hash   text primary key,
  member_id   uuid not null references public.members(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index auth_handoffs_expiry_idx on public.auth_handoffs(expires_at);

create table public.app_sessions (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique,
  member_id   uuid not null references public.members(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz
);
create index app_sessions_member_idx on public.app_sessions(member_id);

create table public.mighty_field_map (
  field_key         text primary key check (field_key in ('q1','q2','q3','q4','q5','q6','q7','q8','north_star')),
  mighty_field_id   text not null unique,  -- GlobalID from network.customFields
  label             text not null,
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Member-owned content (RLS enforced)
-- ---------------------------------------------------------------------------
create table public.drafts (
  member_id   uuid not null references public.members(id) on delete cascade,
  draft_key   text not null check (draft_key in ('q1','q2','q3','q4','q5','q6','q7','q8','north_star')),
  answer      text not null default '' check (char_length(answer) <= 2000),
  updated_at  timestamptz not null default now(),
  primary key (member_id, draft_key)
);

create table public.snapshot_submissions (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members(id) on delete cascade,
  checkpoint    text not null default 'baseline' check (checkpoint in ('baseline')),
  submitted_at  timestamptz not null default now()
);
-- One baseline per member, ever: a later checkpoint can never overwrite it.
create unique index snapshot_one_checkpoint_per_member
  on public.snapshot_submissions(member_id, checkpoint);

create table public.snapshot_answers (
  submission_id  uuid not null references public.snapshot_submissions(id) on delete cascade,
  member_id      uuid not null references public.members(id) on delete cascade,
  question_key   text not null check (question_key in ('q1','q2','q3','q4','q5','q6','q7','q8')),
  answer         text not null check (char_length(answer) <= 2000),
  primary key (submission_id, question_key)
);
create index snapshot_answers_member_idx on public.snapshot_answers(member_id);

create table public.north_stars (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  statement   text not null check (char_length(statement) between 1 and 2000),
  version     integer not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (member_id, version)
);
create unique index north_stars_one_active on public.north_stars(member_id) where is_active;

-- Never stores answer text or tokens.
create table public.sync_events (
  id                      uuid primary key default gen_random_uuid(),
  member_id               uuid not null references public.members(id) on delete cascade,
  record_type             text not null check (record_type in ('snapshot','north_star')),
  record_id               uuid not null,
  field_key               text not null,
  mighty_custom_field_id  text not null,
  status                  text not null default 'pending' check (status in ('pending','succeeded','failed')),
  attempt_count           integer not null default 0,
  safe_error_code         text check (safe_error_code is null or safe_error_code ~ '^[A-Za-z0-9_]{1,40}$'),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (record_type, record_id, field_key)
);
create index sync_events_member_idx on public.sync_events(member_id, status);

-- ---------------------------------------------------------------------------
-- Immutability guards (belt and braces on top of the grants below)
-- ---------------------------------------------------------------------------
create or replace function public.forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception 'immutable record: % on %', tg_op, tg_table_name;
end $$;

create trigger snapshot_submissions_immutable before update on public.snapshot_submissions
  for each row execute function public.forbid_change();
create trigger snapshot_answers_immutable before update on public.snapshot_answers
  for each row execute function public.forbid_change();

create or replace function public.north_star_only_deactivate() returns trigger
language plpgsql as $$
begin
  if new.statement is distinct from old.statement or new.version is distinct from old.version
     or new.member_id is distinct from old.member_id or new.created_at is distinct from old.created_at then
    raise exception 'north_stars rows are immutable except is_active';
  end if;
  return new;
end $$;
create trigger north_stars_immutable before update on public.north_stars
  for each row execute function public.north_star_only_deactivate();

create or replace function public.members_lock_identity() returns trigger
language plpgsql as $$
begin
  if new.mighty_member_id is distinct from old.mighty_member_id or new.role is distinct from old.role then
    raise exception 'member identity and role are locked';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger members_identity_locked before update on public.members
  for each row execute function public.members_lock_identity();

-- ---------------------------------------------------------------------------
-- Atomic operations (SECURITY INVOKER: RLS still applies)
-- ---------------------------------------------------------------------------
create or replace function public.save_north_star(p_statement text)
returns public.north_stars
language plpgsql as $$
declare
  m uuid := public.current_member_id();
  next_version integer;
  result public.north_stars;
begin
  if m is null then raise exception 'no member context'; end if;
  perform pg_advisory_xact_lock(hashtext('ns:' || m::text));
  select coalesce(max(version), 0) + 1 into next_version from public.north_stars where member_id = m;
  update public.north_stars set is_active = false where member_id = m and is_active;
  insert into public.north_stars(member_id, statement, version, is_active)
    values (m, p_statement, next_version, true) returning * into result;
  return result;
end $$;

-- Returns the baseline submission id; idempotent (existing baseline wins).
create or replace function public.submit_baseline(p_answers jsonb)
returns uuid
language plpgsql as $$
declare
  m uuid := public.current_member_id();
  sid uuid;
  k text;
begin
  if m is null then raise exception 'no member context'; end if;
  perform pg_advisory_xact_lock(hashtext('baseline:' || m::text));
  select id into sid from public.snapshot_submissions where member_id = m and checkpoint = 'baseline';
  if sid is not null then return sid; end if;
  insert into public.snapshot_submissions(member_id, checkpoint) values (m, 'baseline') returning id into sid;
  foreach k in array array['q1','q2','q3','q4','q5','q6','q7','q8'] loop
    insert into public.snapshot_answers(submission_id, member_id, question_key, answer)
      values (sid, m, k, coalesce(p_answers ->> k, ''));
  end loop;
  return sid;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.drafts               enable row level security;
alter table public.drafts               force row level security;
alter table public.snapshot_submissions enable row level security;
alter table public.snapshot_submissions force row level security;
alter table public.snapshot_answers     enable row level security;
alter table public.snapshot_answers     force row level security;
alter table public.north_stars          enable row level security;
alter table public.north_stars          force row level security;
alter table public.sync_events          enable row level security;
alter table public.sync_events          force row level security;

create policy member_isolation on public.drafts
  using (member_id = public.current_member_id()) with check (member_id = public.current_member_id());
create policy member_isolation on public.snapshot_submissions
  using (member_id = public.current_member_id()) with check (member_id = public.current_member_id());
create policy member_isolation on public.snapshot_answers
  using (member_id = public.current_member_id()) with check (member_id = public.current_member_id());
create policy member_isolation on public.north_stars
  using (member_id = public.current_member_id()) with check (member_id = public.current_member_id());
create policy member_isolation on public.sync_events
  using (member_id = public.current_member_id()) with check (member_id = public.current_member_id());

-- ---------------------------------------------------------------------------
-- Least-privilege grants for the runtime role
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from public;
revoke all on all functions in schema public from public;
grant usage on schema public to compass_app;

grant select, insert on public.members to compass_app;
grant update (connected_at, disconnected_at, updated_at) on public.members to compass_app;
grant select, insert, update, delete on public.oauth_credentials to compass_app;
grant select, insert, update, delete on public.oauth_states to compass_app;
grant select, insert, update, delete on public.auth_handoffs to compass_app;
grant select, insert, update on public.app_sessions to compass_app;
grant select on public.mighty_field_map to compass_app;

grant select, insert, update, delete on public.drafts to compass_app;
grant select, insert on public.snapshot_submissions to compass_app;
grant select, insert on public.snapshot_answers to compass_app;
grant select, insert on public.north_stars to compass_app;
grant update (is_active) on public.north_stars to compass_app;
grant select, insert on public.sync_events to compass_app;
grant update (status, attempt_count, safe_error_code, updated_at) on public.sync_events to compass_app;

grant execute on function public.current_member_id() to compass_app;
grant execute on function public.save_north_star(text) to compass_app;
grant execute on function public.submit_baseline(jsonb) to compass_app;
