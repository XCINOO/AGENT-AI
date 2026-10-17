-- Unknown AI - migration 001: user profiles (phone + language) and RLS hardening
-- Safe to run more than once. Does NOT delete or rewrite existing chats/messages/users.
-- Run AFTER schema.sql. Rollback: migration_001_rollback.sql
--
-- Identity model: auth.users.id (Supabase Auth) stays the single authoritative user id.
-- public.profiles.id is that same uuid (primary key + FK) - no second identity system.
-- Email + email verification status are NOT copied: they live in auth.users
-- (email, email_confirmed_at) and are set only by Supabase Auth after a valid OTP.

create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  phone             text,
  phone_verified    boolean not null default false,
  phone_verified_at timestamptz,
  language          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint profiles_phone_e164 check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  constraint profiles_language_ok check (language is null or language in ('fa','en')),
  constraint profiles_verified_needs_phone check (not phone_verified or phone is not null)
);

comment on table public.profiles is 'Private per-user profile. phone is stored UNVERIFIED unless an SMS provider sets phone_verified via service role.';

-- Not unique on purpose: an unverified number must not let one user block another from registering it.
-- Make it a UNIQUE partial index (where phone_verified) once SMS verification exists.
create index if not exists profiles_phone_idx on public.profiles(phone) where phone is not null;

alter table public.profiles enable row level security;

drop policy if exists "own profile select" on public.profiles;
create policy "own profile select" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
-- Deliberately NO insert/update/delete policies for clients: all writes go through the
-- security-definer functions below, so verification fields can never be set from the browser.

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

-- ---------------------------------------------------------------- helpers
create or replace function public.normalize_phone_e164(p text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p is null then null
    when regexp_replace(p, '[\s\-\(\)\.]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$'
      then regexp_replace(p, '[\s\-\(\)\.]', '', 'g')
    else null end
$$;

-- keep updated_at fresh; a changed phone is never verified
create or replace function public.profiles_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.phone is distinct from old.phone and new.phone_verified is not distinct from old.phone_verified then
    new.phone_verified := false;
    new.phone_verified_at := null;
  end if;
  return new;
end $$;

drop trigger if exists profiles_before_update on public.profiles;
create trigger profiles_before_update before update on public.profiles
  for each row execute function public.profiles_before_update();

-- ---------------------------------------------------------------- client API
-- The only way a signed-in user writes their profile. Identity comes from the verified JWT (auth.uid()),
-- never from a parameter. Passing NULL leaves that field unchanged.
create or replace function public.upsert_my_profile(p_phone text default null, p_language text default null)
returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  ph  text := null;
  rec public.profiles;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_phone is not null then
    ph := public.normalize_phone_e164(p_phone);
    if ph is null then
      raise exception 'invalid phone number' using errcode = '22023';
    end if;
  end if;
  if p_language is not null and p_language not in ('fa','en') then
    raise exception 'invalid language' using errcode = '22023';
  end if;

  insert into public.profiles(id, phone, language)
  values (uid, ph, p_language)
  on conflict (id) do update
    set phone    = coalesce(excluded.phone, public.profiles.phone),
        language = coalesce(excluded.language, public.profiles.language)
  returning * into rec;
  return rec;
end $$;

revoke all on function public.upsert_my_profile(text, text) from public, anon;
grant execute on function public.upsert_my_profile(text, text) to authenticated;

-- ---------------------------------------------------------------- new signups
-- Copies the (unverified, user-supplied) phone/language from signup metadata into profiles.
-- Never raises: a bad value is ignored so sign-in can never break because of the profile.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ph text := public.normalize_phone_e164(new.raw_user_meta_data ->> 'phone');
  lg text := new.raw_user_meta_data ->> 'language';
begin
  if lg is not null and lg not in ('fa','en') then lg := null; end if;
  insert into public.profiles(id, phone, language) values (new.id, ph, lg)
  on conflict (id) do nothing;
  return new;
exception when others then
  return new;
end $$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- existing users
-- One empty profile per existing user (phone stays NULL, unverified). Existing logins are untouched.
insert into public.profiles(id)
select u.id from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------- RLS hardening (existing tables)
-- A message may only be inserted into a chat the same user owns (previously only user_id was checked).
drop policy if exists "own messages insert" on public.messages;
create policy "own messages insert" on public.messages for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.chats c where c.id = chat_id and c.user_id = (select auth.uid()))
  );

-- the app reads chats ordered by created_at and messages by chat_id+created_at
create index if not exists chats_user_created_idx on public.chats(user_id, created_at desc);
create index if not exists messages_chat_created_idx on public.messages(chat_id, created_at);
