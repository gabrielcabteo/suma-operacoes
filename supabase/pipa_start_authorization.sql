-- A narrow internal operation lets an assigned worker lock a job without granting permission to edit the program.
create function private.pipa_job_for_visit(p_job uuid,p_team text) returns public.pipa_jobs language plpgsql security definer set search_path='' as $$
declare result public.pipa_jobs;
begin
 if auth.uid() is null or not private.is_operation_member() then raise exception 'Conta indisponivel' using errcode='42501';end if;
 select * into result from public.pipa_jobs where id=p_job and team_id=p_team and published and not cancelled and(private.is_operation_admin() or private.pipa_team_access(team_id)) for update;
 if not found then raise exception 'Programacao indisponivel para iniciar' using errcode='42501';end if;
 return result;
end $$;
revoke all on function private.pipa_job_for_visit(uuid,text) from public,anon;
grant execute on function private.pipa_job_for_visit(uuid,text) to authenticated;
create or replace function private.guard_pipa_visit() returns trigger language plpgsql security invoker set search_path='' as $$
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
   j=private.pipa_job_for_visit(new.job_id,new.team_id);
   if j.id is null or j.team_id<>new.team_id or not j.published or j.cancelled then raise exception 'Programacao indisponivel para iniciar' using errcode='42501';end if;
  end if;
 end if;
 all_photos=new.photos_before||new.photos_after;
 if cardinality(all_photos)<>(select count(distinct p) from unnest(all_photos) p) then raise exception 'Foto repetida' using errcode='23514';end if;
 if not private.operation_owns_photos(fresh,new.id::text) then raise exception 'Evidencia invalida' using errcode='42501';end if;
 if new.service_date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Um atendimento futuro ainda nao pode ser executado' using errcode='23514';end if;
 if new.started_at>now()+interval '10 minutes' or new.finished_at>now()+interval '10 minutes' then raise exception 'Confira o relogio do aparelho' using errcode='23514';end if;
 new.updated_by=auth.uid();new.updated_at=clock_timestamp();return new;
end $$;
