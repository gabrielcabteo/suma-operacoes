-- The pilot captures GPS locally; no external reverse geocoder is deployed.
drop function public.pipa_geo_claim(uuid,double precision,double precision);
drop function public.pipa_geo_store(text,jsonb);
drop table private.pipa_geo_cache;
drop table private.pipa_geo_gate;
