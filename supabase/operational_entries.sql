-- Additive extension for Demandas and Lavagem. Existing varricao records are unchanged.
create table public.operational_entries (
 id uuid primary key,
 author_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 service_type text not null check (service_type in ('demand','washing')),
 service_date date not null,
 status text not null default 'planned' check (status in ('planned','in_progress','completed','pending','cancelled')),
 priority text not null default 'normal' check (priority in ('normal','high','urgent')),
 title text not null check (length(trim(title)) between 1 and 160),
 service text not null check (length(trim(service)) between 1 and 80),
 location text not null check (length(trim(location)) between 1 and 200),
 neighborhood text not null default '' check (length(neighborhood)<=120),
 segment text not null default '' check (length(segment)<=200),
 requester text not null default '' check (length(requester)<=160),
 protocol text not null default '' check (length(protocol)<=100),
 responsible text not null check (length(trim(responsible)) between 1 and 160),
 team text not null check (length(trim(team)) between 1 and 160),
 headcount smallint check (headcount between 1 and 300),
 description text not null default '' check (length(description)<=2000),
 notes text not null default '' check (length(notes)<=2000),
 vehicle text not null default '' check (length(vehicle)<=80),
 driver text not null default '' check (length(driver)<=160),
 helpers text not null default '' check (length(helpers)<=300),
 washing_target text not null default '' check (washing_target in ('','Praça','Parque','Feira livre','Via pública','Outro')),
 start_time time(0),
 end_time time(0),
 overnight boolean not null default false,
 water_liters integer check (water_liters between 0 and 1000000),
 refills smallint check (refills between 0 and 100),
 quantity numeric(14,2) check (quantity between 0 and 1000000000),
 unit text not null default '',
 photos text[] not null default '{}' check (cardinality(photos) between 0 and 3 and array_position(photos,null) is null),
 constraint washing_vehicle_required check (service_type<>'washing' or (length(trim(vehicle))>0 and length(trim(driver))>0 and washing_target<>'')),
 constraint field_quantity_unit check ((quantity is null and unit='') or (quantity is not null and unit in ('m²','m','kg','sacos','unidades','locais'))),
 constraint field_overnight_times check (not overnight or (start_time is not null and end_time is not null)),
 constraint field_time_order check (start_time is null or end_time is null or ((not overnight and end_time>=start_time) or (overnight and end_time<=start_time)))
);
alter table public.operational_entries enable row level security;
revoke all on public.operational_entries from public,anon,authenticated;
grant select,insert,update on public.operational_entries to authenticated;
grant all on public.operational_entries to service_role;
create index operational_entries_date_id on public.operational_entries(service_date,id);
create index operational_entries_author_date_id on public.operational_entries(author_id,service_date,id);

create policy field_entry_read on public.operational_entries for select to authenticated
 using ((select private.is_operation_member()) and (author_id=(select auth.uid()) or (select private.is_operation_admin())));
create policy field_entry_insert on public.operational_entries for insert to authenticated
 with check ((select private.is_operation_member()) and author_id=(select auth.uid()) and private.operation_owns_photos(photos,id::text));
create policy field_entry_update on public.operational_entries for update to authenticated
 using ((select private.is_operation_member()) and (author_id=(select auth.uid()) or (select private.is_operation_admin())))
 with check ((select private.is_operation_member()) and (author_id=(select auth.uid()) or (select private.is_operation_admin())));

create function private.guard_operational_entry() returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if TG_OP='UPDATE' and (new.id is distinct from old.id or new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at or new.service_type is distinct from old.service_type or new.photos is distinct from old.photos) then
  raise exception 'Identidade, autoria, criacao e evidencias sao imutaveis' using errcode='23514';
 end if;
 if new.status='completed' and new.service_date>(now() at time zone 'America/Sao_Paulo')::date then
  raise exception 'Servico futuro ainda nao pode ser concluido' using errcode='23514';
 end if;
 if TG_OP='INSERT' then new.created_at=clock_timestamp(); end if;
 new.updated_at=clock_timestamp();
 return new;
end;
$$;
revoke all on function private.guard_operational_entry() from public,anon;
grant execute on function private.guard_operational_entry() to authenticated,service_role;
create trigger guard_operational_entry before insert or update on public.operational_entries
 for each row execute function private.guard_operational_entry();

-- Extra restrictive policies preserve evidence after the new entry is saved.
-- Existing storage permissions still determine who may upload.
create policy field_evidence_insert_lock on storage.objects as restrictive for insert to authenticated
 with check (bucket_id<>'evidencias' or not exists(select 1 from public.operational_entries e where e.id::text=split_part(storage.objects.name,'/',2)));
create policy field_evidence_update_lock on storage.objects as restrictive for update to authenticated
 using (bucket_id<>'evidencias' or not exists(select 1 from public.operational_entries e where e.id::text=split_part(storage.objects.name,'/',2)))
 with check (bucket_id<>'evidencias' or not exists(select 1 from public.operational_entries e where e.id::text=split_part(storage.objects.name,'/',2)));
