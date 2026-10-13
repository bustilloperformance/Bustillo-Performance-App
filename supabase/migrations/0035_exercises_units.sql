-- ============================================================
--  BUSTILLO PERFORMANCE — 0035: EXERCISES.UNITS
--
--  La unidad de cada medida del ejercicio: {"time":"s","distance":"yd"}.
--  Es jsonb y no columnas sueltas porque un ejercicio puede registrar
--  varias medidas a la vez, y cada una trae la suya.
--
--  La usa todo el registro de series: ParticipantLogPanel la lee para
--  rotular cada campo, WorkoutBuilder para decidir si el tiempo va en
--  segundos o minutos, y ProgressDashboard para el eje de las graficas.
--  Sin ella el panel cae a los valores por defecto ('s' y 'yd') y un
--  ejercicio medido en metros o en minutos se rotula mal.
--
--  POR QUE LLEGO TARDE
--  La 0034 salio de comparar el esquema de la base original contra el
--  TEXTO de las migraciones, buscando cada nombre de columna. `units`
--  dio falso positivo: la palabra aparece en un comentario en ingles de
--  la 0020, sobre las cadencias que acepta Stripe. El nombre estaba en el
--  archivo, pero la columna no.
--
--  La leccion quedo aplicada: despues de esto la comprobacion se hizo
--  comparando las DOS BASES entre si — columnas, funciones, politicas,
--  indices, disparadores y restricciones — en vez de buscar palabras en
--  los archivos. Asi aparecio esta, y asi se confirmo que no falta nada
--  mas.
-- ============================================================
alter table public.exercises add column if not exists units jsonb default '{}'::jsonb;

notify pgrst, 'reload schema';
