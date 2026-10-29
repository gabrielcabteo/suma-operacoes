-- The owner authorized coordinate lookup with Photon/Komoot.
-- Check the caller before reading the shared address cache or claiming a request.
create function private.pipa_geo_authorize(p_lat double precision,p_lon double precision)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cached jsonb;k text;claimed boolean=false;
begin
 if auth.uid() is null or not private.is_operation_member() or not(
  private.is_operation_admin() or exists(select 1 from public.pipa_members m where m.user_id=auth.uid())
 ) then raise exception 'Conta sem acesso ao piloto' using errcode='42501';end if;
 if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
  raise exception 'Coordenadas invalidas' using errcode='23514';
 end if;
 k=round(p_lat::numeric,4)::text||','||round(p_lon::numeric,4)::text;
 select result into cached from private.pipa_geo_cache where cache_key=k and expires_at>now();
 if found then return jsonb_build_object('cached',cached);end if;
 update private.pipa_geo_gate set next_at=clock_timestamp()+interval '2 seconds'
  where id=true and next_at<=clock_timestamp() returning true into claimed;
 if not coalesce(claimed,false) then return jsonb_build_object('retry',true);end if;
 return jsonb_build_object('key',k);
end $$;
revoke all on function private.pipa_geo_authorize(double precision,double precision) from public,anon;
grant execute on function private.pipa_geo_authorize(double precision,double precision) to authenticated;
create function public.pipa_geo_authorize(p_lat double precision,p_lon double precision)
returns jsonb language sql security invoker set search_path=''
as $$select private.pipa_geo_authorize(p_lat,p_lon)$$;
revoke all on function public.pipa_geo_authorize(double precision,double precision) from public,anon;
grant execute on function public.pipa_geo_authorize(double precision,double precision) to authenticated;
