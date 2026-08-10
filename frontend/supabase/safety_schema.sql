-- ============================================================================
-- RoamSmart · Safety / Hazard / Alert schema (apply AFTER schema.sql)
--
-- Adds the tables powering the SMART TRAVEL CONDITION, HAZARD MONITORING and
-- ALERT system. Everything below is Supabase PostgreSQL. Firebase stays
-- authentication-only; all app data lives here.
--
-- New tables:
--   hazard_alerts          official NDMA SACHET alerts (source of truth)
--   hazard_trip_links      which trips/destinations/itinerary items a hazard affects
--   condition_snapshots    latest known weather/AQI/crowd per destination
--   condition_alerts       weather / AQI / crowd derived alerts (per user)
--   telegram_connections   verified Telegram chat_id <-> firebaseUid
--   sachet_feed_state      ETag cache + feed health (last successful fetch)
--
-- The existing `alerts` table (used for the in-app notification centre) and the
-- `userProfiles.alertPreferences` jsonb column are reused/extended rather than
-- duplicated.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- hazard_alerts — one row per official CAP alert, deduplicated on
-- (source, source_alert_id).
-- ----------------------------------------------------------------------------
create table if not exists public."hazard_alerts" (
  "id"                uuid primary key default gen_random_uuid(),
  "source"            text not null default 'NDMA SACHET',
  "source_alert_id"   text not null,                    -- CAP identifier / SACHET identifier
  "hazard_type"       text not null default '',         -- Cyclone, Flood, Landslide, ...
  "title"             text not null default '',         -- CAP headline
  "description"       text not null default '',
  "severity"          text not null default 'Unknown',  -- Minor | Moderate | Severe | Extreme (CAP)
  "urgency"           text not null default 'Unknown',  -- Immediate | Expected | Future | Past | Unknown
  "certainty"         text not null default 'Unknown',  -- Observed | Likely | Possible | Unlikely | Unknown
  "category"          text not null default 'Met',
  "latitude"          double precision,
  "longitude"         double precision,
  "affected_area"     text not null default '',         -- human-readable area description
  "radius_km"         double precision,                 -- circle radius when provided
  "polygon"           jsonb,                            -- array of [lon,lat] pairs (CAP polygon)
  "issued_at"         timestamptz,
  "effective_at"      timestamptz,
  "updated_at"        timestamptz,
  "expires_at"        timestamptz,
  "status"            text not null default 'ACTIVE',   -- DETECTED|ACTIVE|UPDATED|ESCALATED|RESOLVED|EXPIRED
  "severity_color"    text not null default '',         -- yellow | orange | red (SACHET tier)
  "instruction"       text not null default '',
  "source_url"        text not null default '',
  "raw"               jsonb,                            -- original CAP XML / JSON payload
  "created_at"        timestamptz not null default now(),
  unique ("source", "source_alert_id")
);
create index if not exists hazard_alerts_status_idx on public."hazard_alerts" ("status");
create index if not exists hazard_alerts_expires_idx on public."hazard_alerts" ("expires_at");
create index if not exists hazard_alerts_geoidx on public."hazard_alerts" ("latitude", "longitude");

-- ----------------------------------------------------------------------------
-- hazard_trip_links — association between an official hazard and the user's trip.
-- ----------------------------------------------------------------------------
create table if not exists public."hazard_trip_links" (
  "id"              uuid primary key default gen_random_uuid(),
  "hazard_alert_id" uuid not null references public."hazard_alerts"("id") on delete cascade,
  "userId"          text not null,
  "tripId"          text not null default '',
  "tripTitle"       text not null default '',
  "destinationName" text not null default '',
  "matchType"       text not null default 'destination',  -- destination | itinerary | route
  "distanceKm"      double precision,
  "matchedAt"       timestamptz not null default now(),
  unique ("hazard_alert_id", "userId", "tripId", "destinationName", "matchType")
);
create index if not exists hazard_trip_links_user_idx on public."hazard_trip_links" ("userId");

-- ----------------------------------------------------------------------------
-- condition_snapshots — latest known weather/AQI/crowd per destination, used
-- to detect significant change and to power the Trip Safety dashboard.
-- Written by backend/conditionMonitor.js (public info, like weather data).
-- ----------------------------------------------------------------------------
create table if not exists public."condition_snapshots" (
  "id"              uuid primary key default gen_random_uuid(),
  "destination"     text not null,
  "latitude"        double precision,
  "longitude"       double precision,
  "date"            text not null default '',
  "severity"        text not null default 'normal',  -- normal | warning | danger | critical
  "aggregate_score" integer not null default 0,
  "weather"         jsonb,
  "aqi"             jsonb,
  "crowd"           jsonb,
  "raw"             jsonb,
  "capturedAt"      timestamptz not null default now(),
  unique ("destination", "date")
);
create index if not exists condition_snapshots_dest_idx on public."condition_snapshots" ("destination", "capturedAt" desc);

-- ----------------------------------------------------------------------------
-- condition_alerts — derived (non-official) weather/AQI/crowd alerts per user.
-- ----------------------------------------------------------------------------
create table if not exists public."condition_alerts" (
  "id"            uuid primary key default gen_random_uuid(),
  "userId"        text not null,
  "itineraryId"   text not null default '',
  "destination"   text not null default '',
  "date"          text not null default '',
  "conditionType" text not null default '',       -- heat | rain | wind | storm | aqi | crowd
  "severity"      text not null default 'warning',-- warning | danger | critical
  "message"       text not null default '',
  "dedupe_key"    text not null default '',       -- source of dedupe/cooldown
  "dismissed"     boolean not null default false,
  "read"          boolean not null default false,
  "createdAt"     timestamptz not null default now(),
  unique ("dedupe_key")
);
create index if not exists condition_alerts_user_idx on public."condition_alerts" ("userId", "createdAt" desc);

-- ----------------------------------------------------------------------------
-- telegram_connections — verified Telegram chat ids bound to a Firebase UID
-- plus the bot long-polling offset row (id = 'telegram_poll_state').
-- ----------------------------------------------------------------------------
create table if not exists public."telegram_connections" (
  "id"            text primary key,
  "userId"        text not null default '',
  "chatId"        text not null default '',
  "offset"        bigint not null default 0,
  "username"      text not null default '',
  "verified"      boolean not null default false,
  "connectedAt"   timestamptz not null default now(),
  "disconnectedAt" timestamptz
);

-- ----------------------------------------------------------------------------
-- sachet_feed_state — ETag cache + feed health for the official SACHET feed.
-- ----------------------------------------------------------------------------
create table if not exists public."sachet_feed_state" (
  "id"                 text primary key default 'global',
  "etag"               text,
  "etagMap"            jsonb not null default '{}'::jsonb,  -- identifier -> etag
  "lastFetchedXmlAt"   timestamptz,
  "lastSuccessAt"      timestamptz,
  "lastErrorAt"        timestamptz,
  "lastError"          text not null default '',
  "lastAlertCount"     integer not null default 0,
  "updatedAt"          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- userProfiles — the app's existing user-profiles table is reused. We only add
-- the two columns the safety system needs if they are missing (idempotent).
-- ----------------------------------------------------------------------------
do $$
begin
  begin
    alter table public."userProfiles" add column if not exists "telegramChatId" text;
  exception when undefined_table then
    raise notice 'userProfiles table not present yet — rerun after it is created';
  end;
end $$;

-- ----------------------------------------------------------------------------
-- alerts (idempotent) — the in-app notification centre table the existing code
-- already writes to (alertScheduler / server.js). The table may already exist
-- with slightly different columns, so everything here is additive:
--   • create the table if it is missing
--   • add any missing columns safely (add column if not exists)
--   • create the index only when the columns exist
-- ----------------------------------------------------------------------------
create table if not exists public."alerts" (
  "id"            text primary key,
  "userId"        text not null,
  "itineraryId"   text,
  "dayNumber"     integer,
  "activityName"  text not null default '',
  "destination"   text not null default '',
  "alertType"     text not null default 'general',
  "severity"      text not null default 'warning',
  "condition"     text not null default '',
  "aiAdvice"      text,
  "data"          jsonb,
  "triggerType"   text not null default 'realtime',
  "source"        text not null default 'RoamSmart',
  "hazardAlertId" uuid,
  "dismissed"     boolean not null default false,
  "read"          boolean not null default false,
  "sentAt"        timestamptz not null default now(),
  "dismissedAt"   timestamptz
);

-- Add any columns that a pre-existing alerts table may be missing.
do $$
begin
  alter table public."alerts" add column if not exists "itineraryId" text;
  alter table public."alerts" add column if not exists "dayNumber" integer;
  alter table public."alerts" add column if not exists "activityName" text not null default '';
  alter table public."alerts" add column if not exists "destination" text not null default '';
  alter table public."alerts" add column if not exists "alertType" text not null default 'general';
  alter table public."alerts" add column if not exists "severity" text not null default 'warning';
  alter table public."alerts" add column if not exists "condition" text not null default '';
  alter table public."alerts" add column if not exists "aiAdvice" text;
  alter table public."alerts" add column if not exists "data" jsonb;
  alter table public."alerts" add column if not exists "triggerType" text not null default 'realtime';
  alter table public."alerts" add column if not exists "source" text not null default 'RoamSmart';
  alter table public."alerts" add column if not exists "hazardAlertId" uuid;
  alter table public."alerts" add column if not exists "dismissed" boolean not null default false;
  alter table public."alerts" add column if not exists "read" boolean not null default false;
  alter table public."alerts" add column if not exists "sentAt" timestamptz not null default now();
  alter table public."alerts" add column if not exists "dismissedAt" timestamptz;
exception when undefined_table then
  raise notice 'alerts table missing — rerun after the base schema is applied';
end $$;

-- Index only when the referenced columns exist (safe on pre-existing tables).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'alerts' and column_name = 'sentAt'
  ) then
    create index if not exists alerts_user_sent_idx on public."alerts" ("userId", "sentAt" desc);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- RLS — hazards are public information; links are user-scoped; snapshots,
-- condition alerts, telegram connections and feed state are user/system scoped.
-- ----------------------------------------------------------------------------
alter table public."hazard_alerts" enable row level security;
drop policy if exists "hazard_alerts:public-read" on public."hazard_alerts";
create policy "hazard_alerts:public-read" on public."hazard_alerts" for select using (true);
-- Hazard alerts are written only by the backend (service role bypasses RLS).
drop policy if exists "hazard_alerts:system-insert" on public."hazard_alerts";
create policy "hazard_alerts:system-insert" on public."hazard_alerts" for insert with check (true);
drop policy if exists "hazard_alerts:system-update" on public."hazard_alerts";
create policy "hazard_alerts:system-update" on public."hazard_alerts" for update using (true);

alter table public."hazard_trip_links" enable row level security;
drop policy if exists "hazard_trip_links:self-read" on public."hazard_trip_links";
create policy "hazard_trip_links:self-read" on public."hazard_trip_links" for select using ("userId" = (select auth.jwt() ->> 'sub'));
drop policy if exists "hazard_trip_links:self-insert" on public."hazard_trip_links";
create policy "hazard_trip_links:self-insert" on public."hazard_trip_links" for insert with check ("userId" = (select auth.jwt() ->> 'sub'));

alter table public."condition_snapshots" enable row level security;
drop policy if exists "condition_snapshots:public-read" on public."condition_snapshots";
create policy "condition_snapshots:public-read" on public."condition_snapshots" for select using (true);
drop policy if exists "condition_snapshots:system-insert" on public."condition_snapshots";
create policy "condition_snapshots:system-insert" on public."condition_snapshots" for insert with check (true);
drop policy if exists "condition_snapshots:system-update" on public."condition_snapshots";
create policy "condition_snapshots:system-update" on public."condition_snapshots" for update using (true);

alter table public."condition_alerts" enable row level security;
drop policy if exists "condition_alerts:self-read" on public."condition_alerts";
create policy "condition_alerts:self-read" on public."condition_alerts" for select using ("userId" = (select auth.jwt() ->> 'sub'));
drop policy if exists "condition_alerts:self-insert" on public."condition_alerts";
create policy "condition_alerts:self-insert" on public."condition_alerts" for insert with check ("userId" = (select auth.jwt() ->> 'sub'));
drop policy if exists "condition_alerts:self-update" on public."condition_alerts";
create policy "condition_alerts:self-update" on public."condition_alerts" for update using ("userId" = (select auth.jwt() ->> 'sub'));
drop policy if exists "condition_alerts:self-delete" on public."condition_alerts";
create policy "condition_alerts:self-delete" on public."condition_alerts" for delete using ("userId" = (select auth.jwt() ->> 'sub'));

alter table public."telegram_connections" enable row level security;
drop policy if exists "telegram_connections:self-read" on public."telegram_connections";
create policy "telegram_connections:self-read" on public."telegram_connections" for select using ("userId" = (select auth.jwt() ->> 'sub'));
drop policy if exists "telegram_connections:self-insert" on public."telegram_connections";
create policy "telegram_connections:self-insert" on public."telegram_connections" for insert with check ("userId" = (select auth.jwt() ->> 'sub'));
drop policy if exists "telegram_connections:self-update" on public."telegram_connections";
create policy "telegram_connections:self-update" on public."telegram_connections" for update using ("userId" = (select auth.jwt() ->> 'sub'));

alter table public."sachet_feed_state" enable row level security;
drop policy if exists "sachet_feed_state:public-read" on public."sachet_feed_state";
create policy "sachet_feed_state:public-read" on public."sachet_feed_state" for select using (true);

-- Grants (idempotent; existing schema already grants broad usage to anon/authenticated).
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

-- Realtime: publish hazards + user alerts/snapshots so the app updates live.
do $$
declare t text;
begin
  foreach t in array array[
    'hazard_alerts','hazard_trip_links','condition_snapshots',
    'condition_alerts','telegram_connections','alerts'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
