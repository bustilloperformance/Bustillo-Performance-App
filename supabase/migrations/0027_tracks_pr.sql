-- ============================================================
--  0027 — NO TODO EJERCICIO TIENE RÉCORD
--  0026 asumió que todo ejercicio medido en tiempo tiene una dirección de
--  mejora. Es falso para la mayoría: un estiramiento y un ejercicio de
--  calentamiento se prescriben por duración ("aguanta 30 segundos"), no se
--  compiten. Con solo dos direcciones, quien aguantara un estiramiento 20s en
--  lugar de 30s recibía una insignia de récord personal.
--
--  Ortogonal a time_lower_is_better, no lo reemplaza: una pregunta es si el
--  ejercicio tiene récords, la otra hacia dónde mejoran los que sí.
-- ============================================================
alter table exercises
  add column if not exists tracks_pr boolean not null default true;

comment on column exercises.tracks_pr is
  'false = nunca marca record personal. Para estiramientos y trabajo de calentamiento, que se prescriben por duracion y no se compiten.';
