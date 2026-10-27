-- Apply once to a NEW Supabase project. No records or images from Sites are migrated.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create table public.members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check (role in ('admin','worker')),
 display_name text not null default ''
);
alter table public.members enable row level security;
create function private.is_operation_member() returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.members m join auth.users u on u.id=m.user_id where m.user_id=auth.uid() and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()))$$;
create function private.is_operation_admin() returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.members m join auth.users u on u.id=m.user_id where m.user_id=auth.uid() and m.role='admin' and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()))$$;
revoke all on function private.is_operation_member() from public;
revoke all on function private.is_operation_admin() from public;
grant execute on function private.is_operation_member(),private.is_operation_admin() to authenticated;
create policy member_read on public.members for select to authenticated using((select private.is_operation_member()) and (user_id=(select auth.uid()) or (select private.is_operation_admin())));
grant select on public.members to authenticated;
-- New confirmed accounts receive worker access; admin assignment stays server-side.
create function private.enroll_confirmed_worker() returns trigger language plpgsql security definer set search_path='' as $$ begin if new.email_confirmed_at is not null and (new.banned_until is null or new.banned_until<=now()) then insert into public.members(user_id,role,display_name) values(new.id,'worker','') on conflict(user_id) do nothing; end if; return new; end; $$;
revoke all on function private.enroll_confirmed_worker() from public,anon,authenticated;
create trigger enroll_confirmed_worker after insert or update of email_confirmed_at,email,banned_until on auth.users for each row execute function private.enroll_confirmed_worker();
insert into public.members(user_id,role,display_name) select u.id,'worker','' from auth.users u where u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()) on conflict(user_id) do nothing;
-- No client-side membership writes or promotions to administrator.
create table public.operations (
 id text primary key check(id ~ '^[a-f0-9-]{36}$'),
 author_id uuid not null references auth.users(id),
 date date not null check(date<=current_date),
 created timestamptz not null default now(),
 name text not null check(length(trim(name)) between 1 and 160),
 team text not null check(length(trim(team)) between 1 and 160),
 street text not null check(length(trim(street)) between 1 and 160),
 neighborhood text not null check(length(trim(neighborhood)) between 1 and 160),
 segment text not null check(length(trim(segment)) between 1 and 200),
 notes text not null default '' check(length(notes)<=1000),
 photos text[] not null check(cardinality(photos) between 1 and 3 and array_position(photos,null) is null)
);
create index operations_date on public.operations(date);
create index operations_author_date on public.operations(author_id,date);
alter table public.operations enable row level security;
create function private.operation_owns_photos(paths text[],operation_id text) returns boolean language sql stable set search_path='' as $$select not exists(select 1 from unnest(paths) p where p is null or p not like auth.uid()::text||'/'||operation_id||'/%' or not exists(select 1 from storage.objects o where o.bucket_id='evidencias' and o.name=p))$$;
revoke all on function private.operation_owns_photos(text[],text) from public;
grant execute on function private.operation_owns_photos(text[],text) to authenticated;
create policy operation_read on public.operations for select to authenticated using((select private.is_operation_member()) and (author_id=(select auth.uid()) or (select private.is_operation_admin())));
create policy operation_insert on public.operations for insert to authenticated with check((select private.is_operation_member()) and author_id=(select auth.uid()) and private.operation_owns_photos(photos,id));
grant select,insert on public.operations to authenticated;
-- No update/delete policies for completed records.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('evidencias','evidencias',false,1200000,array['image/jpeg']);
create policy evidence_read on storage.objects for select to authenticated using(bucket_id='evidencias' and private.is_operation_member() and (split_part(name,'/',1)=auth.uid()::text or private.is_operation_admin()));
create policy evidence_insert on storage.objects for insert to authenticated with check(bucket_id='evidencias' and private.is_operation_member() and split_part(name,'/',1)=auth.uid()::text and not exists(select 1 from public.operations where id=split_part(name,'/',2)));
create policy evidence_update on storage.objects for update to authenticated using(bucket_id='evidencias' and private.is_operation_member() and split_part(name,'/',1)=auth.uid()::text and not exists(select 1 from public.operations where id=split_part(name,'/',2))) with check(bucket_id='evidencias' and private.is_operation_member() and split_part(name,'/',1)=auth.uid()::text and not exists(select 1 from public.operations where id=split_part(name,'/',2)));
commit;
-- Create users through Authentication / Users, then authorize each user explicitly:
-- insert into public.members(user_id,role,display_name) values('<auth user UUID>','admin','Responsável');
-- Worker enrollment is automatic. Workers see their own records; the admin sees all.
