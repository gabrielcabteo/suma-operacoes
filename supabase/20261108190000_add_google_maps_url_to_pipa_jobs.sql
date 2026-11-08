-- Store an optional Google Maps destination for each scheduled washing job.
alter table public.pipa_jobs
 add column if not exists maps_url text not null default '';

alter table public.pipa_jobs
 drop constraint if exists pipa_jobs_maps_url_length,
 drop constraint if exists pipa_jobs_maps_url_https;

alter table public.pipa_jobs
 add constraint pipa_jobs_maps_url_length check (length(maps_url) <= 2000),
 add constraint pipa_jobs_maps_url_https check (
   maps_url = '' or maps_url ~* '^https://(maps[.]app[.]goo[.]gl/|goo[.]gl/maps/|(www[.])?google[.][a-z.]+/maps/)'
 );

create or replace function public.import_pipa_jobs(p_rows jsonb,p_source text,p_published boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb;fresh public.pipa_jobs;prior public.pipa_jobs;k text;created_count int=0;updated_count int=0;protected_count int=0;seen text[]='{}';
begin
 if not private.is_operation_admin() then raise exception 'Somente o administrador importa' using errcode='42501';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 1000 then raise exception 'Importe entre 1 e 1000 atendimentos por vez' using errcode='23514';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  fresh=jsonb_populate_record(null::public.pipa_jobs,r);
  k=case when trim(coalesce(fresh.source_ref,''))<>'' then 'ref:'||to_char(fresh.service_date,'YYYY-MM')||':'||private.pipa_normalize(fresh.source_ref) else 'local:'||md5(to_char(fresh.service_date,'YYYY-MM-DD')||'|'||fresh.team_id||'|'||private.pipa_normalize(fresh.location)) end;
  if k=any(seen) then raise exception 'Atendimento repetido na importacao' using errcode='23514';end if;seen=array_append(seen,k);
  if length(coalesce(fresh.maps_url,''))>2000 or (coalesce(fresh.maps_url,'')<>'' and fresh.maps_url !~* '^https://(maps[.]app[.]goo[.]gl/|goo[.]gl/maps/|(www[.])?google[.][a-z.]+/maps/)') then raise exception 'Link do Google Maps invalido' using errcode='23514';end if;
  select * into prior from public.pipa_jobs where dedupe_key=k for update;
  if found then
   if exists(select 1 from public.pipa_visits v where v.job_id=prior.id) then protected_count=protected_count+1;continue;end if;
   update public.pipa_jobs set team_id=fresh.team_id,service_date=fresh.service_date,sequence=coalesce(fresh.sequence,1),title=fresh.title,location=fresh.location,neighborhood=coalesce(fresh.neighborhood,''),target=coalesce(nullif(fresh.target,''),'Outro'),notes=coalesce(fresh.notes,''),priority=coalesce(nullif(fresh.priority,''),'normal'),source_ref=coalesce(fresh.source_ref,''),maps_url=coalesce(fresh.maps_url,''),source_file=left(coalesce(p_source,''),240),published=p_published where id=prior.id;
   updated_count=updated_count+1;
  else
   insert into public.pipa_jobs(team_id,service_date,sequence,title,location,neighborhood,target,notes,priority,source_ref,maps_url,source_file,dedupe_key,published)
    values(fresh.team_id,fresh.service_date,coalesce(fresh.sequence,1),fresh.title,fresh.location,coalesce(fresh.neighborhood,''),coalesce(nullif(fresh.target,''),'Outro'),coalesce(fresh.notes,''),coalesce(nullif(fresh.priority,''),'normal'),coalesce(fresh.source_ref,''),coalesce(fresh.maps_url,''),left(coalesce(p_source,''),240),k,p_published);
   created_count=created_count+1;
  end if;
 end loop;
 return jsonb_build_object('created',created_count,'updated',updated_count,'protected',protected_count);
end $$;
