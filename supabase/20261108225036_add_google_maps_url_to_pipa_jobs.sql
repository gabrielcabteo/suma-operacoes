-- Add the optional Google Maps destination to each scheduled washing job.
alter table public.pipa_jobs
 add column if not exists maps_url text not null default '',
 add constraint pipa_jobs_maps_url_length check (length(maps_url) <= 2000),
 add constraint pipa_jobs_maps_url_https check (
  maps_url = '' or maps_url ~* '^https://(maps[.]app[.]goo[.]gl/|goo[.]gl/maps/|(www[.])?google[.][a-z.]+/maps/)'
 );
