-- Optional prices shown on space cards and detail pages (EUR, gross). NULL = "price on request".
alter table public.workspaces
  add column if not exists price_hourly numeric(10, 2) check (price_hourly is null or price_hourly >= 0),
  add column if not exists price_daily numeric(10, 2) check (price_daily is null or price_daily >= 0);

alter table public.rooms
  add column if not exists price_hourly numeric(10, 2) check (price_hourly is null or price_hourly >= 0),
  add column if not exists price_daily numeric(10, 2) check (price_daily is null or price_daily >= 0);
