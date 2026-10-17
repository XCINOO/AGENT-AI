-- Unknown AI - Supabase schema
create extension if not exists pgcrypto;

create table if not exists public.chats (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null default 'گفتگوی جدید',
 created_at timestamptz not null default now()
);

create table if not exists public.messages (
 id uuid primary key default gen_random_uuid(),
 chat_id uuid not null references public.chats(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('user','ai')),
 content text not null,
 created_at timestamptz not null default now()
);

create index if not exists chats_user_id_idx on public.chats(user_id);
create index if not exists messages_chat_id_idx on public.messages(chat_id);
create index if not exists messages_user_id_idx on public.messages(user_id);

alter table public.chats enable row level security;
alter table public.messages enable row level security;

drop policy if exists "own chats select" on public.chats;
create policy "own chats select" on public.chats for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "own chats insert" on public.chats;
create policy "own chats insert" on public.chats for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists "own chats update" on public.chats;
create policy "own chats update" on public.chats for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists "own chats delete" on public.chats;
create policy "own chats delete" on public.chats for delete to authenticated using ((select auth.uid())=user_id);

drop policy if exists "own messages select" on public.messages;
create policy "own messages select" on public.messages for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "own messages insert" on public.messages;
create policy "own messages insert" on public.messages for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists "own messages delete" on public.messages;
create policy "own messages delete" on public.messages for delete to authenticated using ((select auth.uid())=user_id);
