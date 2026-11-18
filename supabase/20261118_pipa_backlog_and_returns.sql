-- Pendências em aberto e retornos reprogramados (aditivo; preserva programação e atendimentos existentes).

-- 1. Vínculo do retorno com o serviço original. Um retorno ativo (não cancelado) por serviço.
alter table public.pipa_jobs add column if not exists return_of uuid references public.pipa_jobs(id);
create unique index if not exists pipa_jobs_one_active_return on public.pipa_jobs(return_of) where return_of is not null and not cancelled;

-- 2. O snapshot passa a trazer, além do mês escolhido, as pendências em aberto dos últimos 180 dias
--    (serviço liberado, não cancelado, com data passada, sem retorno ativo e sem atendimento concluído)
--    e a lista de serviços que já têm retorno ativo.
create or replace function public.pipa_snapshot(p_month date) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare first_day date=date_trunc('month',p_month)::date; next_month date=(date_trunc('month',p_month)+interval '1 month')::date;
 local_today date=(now() at time zone 'America/Sao_Paulo')::date; backlog uuid[];
begin
 if not private.is_operation_member() then raise exception 'Conta indisponivel' using errcode='42501';end if;
 select coalesce(array_agg(j.id),'{}') into backlog from public.pipa_jobs j
  where j.published and not j.cancelled and j.service_date<local_today and j.service_date>=local_today-180
   and not exists(select 1 from public.pipa_jobs c where c.return_of=j.id and not c.cancelled)
   and not exists(select 1 from public.pipa_visits v where v.job_id=j.id and v.status in ('completed','cancelled'));
 return jsonb_build_object('user_id',auth.uid(),'admin',private.is_operation_admin(),
 'teams',coalesce((select jsonb_agg(t order by t.id) from public.pipa_teams t),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(m) from public.pipa_members m),'[]'::jsonb),
 'jobs',coalesce((select jsonb_agg(j order by j.service_date,j.sequence,j.id) from public.pipa_jobs j where(j.service_date>=first_day and j.service_date<next_month) or j.id=any(backlog) or exists(select 1 from public.pipa_visits v where v.job_id=j.id and v.service_date>=first_day and v.service_date<next_month)),'[]'::jsonb),
 'visits',coalesce((select jsonb_agg(v order by v.service_date,v.id) from public.pipa_visits v where(v.service_date>=first_day and v.service_date<next_month) or v.job_id=any(backlog) or exists(select 1 from public.pipa_jobs j where j.id=v.job_id and j.service_date>=first_day and j.service_date<next_month)),'[]'::jsonb),
 'returned',coalesce((select jsonb_agg(distinct c.return_of) from public.pipa_jobs c where c.return_of is not null and not c.cancelled),'[]'::jsonb));
end $$;

-- 3. Reprogramar retorno: cria um novo serviço ligado ao original, sem alterar o original nem o atendimento.
create or replace function public.reprogram_pipa_job(p_job uuid,p_date date,p_team text,p_reason text,p_published boolean default true) returns public.pipa_jobs language plpgsql security invoker set search_path='' as $$
declare o public.pipa_jobs; v public.pipa_visits; result public.pipa_jobs; ref text; next_seq int;
begin
 if not private.is_operation_admin() then raise exception 'Somente o administrador reprograma' using errcode='42501';end if;
 select * into o from public.pipa_jobs where id=p_job for update;
 if not found or o.cancelled then raise exception 'Servico original indisponivel' using errcode='23514';end if;
 if p_date is null or p_date<(now() at time zone 'America/Sao_Paulo')::date then raise exception 'O retorno deve ser hoje ou em data futura' using errcode='23514';end if;
 if p_team not in ('pipa-1','pipa-2') then raise exception 'Escolha a equipe' using errcode='23514';end if;
 if length(trim(coalesce(p_reason,'')))<3 or length(p_reason)>500 then raise exception 'Informe o motivo do retorno' using errcode='23514';end if;
 if exists(select 1 from public.pipa_jobs c where c.return_of=o.id and not c.cancelled) then raise exception 'Este servico ja tem retorno programado' using errcode='23505';end if;
 select * into v from public.pipa_visits where job_id=o.id;
 if found and v.status in ('completed','cancelled') then raise exception 'Servico concluido nao precisa de retorno' using errcode='23514';end if;
 if not found and o.service_date>=(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Servico ainda dentro do prazo: edite a programacao' using errcode='23514';end if;
 ref=case when trim(o.source_ref)<>'' then left(trim(o.source_ref),90)||' · retorno '||to_char(p_date,'DD/MM') else '' end;
 select coalesce(max(sequence),0)+1 into next_seq from public.pipa_jobs where service_date=p_date and team_id=p_team;
 insert into public.pipa_jobs(team_id,service_date,sequence,title,location,neighborhood,target,notes,priority,source_ref,maps_url,source_file,dedupe_key,published,return_of)
  values(p_team,p_date,least(next_seq,10000),o.title,o.location,o.neighborhood,o.target,
   left('Retorno do serviço de '||to_char(o.service_date,'DD/MM/YYYY')||': '||trim(p_reason)||case when trim(o.notes)<>'' then E'\n'||o.notes else '' end,2000),
   case when o.priority='urgent' then 'urgent' else 'high' end,ref,o.maps_url,left('Retorno · '||coalesce(nullif(o.source_file,''),'programação'),240),'pending',coalesce(p_published,true),o.id)
  returning * into result;
 return result;
end $$;
revoke all on function public.reprogram_pipa_job(uuid,date,text,text,boolean) from public,anon;
grant execute on function public.reprogram_pipa_job(uuid,date,text,text,boolean) to authenticated;

-- 4. Liberar a programação sem perder o nome do arquivo de origem.
create or replace function public.publish_pipa_jobs(p_month date) returns integer language plpgsql security invoker set search_path='' as $$
declare first_day date=date_trunc('month',p_month)::date; n int;
begin
 if not private.is_operation_admin() then raise exception 'Somente o administrador libera' using errcode='42501';end if;
 update public.pipa_jobs j set published=true where j.service_date>=first_day and j.service_date<(first_day+interval '1 month')::date and not j.published and not j.cancelled
  and not exists(select 1 from public.pipa_visits v where v.job_id=j.id);
 get diagnostics n=row_count;return n;
end $$;
revoke all on function public.publish_pipa_jobs(date) from public,anon;
grant execute on function public.publish_pipa_jobs(date) to authenticated;
