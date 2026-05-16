-- Migracja: dario_tasks (PWA marzenia42-png/tasks)
-- 2026-05-16
-- Lokalizacja: Supabase projekt SOLA (ta sama instancja co cała aplikacja SOLA)
-- Prefix `dario_` żeby nie kolidować z ewentualnymi tabelami SOLA

create table if not exists public.dario_tasks (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category     text not null,
  subcategory  text,
  status       text not null default 'todo',
  priority     text not null default 'normal',
  due_date     date,
  source       text,
  notes        text,
  external_id  text unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  done_at      timestamptz,

  constraint dario_tasks_category_check
    check (category in ('SOLA','PM','DB','Agenci','Osobiste')),
  constraint dario_tasks_status_check
    check (status in ('todo','doing','done','idea','abandoned')),
  constraint dario_tasks_priority_check
    check (priority in ('urgent','important','normal'))
);

create index if not exists idx_dario_tasks_status   on public.dario_tasks(status);
create index if not exists idx_dario_tasks_category on public.dario_tasks(category);
create index if not exists idx_dario_tasks_due_date on public.dario_tasks(due_date) where due_date is not null;

-- updated_at auto-trigger
create or replace function public.dario_tasks_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if new.status = 'done' and (old.status is null or old.status <> 'done') then
    new.done_at = now();
  end if;
  return new;
end$$;

drop trigger if exists tr_dario_tasks_updated_at on public.dario_tasks;
create trigger tr_dario_tasks_updated_at
  before update on public.dario_tasks
  for each row execute function public.dario_tasks_set_updated_at();

-- RLS: tabela single-user (Dario przez anon key)
alter table public.dario_tasks enable row level security;

drop policy if exists "anon read tasks" on public.dario_tasks;
create policy "anon read tasks"
  on public.dario_tasks for select
  using (true);

drop policy if exists "anon write tasks" on public.dario_tasks;
create policy "anon write tasks"
  on public.dario_tasks for all
  using (true)
  with check (true);

-- Real-time subscriptions (PWA aktualizuje natychmiast po zmianie z BETI)
alter publication supabase_realtime add table public.dario_tasks;

comment on table public.dario_tasks is
  'Lista zadań Dario - tasks PWA (marzenia42-png/tasks). Single user. BETI dodaje przez REST API przy ''koniec''.';
