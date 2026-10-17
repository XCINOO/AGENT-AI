-- Rollback for migration_001_profiles.sql
-- WARNING: dropping public.profiles DELETES stored phone numbers / language preferences.
-- Export first if you need them:  copy (select * from public.profiles) to stdout with csv header;
-- chats, messages and auth.users are NOT touched.

drop trigger if exists on_auth_user_created_profile on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.upsert_my_profile(text, text);
drop trigger if exists profiles_before_update on public.profiles;
drop function if exists public.profiles_before_update();
drop function if exists public.normalize_phone_e164(text);
drop table if exists public.profiles;

-- restore the original (weaker) messages insert policy from schema.sql
drop policy if exists "own messages insert" on public.messages;
create policy "own messages insert" on public.messages for insert to authenticated with check ((select auth.uid())=user_id);

drop index if exists public.chats_user_created_idx;
drop index if exists public.messages_chat_created_idx;
