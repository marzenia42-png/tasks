-- ============================================================
-- Tasks v2: 3-poziomowa hierarchia
-- POZIOM 1 (area): 6 obszarów SOLA-style heksagony
-- POZIOM 2 (subcategory): projekty/firmy (juz istniejące pole)
-- POZIOM 3 (zadania): + galeria + GCal sync + opis + notatki
-- ============================================================

-- POZIOM 1: area (6 obszarów)
alter table public.dario_tasks
  add column if not exists area text;

alter table public.dario_tasks
  drop constraint if exists dario_tasks_area_check;

alter table public.dario_tasks
  add constraint dario_tasks_area_check
  check (area is null or area in ('praca','zdrowie','relacje','finanse','hobby','marzenia'));

create index if not exists idx_dario_tasks_area on public.dario_tasks(area);

-- POZIOM 3: dodatkowe pola
alter table public.dario_tasks
  add column if not exists description text;

alter table public.dario_tasks
  add column if not exists images jsonb not null default '[]'::jsonb;

alter table public.dario_tasks
  add column if not exists gcal_event_id text;

alter table public.dario_tasks
  add column if not exists gcal_event_url text;

-- Auto-mapping 328 istniejących zadań do area
update public.dario_tasks set area = case
  when upper(subcategory) in ('SOLA','DB MEBLE','DB CONCEPT','PARTNER MEBLE','DB MEBLE / PARTNER','AGENCI','MAKE.COM','BETI','SKILLE','SYSTEM','SOCIAL','SPÓŁKA','BIURO','BRAND','ADMIN','BANK','APP','BIZNES') then 'praca'
  when upper(subcategory) in ('ZDROWIE','BEZPIECZEŃSTWO','NAUKA/BEZPIECZEŃSTWO') then 'zdrowie'
  when upper(subcategory) in ('RODZINA') then 'relacje'
  when upper(subcategory) in ('INWESTYCJE') then 'finanse'
  when upper(subcategory) in ('DOM','NAUKA','LEKCJE','SPRZĘT','HOBBY') then 'hobby'
  when upper(subcategory) in ('MARZENIE','DZIEDZICTWO','PODRÓŻE','PERSONAL BRAND') then 'marzenia'
  when upper(subcategory) in ('DATA','ALERT','KALENDARZ') then 'praca'
  else 'praca'
end
where area is null;

-- ============================================================
-- STORAGE: bucket task-images
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-images', 'task-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic'];

-- RLS policies for storage.objects (anon full access dla task-images bucket)
drop policy if exists "anon upload task images" on storage.objects;
create policy "anon upload task images" on storage.objects
  for insert to anon with check (bucket_id = 'task-images');

drop policy if exists "anon read task images" on storage.objects;
create policy "anon read task images" on storage.objects
  for select to anon using (bucket_id = 'task-images');

drop policy if exists "anon delete task images" on storage.objects;
create policy "anon delete task images" on storage.objects
  for delete to anon using (bucket_id = 'task-images');

drop policy if exists "public read task images" on storage.objects;
create policy "public read task images" on storage.objects
  for select to public using (bucket_id = 'task-images');

-- ============================================================
-- VERIFICATION
-- ============================================================
-- Sprawdzenie mapowania:
select area, count(*) as n from public.dario_tasks group by area order by n desc;

-- Top 10 subcategorii per area:
-- select area, subcategory, count(*) from public.dario_tasks group by area, subcategory order by area, count(*) desc;

-- ============================================================
-- ROLLBACK (jeśli potrzeba):
-- alter table public.dario_tasks drop column area, drop column description, drop column images, drop column gcal_event_id, drop column gcal_event_url;
-- delete from storage.buckets where id = 'task-images';
-- ============================================================
