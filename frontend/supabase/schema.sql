-- ============================================================================
-- RoamSmart · Supabase schema — ALL application data & storage live here.
-- Firebase handles AUTHENTICATION ONLY (email/password, Google, verification).
--
-- IDENTITY MODEL
--   Firebase stays the identity provider. The signed-in user's Firebase UID is
--   bridged into Supabase via a Firebase JWT issuer (Auth → JWT Issuers):
--     Issuer : https://securetoken.google.com/roamsmart-ee284
--     JWKS   : https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com
--     Audience: roamsmart-ee284
--   RLS below reads the Firebase UID from the JWT's sub claim via auth.jwt() ->> 'sub'
--   (auth.uid() casts sub to uuid, which fails for non-UUID Firebase UIDs).
--
-- ORDER MATTERS: tables → functions → policies → grants → realtime → storage.
-- (SQL functions validate referenced tables at creation, so functions come AFTER
--  the tables and BEFORE the policies that use them.)
--
-- DESIGN NOTE (deliberate)
--   Poll options/votes, place votes, poll & place docs, itinerary, announcements,
--   expenses and settlements keep the exact object shapes the existing RoamSmart
--   UI already works with — stored as jsonb documents in PostgreSQL so the UI is
--   NOT rewritten. They are still per-row RLS protected and realtime-published.
--   Relational rows are used where they carry semantic value (users, groups,
--   members, invites, messages, topics, files, activity, notifications).
-- ============================================================================

-- ============================================================================
-- 1 · TABLES
-- ============================================================================

-- users (one row per Firebase account; self-managed)
create table if not exists public."users" (
  "firebaseUid"       text primary key,
  "username"          text not null default '',
  "usernameLower"     text not null unique,
  "displayName"       text not null default '',
  "email"             text not null default '',
  "phone"             text not null default '',
  "bio"               text not null default '',
  "upiId"             text not null default '',
  "preferredPaymentApp" text not null default '',
  "avatarUrl"         text not null default '',
  "createdAt"         timestamptz not null default now(),
  "updatedAt"         timestamptz not null default now(),
  "lastActive"        timestamptz
);

-- userProfiles (backend notification/alert preferences, FCM tokens, etc.)
create table if not exists public."userProfiles" (
  "id"                  text primary key,
  "phoneNumber"         text,
  "fcmToken"            text,
  "telegramChatId"      text,
  "alertPreferences"    jsonb not null default '{}'::jsonb,
  "activeItineraries"   text[] not null default '{}',
  "createdAt"           timestamptz not null default now(),
  "updatedAt"           timestamptz not null default now()
);

alter table public."userProfiles" enable row level security;
drop policy if exists "userProfiles:self-read" on public."userProfiles";
create policy "userProfiles:self-read"    on public."userProfiles" for select using ("id" = (select auth.jwt() ->> 'sub'));
drop policy if exists "userProfiles:self-insert" on public."userProfiles";
create policy "userProfiles:self-insert"  on public."userProfiles" for insert with check ("id" = (select auth.jwt() ->> 'sub'));
drop policy if exists "userProfiles:self-update" on public."userProfiles";
create policy "userProfiles:self-update"  on public."userProfiles" for update using ("id" = (select auth.jwt() ->> 'sub'));
drop policy if exists "userProfiles:self-delete" on public."userProfiles";
create policy "userProfiles:self-delete"  on public."userProfiles" for delete using ("id" = (select auth.jwt() ->> 'sub'));

-- groups
create table if not exists public."groups" (
  "id"            text primary key,
  "name"          text not null default '',
  "destination"   text not null default '',
  "destinationEmoji" text not null default '',
  "image"         text,
  "startDate"     text not null default '',
  "endDate"       text not null default '',
  "privacy"       text not null default 'public',
  "code"          text not null unique,
  "memberCount"   integer not null default 0,
  "createdBy"     text not null,
  "settings"      jsonb not null default '{}'::jsonb,
  "data"          jsonb not null default '{}'::jsonb,  -- original group doc (forwards compat)
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now()
);
create index if not exists groups_created_by_idx on public."groups" ("createdBy");

-- groupMembers — membership is the backbone of RLS (denormalized display fields)
create table if not exists public."groupMembers" (
  "gid"           text not null references public."groups"("id") on delete cascade,
  "firebaseUid"   text not null,
  "role"          text not null default 'member',      -- member | admin
  "status"        text not null default 'joined',
  "name"          text not null default '',
  "username"      text not null default '',
  "email"         text not null default '',
  "phone"         text not null default '',
  "avatar"        text,
  "upi"           text not null default '',
  "joinedAt"      timestamptz not null default now(),
  "lastReadAt"    bigint not null default 0,
  primary key ("gid", "firebaseUid")
);
create index if not exists groupmembers_uid_idx on public."groupMembers" ("firebaseUid");
create index if not exists groupmembers_gid_idx on public."groupMembers" ("gid");

-- groupInvitations — join-by-code
create table if not exists public."groupInvitations" (
  "code"       text primary key,
  "gid"        text not null references public."groups"("id") on delete cascade,
  "createdBy"  text not null,
  "revoked"    boolean not null default false,
  "createdAt"  timestamptz not null default now()
);
create index if not exists groupinvitations_gid_idx on public."groupInvitations" ("gid");

-- messages — relational row + jsonb meta (reactions/reply/mentions/attachment)
create table if not exists public."messages" (
  "id"         text primary key,
  "gid"        text not null references public."groups"("id") on delete cascade,
  "uid"        text not null,
  "name"       text not null default '',
  "kind"       text not null default 'text',   -- text | poll | place | file | system
  "text"       text not null default '',
  "attachment" jsonb,
  "placeId"    text,
  "pollId"     text,
  "topicId"    text,
  "replyTo"    jsonb,
  "mentions"   jsonb not null default '[]'::jsonb,
  "reactions"  jsonb not null default '{}'::jsonb,
  "pinned"     boolean not null default false,
  "edited"     boolean not null default false,
  "createdAt"  timestamptz not null default now()
);
create index if not exists messages_gid_created_idx on public."messages" ("gid", "createdAt" desc);

-- polls / places / announcements — jsonb docs (UI object shapes preserved)
create table if not exists public."polls" (
  "id" text primary key,
  "gid" text not null references public."groups"("id") on delete cascade,
  "data" jsonb not null default '{}'::jsonb,
  "createdAt" timestamptz not null default now()
);
create index if not exists polls_gid_idx on public."polls" ("gid", "createdAt" desc);

create table if not exists public."places" (
  "id" text primary key,
  "gid" text not null references public."groups"("id") on delete cascade,
  "data" jsonb not null default '{}'::jsonb,
  "createdAt" timestamptz not null default now()
);
create index if not exists places_gid_idx on public."places" ("gid", "createdAt" desc);

create table if not exists public."announcements" (
  "id" text primary key,
  "gid" text not null references public."groups"("id") on delete cascade,
  "data" jsonb not null default '{}'::jsonb,
  "createdAt" timestamptz not null default now()
);
create index if not exists announcements_gid_idx on public."announcements" ("gid", "createdAt" desc);

-- groupTopics — lightweight relational rows (name + emoji per group)
create table if not exists public."groupTopics" (
  "id" text primary key,
  "gid" text not null references public."groups"("id") on delete cascade,
  "name" text not null default '',
  "nameLower" text not null default '',
  "emoji" text not null default '📍',
  "createdBy" text not null,
  "createdAt" timestamptz not null default now(),
  unique ("gid", "nameLower")
);

-- groupItineraries / finalPlans — one jsonb doc per group
-- ("itineraries" pre-exists in this project for the backend alert scheduler, so we use a distinct name)
create table if not exists public."groupItineraries" (
  "gid" text primary key references public."groups"("id") on delete cascade,
  "data" jsonb not null default '{}'::jsonb,
  "updatedAt" timestamptz not null default now()
);

create table if not exists public."finalPlans" (
  "gid" text primary key references public."groups"("id") on delete cascade,
  "data" jsonb not null default '{}'::jsonb,
  "updatedAt" timestamptz not null default now()
);

-- sharedFiles — metadata rows; binaries live in the group-media bucket
create table if not exists public."sharedFiles" (
  "id" text primary key,
  "gid" text not null references public."groups"("id") on delete cascade,
  "uid" text not null,
  "name" text not null default '',
  "kind" text not null default 'file',
  "url" text,
  "path" text,
  "dataUrl" text,
  "caption" text not null default '',
  "folder" text not null default 'documents',
  "sizeKB" numeric not null default 0,
  "createdAt" timestamptz not null default now()
);
create index if not exists sharedfiles_gid_idx on public."sharedFiles" ("gid", "createdAt" desc);

-- groupActivity — shared timeline
create table if not exists public."groupActivity" (
  "id" text primary key,
  "gid" text not null references public."groups"("id") on delete cascade,
  "uid" text not null,
  "name" text not null default '',
  "icon" text not null default '✨',
  "text" text not null default '',
  "kind" text not null default 'generic',
  "createdAt" timestamptz not null default now()
);
create index if not exists groupactivity_gid_idx on public."groupActivity" ("gid", "createdAt" desc);

-- expenses / settlements — jsonb docs (RoamSplit object shapes preserved)
create table if not exists public."expenses" (
  "id" text primary key,
  "gid" text not null references public."groups"("id") on delete cascade,
  "data" jsonb not null default '{}'::jsonb,
  "createdAt" timestamptz not null default now()
);
create index if not exists expenses_gid_idx on public."expenses" ("gid", "createdAt" desc);

create table if not exists public."settlements" (
  "id" text primary key,
  "gid" text not null references public."groups"("id") on delete cascade,
  "data" jsonb not null default '{}'::jsonb,
  "createdAt" timestamptz not null default now()
);
create index if not exists settlements_gid_idx on public."settlements" ("gid", "createdAt" desc);

-- notifications — per-recipient; written via notify_group()
create table if not exists public."notifications" (
  "id" text primary key,
  "firebaseUid" text not null,
  "gid" text not null references public."groups"("id") on delete cascade,
  "gidName" text not null default '',
  "text" text not null default '',
  "kind" text not null default 'group',
  "icon" text not null default '🔔',
  "read" boolean not null default false,
  "createdAt" timestamptz not null default now()
);
create index if not exists notifications_uid_idx on public."notifications" ("firebaseUid", "createdAt" desc);

-- ============================================================================
-- 2 · HELPERS (used by RLS policies + notify function)
-- ============================================================================

create or replace function public.is_group_member(p_gid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public."groupMembers"
    where "gid" = p_gid and "firebaseUid" = (select auth.jwt() ->> 'sub')
  );
$$;

create or replace function public.is_group_admin(p_gid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public."groupMembers"
    where "gid" = p_gid and "firebaseUid" = (select auth.jwt() ->> 'sub') and "role" = 'admin'
  );
$$;

-- True when the group is a RoamSplit container (standalone split group or a
-- trip's split). Split containers are stored as groups rows (tagged in `data`)
-- so the expenses/settlements FKs are satisfied, but they must NOT appear on
-- the RoamGroups home screen. Security definer so the policy checks below can
-- read the row without RLS.
create or replace function public.is_split_group(p_gid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public."groups"
    where "id" = p_gid
      and coalesce((data ->> '_isSplitGroup')::text, 'false') = 'true'
  );
$$;

-- Write notifications for every un-excluded member of a group (runs as definer
-- because members must not insert rows into another user's notifications).
-- NOTE: the arg is p_gidname (Postgres folds unquoted identifiers to lowercase);
-- PostgREST matches RPC argument names case-sensitively, so clients must pass
-- p_gidname too.
create or replace function public.notify_group(p_gid text, p_gidname text, p_text text,
  p_kind text, p_icon text, p_exclude text[])
returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.is_group_member(p_gid) then
    raise exception 'you are not a member of this group';
  end if;
  for r in
    select "firebaseUid" from public."groupMembers"
    where "gid" = p_gid
      and not array["firebaseUid"] <@ coalesce(p_exclude, '{}'::text[])
  loop
    insert into public."notifications"
      ("id", "firebaseUid", "gid", "gidName", "text", "kind", "icon", "read", "createdAt")
    values
      (gen_random_uuid()::text, r."firebaseUid", p_gid, p_gidName, p_text, p_kind, p_icon, false, now());
  end loop;
end;
$$;

-- ============================================================================
-- 3 · ROW LEVEL SECURITY
-- ============================================================================

alter table public."users" enable row level security;
drop policy if exists "users:self-read" on public."users";
-- Allow users to read their own full profile
create policy "users:self-read"    on public."users" for select using ("firebaseUid" = (select auth.jwt() ->> 'sub'));
-- Allow any authenticated user to search other users' basic info (for group invite search)
drop policy if exists "users:auth-search" on public."users";
create policy "users:auth-search" on public."users" for select using ((select auth.jwt() ->> 'sub') is not null);
drop policy if exists "users:self-insert" on public."users";
create policy "users:self-insert"  on public."users" for insert with check ("firebaseUid" = (select auth.jwt() ->> 'sub'));
drop policy if exists "users:self-update" on public."users";
create policy "users:self-update"  on public."users" for update using ("firebaseUid" = (select auth.jwt() ->> 'sub'));
drop policy if exists "users:self-delete" on public."users";
create policy "users:self-delete"  on public."users" for delete using ("firebaseUid" = (select auth.jwt() ->> 'sub'));

alter table public."groups" enable row level security;
drop policy if exists "groups:member-read" on public."groups";
create policy "groups:member-read"   on public."groups" for select using (public.is_group_member("id") or "createdBy" = (select auth.jwt() ->> 'sub'));
drop policy if exists "groups:create" on public."groups";
create policy "groups:create"        on public."groups" for insert with check ("createdBy" = (select auth.jwt() ->> 'sub'));
drop policy if exists "groups:admin-update" on public."groups";
create policy "groups:admin-update"  on public."groups" for update using (public.is_group_admin("id") or "createdBy" = (select auth.jwt() ->> 'sub'));
drop policy if exists "groups:creator-delete" on public."groups";
create policy "groups:creator-delete" on public."groups" for delete using ("createdBy" = (select auth.jwt() ->> 'sub'));

alter table public."groupMembers" enable row level security;
drop policy if exists "groupMembers:member-read" on public."groupMembers";
create policy "groupMembers:member-read" on public."groupMembers" for select using (
  public.is_group_member("gid")
  or "firebaseUid" = (select auth.jwt() ->> 'sub')
);
-- join via a live invite, or creator/admin invites a member/demo buddy.
-- Split groups (RoamSplit) are more collaborative: any member can add other
-- members, and a signed-in user who knows the split id can join themselves.
drop policy if exists "groupMembers:join-or-create" on public."groupMembers";
create policy "groupMembers:join-or-create" on public."groupMembers" for insert with check (
  ("firebaseUid" = (select auth.jwt() ->> 'sub') and exists (select 1 from public."groupInvitations" i where i."gid" = "gid" and not i."revoked"))
  or public.is_group_admin("gid")
  or exists (select 1 from public."groups" g where g."id" = "gid" and g."createdBy" = (select auth.jwt() ->> 'sub'))
  or (public.is_group_member("gid") and public.is_split_group("gid"))
  or ("firebaseUid" = (select auth.jwt() ->> 'sub') and public.is_split_group("gid"))
);
-- self update (e.g. lastReadAt) + admin/creator management (roles, member fields)
drop policy if exists "groupMembers:update" on public."groupMembers";
create policy "groupMembers:update" on public."groupMembers" for update using (
  "firebaseUid" = (select auth.jwt() ->> 'sub')
  or public.is_group_admin("gid")
  or exists (select 1 from public."groups" g where g."id" = "gid" and g."createdBy" = (select auth.jwt() ->> 'sub'))
);
drop policy if exists "groupMembers:self-or-admin-delete" on public."groupMembers";
create policy "groupMembers:self-or-admin-delete" on public."groupMembers" for delete using (
  "firebaseUid" = (select auth.jwt() ->> 'sub')
  or public.is_group_admin("gid")
  or exists (select 1 from public."groups" g where g."id" = "gid" and g."createdBy" = (select auth.jwt() ->> 'sub'))
);

alter table public."groupInvitations" enable row level security;
drop policy if exists "invites:lookup" on public."groupInvitations";
create policy "invites:lookup"   on public."groupInvitations" for select using (not "revoked");
drop policy if exists "invites:create" on public."groupInvitations";
create policy "invites:create"   on public."groupInvitations" for insert with check ("createdBy" = (select auth.jwt() ->> 'sub'));
drop policy if exists "invites:revoke" on public."groupInvitations";
create policy "invites:revoke"   on public."groupInvitations" for update using ("createdBy" = (select auth.jwt() ->> 'sub'));
drop policy if exists "invites:delete" on public."groupInvitations";
create policy "invites:delete"   on public."groupInvitations" for delete using ("createdBy" = (select auth.jwt() ->> 'sub'));

alter table public."messages" enable row level security;
drop policy if exists "messages:member-read" on public."messages";
create policy "messages:member-read"   on public."messages" for select using (public.is_group_member("gid"));
drop policy if exists "messages:member-insert" on public."messages";
create policy "messages:member-insert" on public."messages" for insert with check (public.is_group_member("gid"));
-- collaborative (pin/reactions) + own edits for everyone
drop policy if exists "messages:member-update" on public."messages";
create policy "messages:member-update" on public."messages" for update using (public.is_group_member("gid"));
drop policy if exists "messages:delete" on public."messages";
create policy "messages:delete" on public."messages" for delete using ("uid" = (select auth.jwt() ->> 'sub') or public.is_group_admin("gid"));

alter table public."polls" enable row level security;
drop policy if exists "polls:member-read" on public."polls";
create policy "polls:member-read"   on public."polls" for select using (public.is_group_member("gid"));
drop policy if exists "polls:member-insert" on public."polls";
create policy "polls:member-insert" on public."polls" for insert with check (public.is_group_member("gid"));
drop policy if exists "polls:member-update" on public."polls";
create policy "polls:member-update" on public."polls" for update using (public.is_group_member("gid"));
drop policy if exists "polls:delete" on public."polls";
create policy "polls:delete"        on public."polls" for delete using (public.is_group_member("gid"));

alter table public."places" enable row level security;
drop policy if exists "places:member-read" on public."places";
create policy "places:member-read"   on public."places" for select using (public.is_group_member("gid"));
drop policy if exists "places:member-insert" on public."places";
create policy "places:member-insert" on public."places" for insert with check (public.is_group_member("gid"));
drop policy if exists "places:member-update" on public."places";
create policy "places:member-update" on public."places" for update using (public.is_group_member("gid"));
drop policy if exists "places:delete" on public."places";
create policy "places:delete"        on public."places" for delete using (public.is_group_member("gid"));

alter table public."announcements" enable row level security;
drop policy if exists "announcements:member-read" on public."announcements";
create policy "announcements:member-read"   on public."announcements" for select using (public.is_group_member("gid"));
drop policy if exists "announcements:member-insert" on public."announcements";
create policy "announcements:member-insert" on public."announcements" for insert with check (public.is_group_member("gid"));
drop policy if exists "announcements:member-update" on public."announcements";
create policy "announcements:member-update" on public."announcements" for update using (public.is_group_member("gid"));
drop policy if exists "announcements:delete" on public."announcements";
create policy "announcements:delete"        on public."announcements" for delete using (public.is_group_member("gid"));

alter table public."groupTopics" enable row level security;
drop policy if exists "topics:member-read" on public."groupTopics";
create policy "topics:member-read"   on public."groupTopics" for select using (public.is_group_member("gid"));
drop policy if exists "topics:member-insert" on public."groupTopics";
create policy "topics:member-insert" on public."groupTopics" for insert with check (public.is_group_member("gid"));
drop policy if exists "topics:member-update" on public."groupTopics";
create policy "topics:member-update" on public."groupTopics" for update using (public.is_group_member("gid"));
drop policy if exists "topics:delete" on public."groupTopics";
create policy "topics:delete"        on public."groupTopics" for delete using (public.is_group_member("gid"));

alter table public."groupItineraries" enable row level security;
drop policy if exists "itineraries:member-read" on public."groupItineraries";
create policy "itineraries:member-read"   on public."groupItineraries" for select using (public.is_group_member("gid"));
drop policy if exists "itineraries:member-write" on public."groupItineraries";
create policy "itineraries:member-write"  on public."groupItineraries" for insert with check (public.is_group_member("gid"));
drop policy if exists "itineraries:member-update" on public."groupItineraries";
create policy "itineraries:member-update" on public."groupItineraries" for update using (public.is_group_member("gid"));

alter table public."finalPlans" enable row level security;
drop policy if exists "finalPlans:member-read" on public."finalPlans";
create policy "finalPlans:member-read"   on public."finalPlans" for select using (public.is_group_member("gid"));
drop policy if exists "finalPlans:member-write" on public."finalPlans";
create policy "finalPlans:member-write"  on public."finalPlans" for insert with check (public.is_group_member("gid"));
drop policy if exists "finalPlans:member-update" on public."finalPlans";
create policy "finalPlans:member-update" on public."finalPlans" for update using (public.is_group_member("gid"));

alter table public."sharedFiles" enable row level security;
drop policy if exists "files:member-read" on public."sharedFiles";
create policy "files:member-read"   on public."sharedFiles" for select using (public.is_group_member("gid"));
drop policy if exists "files:member-insert" on public."sharedFiles";
create policy "files:member-insert" on public."sharedFiles" for insert with check (public.is_group_member("gid"));
drop policy if exists "files:member-update" on public."sharedFiles";
create policy "files:member-update" on public."sharedFiles" for update using (public.is_group_member("gid"));
drop policy if exists "files:delete" on public."sharedFiles";
create policy "files:delete"        on public."sharedFiles" for delete using (public.is_group_member("gid"));

alter table public."groupActivity" enable row level security;
drop policy if exists "activity:member-read" on public."groupActivity";
create policy "activity:member-read"   on public."groupActivity" for select using (public.is_group_member("gid"));
drop policy if exists "activity:member-insert" on public."groupActivity";
create policy "activity:member-insert" on public."groupActivity" for insert with check (public.is_group_member("gid"));

alter table public."expenses" enable row level security;
drop policy if exists "expenses:member-read" on public."expenses";
create policy "expenses:member-read"   on public."expenses" for select using (public.is_group_member("gid"));
drop policy if exists "expenses:member-insert" on public."expenses";
create policy "expenses:member-insert" on public."expenses" for insert with check (public.is_group_member("gid"));
drop policy if exists "expenses:member-update" on public."expenses";
create policy "expenses:member-update" on public."expenses" for update using (public.is_group_member("gid"));
drop policy if exists "expenses:delete" on public."expenses";
create policy "expenses:delete"        on public."expenses" for delete using (public.is_group_member("gid"));

alter table public."settlements" enable row level security;
drop policy if exists "settlements:member-read" on public."settlements";
create policy "settlements:member-read"   on public."settlements" for select using (public.is_group_member("gid"));
drop policy if exists "settlements:member-insert" on public."settlements";
create policy "settlements:member-insert" on public."settlements" for insert with check (public.is_group_member("gid"));
drop policy if exists "settlements:member-update" on public."settlements";
create policy "settlements:member-update" on public."settlements" for update using (public.is_group_member("gid"));
drop policy if exists "settlements:delete" on public."settlements";
create policy "settlements:delete"        on public."settlements" for delete using (public.is_group_member("gid"));

alter table public."notifications" enable row level security;
drop policy if exists "notifs:self-read" on public."notifications";
create policy "notifs:self-read"   on public."notifications" for select using ("firebaseUid" = (select auth.jwt() ->> 'sub'));
drop policy if exists "notifs:self-update" on public."notifications";
create policy "notifs:self-update" on public."notifications" for update using ("firebaseUid" = (select auth.jwt() ->> 'sub'));
drop policy if exists "notifs:self-delete" on public."notifications";
create policy "notifs:self-delete" on public."notifications" for delete using ("firebaseUid" = (select auth.jwt() ->> 'sub'));

-- ============================================================================
-- 4 · GRANTS (defaults usually cover this; explicit is safer)
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- ============================================================================
-- 5 · REALTIME — publish every app-data table (idempotent)
-- ============================================================================
do $$
  declare t text;
  begin
    foreach t in array array[
      'users','userProfiles','groups','groupMembers','groupInvitations','messages','polls','places',
      'groupTopics','groupItineraries','finalPlans','announcements','sharedFiles','expenses',
      'settlements','groupActivity','notifications'
    ]
    loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end $$;

-- ============================================================================
-- 6 · STORAGE buckets + policies
--   avatars     : public read, self-write (avatars/<firebaseUid>/...)
--   group-media : public read, member upload to group-media/<gid>/...
--   (chat-media, receipts, trip-files, documents: create in the dashboard with the
--    same member-write policy as group-media if you use them.)
-- ============================================================================
insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('group-media', 'group-media', true)
on conflict (id) do nothing;

drop policy if exists "avatars-public-read" on storage.objects;
create policy "avatars-public-read" on storage.objects
  for select using (bucket_id = 'avatars');
drop policy if exists "avatars-self-insert" on storage.objects;
create policy "avatars-self-insert" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub'));
drop policy if exists "avatars-self-update" on storage.objects;
create policy "avatars-self-update" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub'));
drop policy if exists "avatars-self-delete" on storage.objects;
create policy "avatars-self-delete" on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub'));

drop policy if exists "group-media-member-read" on storage.objects;
create policy "group-media-member-read" on storage.objects
  for select using (bucket_id = 'group-media');
drop policy if exists "group-media-member-insert" on storage.objects;
create policy "group-media-member-insert" on storage.objects
  for insert with check (bucket_id = 'group-media' and public.is_group_member((storage.foldername(name))[1]));
drop policy if exists "group-media-member-update" on storage.objects;
create policy "group-media-member-update" on storage.objects
  for update using (bucket_id = 'group-media' and public.is_group_member((storage.foldername(name))[1]));
drop policy if exists "group-media-member-delete" on storage.objects;
create policy "group-media-member-delete" on storage.objects
  for delete using (bucket_id = 'group-media' and public.is_group_member((storage.foldername(name))[1]));