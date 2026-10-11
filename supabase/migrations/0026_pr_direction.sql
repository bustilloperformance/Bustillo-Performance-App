-- ============================================================
--  0026 — DIRECCIÓN DE UN RÉCORD
--  En peso, reps y distancia más siempre es mejor. En tiempo depende del
--  ejercicio: en un sprint el récord es bajar el número, en una plancha es
--  subirlo. La app asumía "en tiempo, menos es mejor" en dos lugares
--  (la gráfica de progreso y el cálculo de metas), así que hoy una meta de
--  plancha llena la barra al revés — en silencio, porque nada lo celebra.
--
--  Un solo booleano, y solo para tiempo: es la única métrica ambigua.
--  Default true = el comportamiento que ya existía, así que ningún ejercicio
--  cambia de significado al aplicar esta migración.
-- ============================================================
alter table exercises
  add column if not exists time_lower_is_better boolean not null default true;

comment on column exercises.time_lower_is_better is
  'Solo aplica a la métrica de tiempo. true = un sprint (menos es mejor). false = una plancha o un colgado (aguantar más es mejor).';
