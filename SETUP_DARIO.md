# Setup tasks-dario — 4 kroki dla Dario

Po Twojej stronie. Czas: ~5 min.

## Krok 1 — Stwórz projekt Supabase

1. Wejdź **https://supabase.com/dashboard** (zaloguj jako marzenia42@gmail.com)
2. **New project** w organizacji (jeśli jest "Personal" — użyj tej; jeśli nie — twórz "Personal")
3. Wypełnij:
   - **Name:** `tasks-dario`
   - **Database password:** wygeneruj silne hasło (Supabase Password Generator) → **wpisz do Bitwarden** jako item "Supabase tasks-dario" w polu `password`
   - **Region:** `Central EU (Frankfurt)` (`eu-central-1`)
   - **Plan:** Free
4. **Create new project** → poczekaj ~2 min aż projekt się postawi (zielony status)

## Krok 2 — Wklej SQL (jednym pasteem)

1. W projekcie tasks-dario → lewe menu → **SQL Editor**
2. **New query**
3. Otwórz plik **`E:\Dario\projekty\tasks\supabase\setup-all-in-one.sql`** w edytorze (105 kB)
4. Skopiuj całość → wklej do SQL Editor
5. **Run** (Ctrl+Enter)
6. Powinno się pokazać na dole tabela weryfikacyjna:
   ```
   status     | count
   -----------|------
   done       | 115
   doing      | 112
   todo       | 66
   idea       | 24
   abandoned  | 11
   ```
   Razem 328 — jeśli OK, super. Jeśli nie zgadza się — pisz tutaj jakie liczby.

## Krok 3 — Włącz Real-time

1. Lewe menu → **Database** → **Replication**
2. Znajdź tabelę `dario_tasks`
3. Toggle ON (kolumna "Realtime" / "Replicate")

## Krok 4 — Daj mi klucze

1. **Settings** (zębatka u dołu) → **API**
2. Skopiuj **2 wartości:**
   - **Project URL:** `https://xxxxxxxxxx.supabase.co` (to nie jest sekret, możesz wkleić bezpośrednio w czat)
   - **anon public key:** długi string `eyJhbGci...` (też nie jest super-sekretem — designed dla client-side JS — ale wpisz najlepiej do **Bitwarden** w item "Supabase tasks-dario", pole `anon_key`)

3. **Napisz w czacie:**

   **Opcja A** (szybciej, anon key OK do wklejenia):
   ```
   OK setup:
   URL = https://xxxxxxxxxx.supabase.co
   anon = eyJhbGci...
   ```

   **Opcja B** (czyściej przez BW):
   ```
   OK BW item: Supabase tasks-dario
   ```
   Ja zrobię `bw unlock` (wpiszesz hasło) i pobiorę przez `bw get item`.

## Krok 5 — Reszta po mojej stronie (autonomicznie)

Po Twoim "OK" ja zrobię:
1. Edit `config.js` z prawdziwymi kluczami
2. `git commit -m "Wstrzyk Supabase config tasks-dario"`
3. `git push origin main`
4. GH Pages auto-deploy ~2 min
5. Update skill `projekt-spaces` z nowym projektem (mapa)
6. Update memory `project_tasks_pwa_dario` (z URL + status)
7. Test publiczny: `curl https://<ref>.supabase.co/rest/v1/dario_tasks?select=count` — powinien zwrócić 328
8. Raport końcowy

## Co się zmieni dla Ciebie

**Telefon (Android Chrome):**
- Otwórz https://marzenia42-png.github.io/tasks/
- **Hard refresh** (długi tap na refresh przy URL → "Reload bez cache") — workbox cache był z poprzedniej wersji
- Albo: ustawienia → aplikacja → wyczyść dane PWA → reinstall
- Powinno załadować się 328 zadań z domyślnym filtrem "Aktywne" (66 PILNE + 112 W TOKU = 178 widocznych; reszta po przełączeniu filtra)

**BETI integracja:**
- Po deploy wpiszesz do BETI project knowledge (claude.ai) instrukcje z `README.md` sekcja "BETI integracja — protokół 'koniec'"
- Klucz dla BETI: anon_key tego samego projektu (taki sam jak w config.js)
- Następna sesja BETI: na "koniec" automatyczny POST nowych zadań → real-time pojawi się w PWA na Twoim telefonie

---

**Status: gotowe i czeka na Krok 1-4 po Twojej stronie.** Najdłuższy jest Krok 1 (~2 min na utworzenie projektu Supabase). Reszta ~3 min razem.
