-- 2026-05-17: Dodaj status 'waiting' do CHECK constraint
-- Powód: PARTNER MEBLE i inne projekty czekające na zewnętrzny trigger
-- (np. czerwcowy rebuild, decyzja księgowego) — semantycznie różne od 'doing'.

DO $$
DECLARE
  c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.dario_tasks'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';

  IF c IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.dario_tasks DROP CONSTRAINT ' || quote_ident(c);
  END IF;
END $$;

ALTER TABLE public.dario_tasks
  ADD CONSTRAINT dario_tasks_status_check
  CHECK (status IN ('todo','doing','done','idea','abandoned','waiting'));

-- Migracja danych: PARTNER MEBLE w status='doing' → 'waiting'
UPDATE public.dario_tasks
SET status = 'waiting'
WHERE area = 'praca'
  AND subcategory = 'PARTNER MEBLE'
  AND status = 'doing';

-- Weryfikacja (tylko SELECT, do podejrzenia w SQL Editor)
SELECT status, COUNT(*) AS n
FROM public.dario_tasks
WHERE subcategory = 'PARTNER MEBLE'
GROUP BY status
ORDER BY status;
