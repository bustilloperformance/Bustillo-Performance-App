-- ============================================================
--  0030 — UN EVENTO DE STRIPE SE PROCESA UNA SOLA VEZ
--  Stripe entrega AL MENOS UNA VEZ: reintenta ante cualquier respuesta que no
--  sea 2xx, y también reenvía por su cuenta en algunos casos. El webhook
--  devolvía 500 al fallar, así que si el error ocurría DESPUÉS de insertar el
--  pago, el reintento lo insertaba de nuevo. Dos pagos en el libro por un solo
--  cobro — y nada en el código lo impedía.
--
--  Cada evento se reclama antes de procesarse. Si la fila ya existe, ya se
--  procesó y el webhook contesta 200 sin tocar nada. Si el procesamiento falla,
--  la reclamación se borra para que el reintento sí pueda volver a intentarlo.
-- ============================================================
create table if not exists stripe_events (
  id           text primary key,
  type         text not null,
  received_at  timestamptz not null default now()
);

comment on table stripe_events is
  'Eventos de Stripe ya procesados. Existe para que un reintento no duplique pagos ni membresias.';

alter table stripe_events enable row level security;
-- Nadie la lee ni la escribe desde la app: solo el webhook, que usa la llave de
-- servicio y se salta RLS. Sin politicas, queda cerrada para todos los demas.

-- Los eventos viejos no sirven de nada: Stripe deja de reintentar a los 3 dias.
create index if not exists stripe_events_received_idx on stripe_events (received_at);
