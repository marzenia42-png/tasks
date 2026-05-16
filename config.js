// Konfiguracja Tasks PWA — Dario
// Te wartości są publiczne (anon key Supabase, designed dla client-side JS).
// RLS w bazie chroni dostęp. Service role key NIGDY tutaj — tylko do BETI po stronie serwera.
//
// Po utworzeniu Supabase projektu "tasks-dario" wstaw poniżej:
window.SUPABASE_CONFIG = {
  url: 'PLACEHOLDER_SUPABASE_URL',
  anonKey: 'PLACEHOLDER_SUPABASE_ANON_KEY',
  table: 'dario_tasks'
};
