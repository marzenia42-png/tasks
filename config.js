// Konfiguracja Tasks PWA — Dario
// Te wartości są publiczne (anon key Supabase, designed dla client-side JS).
// RLS w bazie chroni dostęp. Service role key NIGDY tutaj — tylko do BETI po stronie serwera.
//
// Po utworzeniu Supabase projektu "tasks-dario" wstaw poniżej:
window.SUPABASE_CONFIG = {
  url: 'https://unzqzeqorlbxhytfhorm.supabase.co',
  anonKey: 'sb_publishable_2jaIUfWOsqBlHeruAP3G1w_BCnIB28I',
  table: 'dario_tasks'
};
