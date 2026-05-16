# Zadania Dario — PWA + Supabase

Lista zadań Dario z mapowaniem na **MASTER_LISTA_ZADAN_DARIO_v2.md** (Drive). Real-time przez Supabase. BETI dopisuje przy każdym "koniec" sesji.

**Live:** https://marzenia42-png.github.io/tasks/
**Repo:** https://github.com/marzenia42-png/tasks
**Backend:** Supabase projekt `tasks-dario` (osobny, ZASADA 1 izolacji — patrz [skill projekt-spaces](https://github.com/marzenia42-png/...))

## Architektura

```
┌──────────────────────────────┐
│ PWA  marzenia42-png.github.io│   ← read/write przez anon key + RLS
│   - vanilla JS + Supabase JS │
│   - LocalStorage cache       │
│   - Real-time subscriptions  │
└────────────┬─────────────────┘
             │ REST + WS
             ▼
┌──────────────────────────────┐
│ Supabase projekt tasks-dario │
│   - table public.dario_tasks │
│   - RLS open dla anon (low-stakes single user)│
│   - Real-time publication    │
└────────────┬─────────────────┘
             ▲
             │ REST (service_role lub anon)
             │
┌──────────────────────────────┐
│ BETI (claude.ai)             │
│   przy każdym "koniec":      │
│   POST do /rest/v1/dario_tasks│
└──────────────────────────────┘
```

## Schemat tabeli

`public.dario_tasks` — 11 kolumn, idempotentny seed, real-time enabled:
- `id uuid pk default gen_random_uuid()`
- `name text not null` — treść zadania
- `category text` — SOLA / PM / DB / Agenci / Osobiste
- `subcategory text` — INWESTYCJE / ZDROWIE / DOM / SOCIAL etc. (215 zadań w Osobiste są dzielone subcategorią)
- `status text` — todo / doing / done / idea / abandoned
- `priority text` — urgent / important / normal
- `due_date date`
- `source text` — gdzie zostało wpisane oryginalnie (np. "MASTER_LISTA v1", "SESJA_04.05_cz3", "BETI 2026-05-16")
- `notes text`
- `external_id text unique` — stabilny hash dla idempotentnego seed
- `created_at` / `updated_at` / `done_at` — timestamps

Trigger `tr_dario_tasks_updated_at` ustawia `updated_at = now()` przy każdym UPDATE i `done_at = now()` gdy status→`done`.

## Seed

`supabase/seed/dario_tasks_seed.sql` — **328 zadań** z MASTER_LISTA (stan na 11.05.2026):
- 115 ZROBIONE (`status: done`)
- 112 W TOKU (`status: doing, priority: important`)
- 66 AKTYWNE/PILNE (`status: todo, priority: urgent`)
- 24 POMYSŁY (`status: idea`)
- 11 PORZUCONE (`status: abandoned`)

Idempotent przez `external_id = "seed-<sha1(section+subcategory+name+source)[:16]>"`. Powtórne `psql -f` nie tworzy duplikatów.

## Setup (jednorazowo)

1. **Stwórz Supabase projekt** "tasks-dario" (Free tier, region eu-central-1)
2. **Zaaplikuj migracje:**
   ```bash
   psql <SUPABASE_DB_URL> -f supabase/migrations/20260516_dario_tasks.sql
   psql <SUPABASE_DB_URL> -f supabase/seed/dario_tasks_seed.sql
   ```
   Lub Supabase Studio → SQL Editor → wklej zawartość obu plików
3. **Wstaw klucze do `config.js`:**
   ```js
   window.SUPABASE_CONFIG = {
     url: 'https://<your-project-ref>.supabase.co',
     anonKey: '<anon-public-key>',
     table: 'dario_tasks'
   };
   ```
4. **Włącz Real-time** w Supabase Studio → Database → Replication → `dario_tasks` ON
5. **Push GH Pages** — Pages serwuje z brancha `main` /

## BETI integracja — protokół "koniec"

Przy każdym "koniec" sesji BETI:

1. Wyekstrahuj nowe zadania ze sesji (ZASADA 1 BETI = każde zadanie ma konkretny owner + kategorię)
2. POST do Supabase:
   ```
   POST https://<project-ref>.supabase.co/rest/v1/dario_tasks
   apikey: <anon-key>
   Authorization: Bearer <anon-key>
   Content-Type: application/json
   Prefer: return=minimal

   {
     "name": "...",
     "category": "SOLA|PM|DB|Agenci|Osobiste",
     "subcategory": "...",
     "status": "todo|doing|idea",
     "priority": "urgent|important|normal",
     "due_date": "YYYY-MM-DD" (opcjonalne),
     "source": "BETI YYYY-MM-DD"
   }
   ```
3. PWA otrzymuje przez Real-time WebSocket i pokazuje nowe zadanie natychmiast — nawet jeśli Dario ma otwartą PWA na telefonie.

**Klucz dla BETI:** wstaw w project knowledge claude.ai jako "TASKS_PWA_SUPABASE" (osobny od SOLA — ZASADA IZOLACJI).

## Filtry

- **Kategoria** — SOLA / PM / DB / Agenci / Osobiste (lub wszystkie)
- **Status** — Aktywne (todo+doing) / Do zrobienia / W toku / Pomysły / Zrobione (archiwum) / Porzucone
- **Subkategoria** — pojawia się dynamicznie po wyborze kategorii (np. SOCIAL, INWESTYCJE, ZDROWIE w Osobiste)
- **Szukaj** — pełnotekstowe w nazwie / subkategorii / źródle

## Update seed z MASTER_LISTA

Gdy zmienisz `MASTER_LISTA_ZADAN_DARIO_v2.md` na Drive:

```powershell
cd E:\Dario\projekty\tasks
rclone copy claudia:LISTY/MASTER_LISTA_ZADAN_DARIO_v2.md data\
.\scripts\parse-master-lista.ps1 -InputPath data\MASTER_LISTA_ZADAN_DARIO_v2.md -OutputPath data\seed-tasks.json
.\scripts\json-to-sql-seed.ps1 -InputJson data\seed-tasks.json -OutputSql supabase\seed\dario_tasks_seed.sql
psql <SUPABASE_DB_URL> -f supabase\seed\dario_tasks_seed.sql
```

Idempotent — istniejące zadania (`external_id`) nie są nadpisywane. Nowe są dodawane.

## Stack

- PWA: vanilla JS + Service Worker + Supabase JS v2.45 (CDN)
- DB: PostgreSQL via Supabase
- Hosting: GitHub Pages (statyczny)
- Real-time: Supabase Realtime (WebSocket)
- Mobile: PWA install + safe-area + touch-optimized

## Powiązane

- [MASTER_LISTA na Drive](https://drive.google.com/file/d/1VTurJS9PiJQXAB24HmFMf513avqUIGvG/view)
- Skill [`dario-os`](https://github.com/marzenia42-png/...) — 7-day rule + zasady BETI
- Skill [`projekt-spaces`](https://github.com/marzenia42-png/...) — ZASADA 1 izolacji
