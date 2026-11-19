-- Fotos: até 3 antes e 4 depois.
alter table public.pipa_visits drop constraint if exists pipa_visits_photos_before_check, drop constraint if exists pipa_visits_photos_after_check;
alter table public.pipa_visits add constraint pipa_visits_photos_before_check check(cardinality(photos_before)<=3 and array_position(photos_before,null) is null),
 add constraint pipa_visits_photos_after_check check(cardinality(photos_after)<=4 and array_position(photos_after,null) is null);

-- Consumo de água e reabastecimentos obrigatórios ao concluir ou registrar parcial.
-- Vale para novos fechamentos; registros antigos sem esses dados continuam válidos, mas não podem ter o valor apagado.
create or replace function private.require_pipa_water() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status in ('completed','partial') then
  if new.water_liters is null and (TG_OP='INSERT' or old.status is distinct from new.status or old.water_liters is not null) then raise exception 'Informe a agua utilizada' using errcode='23514';end if;
  if new.refills is null and (TG_OP='INSERT' or old.status is distinct from new.status or old.refills is not null) then raise exception 'Informe os reabastecimentos' using errcode='23514';end if;
  if new.status='completed' and new.water_liters=0 and (TG_OP='INSERT' or old.water_liters is distinct from 0) then raise exception 'Agua utilizada deve ser maior que zero' using errcode='23514';end if;
 end if;
 return new;
end $$;
revoke all on function private.require_pipa_water() from public,anon;
grant execute on function private.require_pipa_water() to authenticated;
drop trigger if exists require_pipa_water on public.pipa_visits;
create trigger require_pipa_water before insert or update on public.pipa_visits for each row execute function private.require_pipa_water();
