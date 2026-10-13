-- ============================================================
--  BUSTILLO PERFORMANCE — 0034: LAS COLUMNAS QUE NINGUNA MIGRACION CREABA
--
--  POR QUE EXISTE ESTE ARCHIVO
--  Agregar un ejercicio fallaba con:
--      Could not find the 'graph_metric' column of 'exercises' in the schema cache
--
--  El codigo escribe esa columna, pero ninguna migracion la crea. Es el
--  mismo hueco que ya cerro 0018b con nutrition_plans y progress_photos:
--  en la instancia original se agregaron a mano por el dashboard y nunca
--  bajaron a un archivo.
--
--  No se parcho solo esa columna. Se comparo el esquema COMPLETO de la base
--  original contra lo que producen las migraciones, y aparecieron 14
--  columnas huerfanas en 6 tablas. Aqui estan las que esta instancia usa;
--  quedan fuera a proposito las 5 de `forjas` y `members.forja_enabled`,
--  porque La Forja es propiedad intelectual del coach anterior y esta
--  instancia no la lleva.
--
--  El DDL salio de leer information_schema y pg_indexes de la base original,
--  no de deducirlo del codigo.
--
--  Idempotente, como el resto.
-- ============================================================

-- ------------------------------------------------------------
--  EXERCISES — como se mide, como se registra y como se grafica.
--  Son jsonb porque la lista de metricas de un ejercicio se reescribe
--  seguido y no vale una migracion cada vez; el mismo criterio que ya se
--  uso en check_ins (0025).
-- ------------------------------------------------------------
alter table public.exercises add column if not exists measures    jsonb;
alter table public.exercises add column if not exists log_metrics jsonb;
-- Cual de esas metricas es la que se grafica en el progreso del cliente.
alter table public.exercises add column if not exists graph_metric text;

-- De que ejercicio hereda su 1RM. Apunta a otro ejercicio: la sentadilla
-- con mancuernas puede calcular su carga desde el 1RM de la sentadilla con
-- barra. `set null` y no `cascade`: borrar el ejercicio de referencia no
-- debe arrastrarse al que lo usaba — solo lo deja sin fuente.
alter table public.exercises add column if not exists one_rm_source_id uuid;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
     where constraint_schema = 'public'
       and table_name = 'exercises'
       and constraint_name = 'exercises_one_rm_source_id_fkey'
  ) then
    alter table public.exercises
      add constraint exercises_one_rm_source_id_fkey
      foreign key (one_rm_source_id) references public.exercises(id) on delete set null;
  end if;
end $$;

-- ------------------------------------------------------------
--  MEMBERS — si tiene plan de nutricion cargado. La pantalla de Nutrition
--  solo aparece en su menu cuando esta en true (ver Shell.jsx).
-- ------------------------------------------------------------
alter table public.members add column if not exists has_nutrition boolean not null default false;

-- ------------------------------------------------------------
--  CONTENIDO EDITORIAL — las paginas que el cliente ve de un plan o de un
--  programa en linea: texto, imagenes y video, en el editor de bloques
--  (src/components/RichContent.jsx). Sin esto, un plan no puede tener
--  pagina y el boton de "ver detalles" no muestra nada.
-- ------------------------------------------------------------
alter table public.membership_plans add column if not exists content jsonb default '[]'::jsonb;
alter table public.programs        add column if not exists content jsonb default '[]'::jsonb;

-- ------------------------------------------------------------
--  WORKOUTS — la nota con la que cierra la sesion, que el atleta lee al
--  terminar de registrarla.
-- ------------------------------------------------------------
alter table public.workouts add column if not exists closing_message text;

-- ------------------------------------------------------------
--  Supabase expone la API REST a partir de un cache del esquema. Si no se
--  recarga, la app sigue viendo el esquema viejo y repite el mismo error
--  — "could not find the column ... in the schema cache" — aunque la
--  columna ya exista. Normalmente se recarga solo; esto lo fuerza.
-- ------------------------------------------------------------
notify pgrst, 'reload schema';
