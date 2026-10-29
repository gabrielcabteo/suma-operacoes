-- Additive washing pilot; legacy operations and evidence are preserved.
create table public.pipa_teams(
 id text primary key check(id in ('pipa-1','pipa-2')),
 name text not null check(length(trim(name)) between 1 and 80),
 driver text not null default '' check(length(driver)<=160),
 vehicle text not null default '' check(length(vehicle)<=80),
 helpers text not null default '' check(length(helpers)<=300),
 updated_at timestamptz not null default now()
);
insert into public.pipa_teams(id,name) values('pipa-1','Equipe Pipa 1'),('pipa-2','Equipe Pipa 2');
create table public.pipa_members(
 user_id uuid primary key references public.members(user_id),
 team_id text not null references public.pipa_teams(id),
 updated_at timestamptz not null default now()
);
create index pipa_members_team on public.pipa_members(team_id);
create function private.pipa_team_access(p_team text) returns boolean language sql stable security invoker set search_path=''
as $$select (select private.is_operation_member()) and exists(select 1 from public.pipa_members m where m.user_id=(select auth.uid()) and m.team_id=p_team)$$;
revoke all on function private.pipa_team_access(text) from public,anon;
grant execute on function private.pipa_team_access(text) to authenticated;
create table public.pipa_jobs(
 id uuid primary key default gen_random_uuid(),
 team_id text not null references public.pipa_teams(id),
 service_date date not null,
 sequence integer not null default 1 check(sequence between 0 and 10000),
 title text not null check(length(trim(title)) between 1 and 160),
 location text not null check(length(trim(location)) between 1 and 200),
 neighborhood text not null default '' check(length(neighborhood)<=120),
 target text not null default 'Outro' check(target in ('Praça','Parque','Feira livre','Via pública','Outro')),
 notes text not null default '' check(length(notes)<=2000),
 priority text not null default 'normal' check(priority in ('normal','high','urgent')),
 source_ref text not null default '' check(length(source_ref)<=120),
 source_file text not null default '' check(length(source_file)<=240),
 dedupe_key text not null unique,
 published boolean not null default false,
 cancelled boolean not null default false,
 author_id uuid not null default auth.uid() references public.members(user_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index pipa_jobs_date on public.pipa_jobs(service_date,team_id,sequence);
create index pipa_jobs_author on public.pipa_jobs(author_id);
create table public.pipa_visits(
 id uuid primary key,
 job_id uuid unique references public.pipa_jobs(id),
 team_id text not null references public.pipa_teams(id),
 author_id uuid not null default auth.uid() references public.members(user_id),
 updated_by uuid not null default auth.uid() references public.members(user_id),
 mutation_id uuid not null,
 service_date date not null,
 title text not null check(length(trim(title)) between 1 and 160),
 location text not null check(length(trim(location)) between 1 and 200),
 neighborhood text not null default '' check(length(neighborhood)<=120),
 target text not null check(target in ('Praça','Parque','Feira livre','Via pública','Outro')),
 driver text not null check(length(trim(driver)) between 1 and 160),
 vehicle text not null check(length(trim(vehicle)) between 1 and 80),
 helpers text not null default '' check(length(helpers)<=300),
 responsible text not null check(length(trim(responsible)) between 1 and 160),
 headcount integer check(headcount between 1 and 300),
 status text not null check(status in ('in_progress','completed','partial','pending','cancelled')),
 started_at timestamptz,
 finished_at timestamptz,
 water_liters integer check(water_liters between 0 and 1000000),
 refills integer check(refills between 0 and 100),
 notes text not null default '' check(length(notes)<=2000),
 photo_justification text not null default '' check(length(photo_justification)<=1000),
 photos_before text[] not null default '{}' check(cardinality(photos_before)<=2 and array_position(photos_before,null) is null),
 photos_after text[] not null default '{}' check(cardinality(photos_after)<=3 and array_position(photos_after,null) is null),
 latitude double precision check(latitude between -90 and 90),
 longitude double precision check(longitude between -180 and 180),
 accuracy_m double precision check(accuracy_m between 0 and 10000000),
 location_captured_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint pipa_coordinate_pair check((latitude is null)=(longitude is null)),
 constraint pipa_time_order check(finished_at is null or (started_at is not null and finished_at>=started_at)),
 constraint pipa_started_required check(status not in ('in_progress','completed','partial') or started_at is not null),
 constraint pipa_finished_required check(status not in ('completed','partial') or finished_at is not null),
 constraint pipa_after_evidence check(status not in ('completed','partial') or cardinality(photos_after)>0 or length(trim(photo_justification))>=10),
 constraint pipa_occurrence_reason check(status not in ('partial','pending','cancelled') or length(trim(notes))>=3)
);
create index pipa_visits_date on public.pipa_visits(service_date,team_id);
create index pipa_visits_team on public.pipa_visits(team_id);
create index pipa_visits_author on public.pipa_visits(author_id);
create index pipa_visits_updated_by on public.pipa_visits(updated_by);
create table public.pipa_audit(
 id bigint generated always as identity primary key,
 entity text not null,
 entity_id text not null,
 team_id text,
 action text not null,
 actor_id uuid not null,
 actor_name text not null,
 occurred_at timestamptz not null default clock_timestamp(),
 before_data jsonb,
 after_data jsonb
);
create index pipa_audit_entity on public.pipa_audit(entity,entity_id,id desc);
create index pipa_audit_team on public.pipa_audit(team_id);

alter table public.pipa_teams enable row level security;
alter table public.pipa_members enable row level security;
alter table public.pipa_jobs enable row level security;
alter table public.pipa_visits enable row level security;
alter table public.pipa_audit enable row level security;
revoke all on public.pipa_teams,public.pipa_members,public.pipa_jobs,public.pipa_visits,public.pipa_audit from public,anon,authenticated;
grant select,update on public.pipa_teams to authenticated;
grant select,insert,update,delete on public.pipa_members to authenticated;
grant select,insert,update on public.pipa_jobs,public.pipa_visits to authenticated;
grant select on public.pipa_audit to authenticated;
grant all on public.pipa_teams,public.pipa_members,public.pipa_jobs,public.pipa_visits,public.pipa_audit to service_role;

create policy pipa_members_read on public.pipa_members for select to authenticated using((select private.is_operation_member()) and(user_id=(select auth.uid()) or(select private.is_operation_admin())));
create policy pipa_members_insert on public.pipa_members for insert to authenticated with check((select private.is_operation_admin()));
create policy pipa_members_update on public.pipa_members for update to authenticated using((select private.is_operation_admin())) with check((select private.is_operation_admin()));
create policy pipa_members_delete on public.pipa_members for delete to authenticated using((select private.is_operation_admin()));
create policy pipa_teams_read on public.pipa_teams for select to authenticated using((select private.is_operation_member()) and((select private.is_operation_admin()) or private.pipa_team_access(id)));
create policy pipa_teams_update on public.pipa_teams for update to authenticated using((select private.is_operation_admin())) with check((select private.is_operation_admin()));
create policy pipa_jobs_read on public.pipa_jobs for select to authenticated using((select private.is_operation_member()) and((select private.is_operation_admin()) or(published and private.pipa_team_access(team_id))));
create policy pipa_jobs_insert on public.pipa_jobs for insert to authenticated with check((select private.is_operation_admin()) and author_id=(select auth.uid()));
create policy pipa_jobs_update on public.pipa_jobs for update to authenticated using((select private.is_operation_admin())) with check((select private.is_operation_admin()));
create policy pipa_visits_read on public.pipa_visits for select to authenticated using((select private.is_operation_member()) and((select private.is_operation_admin()) or private.pipa_team_access(team_id)));
create policy pipa_visits_insert on public.pipa_visits for insert to authenticated with check((select private.is_operation_member()) and author_id=(select auth.uid()) and((select private.is_operation_admin()) or private.pipa_team_access(team_id)));
create policy pipa_visits_update on public.pipa_visits for update to authenticated using((select private.is_operation_member()) and((select private.is_operation_admin()) or private.pipa_team_access(team_id))) with check((select private.is_operation_member()) and((select private.is_operation_admin()) or private.pipa_team_access(team_id)));
create policy pipa_audit_read on public.pipa_audit for select to authenticated using((select private.is_operation_member()) and((select private.is_operation_admin()) or(team_id is not null and private.pipa_team_access(team_id))));

create function private.pipa_normalize(p_text text) returns text language sql immutable security invoker set search_path=''
as $$select lower(regexp_replace(translate(trim(coalesce(p_text,'')),'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),'\s+',' ','g'))$$;
create function private.guard_pipa_job() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not private.is_operation_admin() then raise exception 'Somente o administrador programa os servicos' using errcode='42501'; end if;
 if TG_OP='UPDATE' then
  if new.id<>old.id or new.author_id<>old.author_id or new.created_at<>old.created_at then raise exception 'Identidade e autoria preservadas' using errcode='23514';end if;
  if exists(select 1 from public.pipa_visits v where v.job_id=old.id) and to_jsonb(new)-'updated_at' is distinct from to_jsonb(old)-'updated_at' then raise exception 'Atendimento iniciado: preserve a programacao original' using errcode='23514';end if;
 else new.author_id=auth.uid();new.created_at=clock_timestamp();end if;
 new.dedupe_key=case when trim(new.source_ref)<>'' then 'ref:'||to_char(new.service_date,'YYYY-MM')||':'||private.pipa_normalize(new.source_ref) else 'local:'||md5(to_char(new.service_date,'YYYY-MM-DD')||'|'||new.team_id||'|'||private.pipa_normalize(new.location)) end;
 new.updated_at=clock_timestamp();
 return new;
end $$;
create trigger guard_pipa_job before insert or update on public.pipa_jobs for each row execute function private.guard_pipa_job();
create function private.guard_pipa_visit() returns trigger language plpgsql security invoker set search_path='' as $$
declare fresh text[]; j public.pipa_jobs; all_photos text[];
begin
 if not private.is_operation_member() then raise exception 'Conta indisponivel' using errcode='42501';end if;
 if TG_OP='UPDATE' then
  if new.id<>old.id or new.author_id<>old.author_id or new.created_at<>old.created_at or new.team_id<>old.team_id or new.job_id is distinct from old.job_id then raise exception 'Identidade, equipe e autoria preservadas' using errcode='23514';end if;
  if not(old.photos_before<@new.photos_before and old.photos_after<@new.photos_after) then raise exception 'As fotos originais devem ser preservadas' using errcode='23514';end if;
  select coalesce(array_agg(p),'{}'::text[]) into fresh from unnest(new.photos_before||new.photos_after) p where not(p=any(old.photos_before||old.photos_after));
 else
  new.author_id=auth.uid();new.created_at=clock_timestamp();fresh=new.photos_before||new.photos_after;
  if new.job_id is not null then
   select * into j from public.pipa_jobs where id=new.job_id for update;
   if not found or j.team_id<>new.team_id or not j.published or j.cancelled then raise exception 'Programacao indisponivel para iniciar' using errcode='42501';end if;
  end if;
 end if;
 all_photos=new.photos_before||new.photos_after;
 if cardinality(all_photos)<>(select count(distinct p) from unnest(all_photos) p) then raise exception 'Foto repetida' using errcode='23514';end if;
 if not private.operation_owns_photos(fresh,new.id::text) then raise exception 'Evidencia invalida' using errcode='42501';end if;
 if new.service_date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Um atendimento futuro ainda nao pode ser executado' using errcode='23514';end if;
 if new.started_at>now()+interval '10 minutes' or new.finished_at>now()+interval '10 minutes' then raise exception 'Confira o relogio do aparelho' using errcode='23514';end if;
 new.updated_by=auth.uid();new.updated_at=clock_timestamp();return new;
end $$;
create trigger guard_pipa_visit before insert or update on public.pipa_visits for each row execute function private.guard_pipa_visit();
create function private.audit_pipa_change() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb; a jsonb;t text;key text;who text;
begin
 if auth.uid() is null or not private.is_operation_member() then raise exception 'Autenticacao necessaria' using errcode='42501';end if;
 if TG_OP<>'INSERT' then b=to_jsonb(old);end if;
 if TG_OP<>'DELETE' then a=to_jsonb(new);end if;
 t=coalesce(a->>'team_id',b->>'team_id');key=coalesce(a->>'id',b->>'id',a->>'user_id',b->>'user_id');
 select coalesce(nullif(m.display_name,''),u.email,auth.uid()::text) into who from public.members m join auth.users u on u.id=m.user_id where m.user_id=auth.uid();
 insert into public.pipa_audit(entity,entity_id,team_id,action,actor_id,actor_name,before_data,after_data) values(TG_TABLE_NAME,key,t,TG_OP,auth.uid(),coalesce(who,auth.uid()::text),b,a);
 return coalesce(new,old);
end $$;
revoke all on function private.audit_pipa_change() from public,anon;
grant execute on function private.audit_pipa_change() to authenticated;
create trigger audit_pipa_jobs after insert or update on public.pipa_jobs for each row execute function private.audit_pipa_change();
create trigger audit_pipa_visits after insert or update on public.pipa_visits for each row execute function private.audit_pipa_change();
create trigger audit_pipa_members after insert or update or delete on public.pipa_members for each row execute function private.audit_pipa_change();
create trigger audit_pipa_teams after update on public.pipa_teams for each row execute function private.audit_pipa_change();
revoke all on function private.guard_pipa_job(),private.guard_pipa_visit(),private.pipa_normalize(text) from public,anon;
grant execute on function private.guard_pipa_job(),private.guard_pipa_visit(),private.pipa_normalize(text) to authenticated;

create function public.pipa_snapshot(p_month date) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare first_day date=date_trunc('month',p_month)::date; next_month date=(date_trunc('month',p_month)+interval '1 month')::date;
begin
 if not private.is_operation_member() then raise exception 'Conta indisponivel' using errcode='42501';end if;
 return jsonb_build_object('user_id',auth.uid(),'admin',private.is_operation_admin(),
 'teams',coalesce((select jsonb_agg(t order by t.id) from public.pipa_teams t),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(m) from public.pipa_members m),'[]'::jsonb),
 'jobs',coalesce((select jsonb_agg(j order by j.service_date,j.sequence,j.id) from public.pipa_jobs j where(j.service_date>=first_day and j.service_date<next_month) or exists(select 1 from public.pipa_visits v where v.job_id=j.id and v.service_date>=first_day and v.service_date<next_month)),'[]'::jsonb),
 'visits',coalesce((select jsonb_agg(v order by v.service_date,v.id) from public.pipa_visits v where(v.service_date>=first_day and v.service_date<next_month) or exists(select 1 from public.pipa_jobs j where j.id=v.job_id and j.service_date>=first_day and j.service_date<next_month)),'[]'::jsonb));
end $$;
create function public.save_pipa_visit(p_data jsonb,p_expected timestamptz,p_mutation uuid,p_previous uuid[] default '{}') returns public.pipa_visits language plpgsql security invoker set search_path='' as $$
declare candidate public.pipa_visits;current_row public.pipa_visits;result public.pipa_visits;present boolean;
begin
 if not private.is_operation_member() then raise exception 'Conta indisponivel' using errcode='42501';end if;
 candidate=jsonb_populate_record(null::public.pipa_visits,p_data);
 select * into current_row from public.pipa_visits where id=candidate.id for update;present=found;
 if present and current_row.mutation_id=p_mutation then return current_row;end if;
 if cardinality(p_previous)>50 then raise exception 'Atualize o atendimento antes de continuar' using errcode='40001';end if;
 if present and current_row.updated_at is distinct from p_expected and not(current_row.updated_by=auth.uid() and current_row.mutation_id=any(p_previous)) then raise exception 'Este atendimento foi alterado. Atualize antes de enviar.' using errcode='40001';end if;
 if not present and p_expected is not null then raise exception 'Atendimento indisponivel' using errcode='40001';end if;
 if present then
  update public.pipa_visits set service_date=candidate.service_date,title=candidate.title,location=candidate.location,neighborhood=coalesce(candidate.neighborhood,''),target=candidate.target,driver=candidate.driver,vehicle=candidate.vehicle,helpers=coalesce(candidate.helpers,''),responsible=candidate.responsible,headcount=candidate.headcount,status=candidate.status,started_at=candidate.started_at,finished_at=candidate.finished_at,water_liters=candidate.water_liters,refills=candidate.refills,notes=coalesce(candidate.notes,''),photo_justification=coalesce(candidate.photo_justification,''),photos_before=coalesce(candidate.photos_before,'{}'),photos_after=coalesce(candidate.photos_after,'{}'),latitude=candidate.latitude,longitude=candidate.longitude,accuracy_m=candidate.accuracy_m,location_captured_at=candidate.location_captured_at,mutation_id=p_mutation where id=current_row.id returning * into result;
 else
  insert into public.pipa_visits(id,job_id,team_id,mutation_id,service_date,title,location,neighborhood,target,driver,vehicle,helpers,responsible,headcount,status,started_at,finished_at,water_liters,refills,notes,photo_justification,photos_before,photos_after,latitude,longitude,accuracy_m,location_captured_at)
  values(candidate.id,candidate.job_id,candidate.team_id,p_mutation,candidate.service_date,candidate.title,candidate.location,coalesce(candidate.neighborhood,''),candidate.target,candidate.driver,candidate.vehicle,coalesce(candidate.helpers,''),candidate.responsible,candidate.headcount,candidate.status,candidate.started_at,candidate.finished_at,candidate.water_liters,candidate.refills,coalesce(candidate.notes,''),coalesce(candidate.photo_justification,''),coalesce(candidate.photos_before,'{}'),coalesce(candidate.photos_after,'{}'),candidate.latitude,candidate.longitude,candidate.accuracy_m,candidate.location_captured_at) returning * into result;
 end if;
 return result;
end $$;
create function public.import_pipa_jobs(p_rows jsonb,p_source text,p_published boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb;fresh public.pipa_jobs;prior public.pipa_jobs;k text;created_count int=0;updated_count int=0;protected_count int=0;seen text[]='{}';
begin
 if not private.is_operation_admin() then raise exception 'Somente o administrador importa' using errcode='42501';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 1000 then raise exception 'Importe entre 1 e 1000 atendimentos por vez' using errcode='23514';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  fresh=jsonb_populate_record(null::public.pipa_jobs,r);
  k=case when trim(coalesce(fresh.source_ref,''))<>'' then 'ref:'||to_char(fresh.service_date,'YYYY-MM')||':'||private.pipa_normalize(fresh.source_ref) else 'local:'||md5(to_char(fresh.service_date,'YYYY-MM-DD')||'|'||fresh.team_id||'|'||private.pipa_normalize(fresh.location)) end;
  if k=any(seen) then raise exception 'Atendimento repetido na importacao' using errcode='23514';end if;seen=array_append(seen,k);
  select * into prior from public.pipa_jobs where dedupe_key=k for update;
  if found then
   if exists(select 1 from public.pipa_visits v where v.job_id=prior.id) then protected_count=protected_count+1;continue;end if;
   update public.pipa_jobs set team_id=fresh.team_id,service_date=fresh.service_date,sequence=coalesce(fresh.sequence,1),title=fresh.title,location=fresh.location,neighborhood=coalesce(fresh.neighborhood,''),target=coalesce(nullif(fresh.target,''),'Outro'),notes=coalesce(fresh.notes,''),priority=coalesce(nullif(fresh.priority,''),'normal'),source_ref=coalesce(fresh.source_ref,''),source_file=left(coalesce(p_source,''),240),published=p_published where id=prior.id;
   updated_count=updated_count+1;
  else
   insert into public.pipa_jobs(team_id,service_date,sequence,title,location,neighborhood,target,notes,priority,source_ref,source_file,dedupe_key,published)
    values(fresh.team_id,fresh.service_date,coalesce(fresh.sequence,1),fresh.title,fresh.location,coalesce(fresh.neighborhood,''),coalesce(nullif(fresh.target,''),'Outro'),coalesce(fresh.notes,''),coalesce(nullif(fresh.priority,''),'normal'),coalesce(fresh.source_ref,''),left(coalesce(p_source,''),240),k,p_published);
   created_count=created_count+1;
  end if;
 end loop;
 return jsonb_build_object('created',created_count,'updated',updated_count,'protected',protected_count);
end $$;
create function private.pipa_accounts() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_operation_admin() then raise exception 'Somente administrador' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',coalesce(nullif(m.display_name,''),u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',''),'email',u.email,'role',m.role,'team_id',pm.team_id) order by u.email) from public.members m join auth.users u on u.id=m.user_id left join public.pipa_members pm on pm.user_id=m.user_id where u.email_confirmed_at is not null and(u.banned_until is null or u.banned_until<=now())),'[]'::jsonb);
end $$;
revoke all on function private.pipa_accounts() from public,anon;
grant execute on function private.pipa_accounts() to authenticated;
create function public.pipa_accounts() returns jsonb language sql stable security invoker set search_path='' as $$select private.pipa_accounts()$$;
revoke all on function public.pipa_snapshot(date),public.save_pipa_visit(jsonb,timestamptz,uuid,uuid[]),public.import_pipa_jobs(jsonb,text,boolean),public.pipa_accounts() from public,anon;
grant execute on function public.pipa_snapshot(date),public.save_pipa_visit(jsonb,timestamptz,uuid,uuid[]),public.import_pipa_jobs(jsonb,text,boolean),public.pipa_accounts() to authenticated;

create policy pipa_evidence_read on storage.objects for select to authenticated using(bucket_id='evidencias' and(select private.is_operation_member()) and exists(select 1 from public.pipa_visits v where storage.objects.name=any(v.photos_before||v.photos_after)));
create policy pipa_evidence_update_lock on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'evidencias' or not exists(select 1 from public.pipa_visits v where storage.objects.name=any(v.photos_before||v.photos_after)))
 with check(bucket_id<>'evidencias' or not exists(select 1 from public.pipa_visits v where storage.objects.name=any(v.photos_before||v.photos_after)));

-- Geocoder cache and a global request gate; neither table is exposed to visitors.
create table private.pipa_geo_cache(cache_key text primary key,result jsonb not null,expires_at timestamptz not null);
create table private.pipa_geo_gate(id boolean primary key default true check(id),next_at timestamptz not null default now());
insert into private.pipa_geo_gate(id) values(true);
alter table private.pipa_geo_cache enable row level security;
alter table private.pipa_geo_gate enable row level security;
revoke all on private.pipa_geo_cache,private.pipa_geo_gate from public,anon,authenticated;
grant usage on schema private to service_role;
grant select,insert,update,delete on private.pipa_geo_cache,private.pipa_geo_gate to service_role;
create function public.pipa_geo_claim(p_actor uuid,p_lat double precision,p_lon double precision) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb;k text;claimed boolean=false;
begin
 if not exists(select 1 from public.members m join auth.users u on u.id=m.user_id where m.user_id=p_actor and u.email_confirmed_at is not null and(u.banned_until is null or u.banned_until<=now()) and(m.role='admin' or exists(select 1 from public.pipa_members pm where pm.user_id=p_actor))) then raise exception 'Conta sem acesso ao piloto' using errcode='42501';end if;
 if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then raise exception 'Coordenadas invalidas' using errcode='23514';end if;
 k=round(p_lat::numeric,4)::text||','||round(p_lon::numeric,4)::text;
 select result into cached from private.pipa_geo_cache where cache_key=k and expires_at>now();if found then return jsonb_build_object('cached',cached);end if;
 update private.pipa_geo_gate set next_at=clock_timestamp()+interval '2 seconds' where id=true and next_at<=clock_timestamp() returning true into claimed;
 if not coalesce(claimed,false) then return jsonb_build_object('retry',true);end if;
 return jsonb_build_object('key',k);
end $$;
create function public.pipa_geo_store(p_key text,p_result jsonb) returns void language sql security invoker set search_path='' as $$
 insert into private.pipa_geo_cache(cache_key,result,expires_at) values(p_key,p_result,now()+interval '7 days') on conflict(cache_key) do update set result=excluded.result,expires_at=excluded.expires_at
$$;
revoke all on function public.pipa_geo_claim(uuid,double precision,double precision),public.pipa_geo_store(text,jsonb) from public,anon,authenticated;
grant execute on function public.pipa_geo_claim(uuid,double precision,double precision),public.pipa_geo_store(text,jsonb) to service_role;
