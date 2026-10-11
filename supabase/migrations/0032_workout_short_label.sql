-- ============================================================
--  0032 — ETIQUETA CORTA DE LA RUTINA
--  En el calendario mensual del cliente cada columna mide unos 50 px en un
--  telefono. El nombre completo no cabe, y recortarlo por el principio no
--  sirve: en los nombres reales el prefijo es lo que se repite
--  ("FW - David Hdz - ", "FW Athletes - 4 Day Eccentric Block - ") y lo que
--  distingue un dia de otro esta al final.
--
--  Hasta ahora eso se adivinaba, quedandose con el ultimo tramo despues del
--  guion. Funcionaba en 197 de 202 nombres, pero seguia siendo una adivinanza:
--  un nombre con el guion pegado o uno escrito libre se recortaba feo y el
--  coach no tenia forma de arreglarlo.
--
--  Con esta columna el coach lo decide: "B1 - D1", "B1 - P", "Day 1". Vacia,
--  se sigue adivinando como hasta ahora, asi que las rutinas que ya existen no
--  cambian de aspecto.
--
--  Aplicar en el SQL Editor de Supabase. Se puede volver a correr.
-- ============================================================

alter table public.workouts
  add column if not exists short_label text;

comment on column public.workouts.short_label is
  'Etiqueta breve para el calendario del cliente (~14 caracteres). Vacia: se deduce del nombre.';
