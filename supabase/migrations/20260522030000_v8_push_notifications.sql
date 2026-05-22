-- v8: Web Push notifications + RH announcements + cron de recordatorios.
--
-- Tablas:
--   push_subscriptions: una fila por (usuario × dispositivo) con endpoint + keys
--   announcements:      anuncios mandados por RH (auditoría + reenviables)
--   notify_log:         qué push se mandó a quién (para evitar dobles + auditoría)
--
-- Cron en pg_cron: cada hora chequea quiet-hours y dispara HTTP a Vercel.

-- ─────────────────────────────────────────────────────────────────────
-- 1) push_subscriptions
-- ─────────────────────────────────────────────────────────────────────
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  creado_en timestamptz not null default now(),
  ultimo_uso timestamptz,
  activo boolean not null default true,
  unique (usuario_id, endpoint)
);

create index if not exists push_sub_user_idx on push_subscriptions (usuario_id) where activo;

alter table push_subscriptions enable row level security;

-- Cada usuario gestiona sus propias suscripciones
drop policy if exists "push_self_select" on push_subscriptions;
create policy "push_self_select" on push_subscriptions for select to authenticated
  using (usuario_id = auth.uid() or es_soporte_o_admin());
drop policy if exists "push_self_insert" on push_subscriptions;
create policy "push_self_insert" on push_subscriptions for insert to authenticated
  with check (usuario_id = auth.uid());
drop policy if exists "push_self_delete" on push_subscriptions;
create policy "push_self_delete" on push_subscriptions for delete to authenticated
  using (usuario_id = auth.uid() or es_soporte_o_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 2) announcements (anuncios de RH)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  creado_por uuid not null references usuarios(id),
  titulo text not null,
  cuerpo text not null,
  url_destino text,
  -- Si null → broadcast a todos los supervisores activos
  destinatarios uuid[] null,
  enviados int not null default 0,
  fallidos int not null default 0,
  enviado_en timestamptz not null default now()
);

create index if not exists announcements_recientes on announcements (enviado_en desc);

alter table announcements enable row level security;

drop policy if exists "ann_admin_all" on announcements;
create policy "ann_admin_all" on announcements for all to authenticated
  using (es_soporte_o_admin()) with check (es_soporte_o_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 3) notify_log (auditoría de pushes)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists notify_log (
  id bigserial primary key,
  usuario_id uuid references usuarios(id),
  tipo text not null,         -- 'recordatorio_captura' | 'announcement' | 'ticket' | etc
  titulo text,
  cuerpo text,
  resultado text,             -- 'enviado' | 'fallido_410' | 'sin_subscription' | etc
  detalle text,
  creado_en timestamptz not null default now()
);

create index if not exists notify_log_recientes on notify_log (creado_en desc);
create index if not exists notify_log_user on notify_log (usuario_id, creado_en desc);

alter table notify_log enable row level security;
drop policy if exists "notify_log_admin" on notify_log;
create policy "notify_log_admin" on notify_log for select to authenticated
  using (es_soporte_o_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 4) RPC: supervisores_pendientes_hoy()
--    Devuelve usuario_id de supervisores activos que NO han capturado
--    asistencia para hoy (zona Mérida). Lo usa el cron HTTP.
-- ─────────────────────────────────────────────────────────────────────
create or replace function supervisores_pendientes_hoy()
returns table (usuario_id uuid, nombre text, sedes_asignadas int)
language sql stable security definer
set search_path = public
as $$
  with hoy as (
    select (now() at time zone 'America/Merida')::date as d
  ),
  asign as (
    select a.usuario_id, count(distinct a.sede_id) as n_sedes,
           array_agg(distinct a.sede_id) as sedes
    from asignaciones_supervisor a
    where a.activo = true
    group by a.usuario_id
  ),
  empleados_de_sup as (
    -- Empleados activos en las sedes de cada supervisor
    select a.usuario_id, e.id as empleado_id
    from asignaciones_supervisor a
    join empleados e on e.sede_id = a.sede_id and e.fecha_baja is null
    where a.activo = true
  ),
  asistencias_hoy as (
    select distinct eds.usuario_id
    from empleados_de_sup eds
    join asistencias ast on ast.empleado_id = eds.empleado_id
    cross join hoy
    where ast.fecha = hoy.d
  )
  select u.id, u.nombre, asign.n_sedes
  from usuarios u
  join asign on asign.usuario_id = u.id
  where u.activo = true
    and u.rol = 'USER'
    and u.id not in (select usuario_id from asistencias_hoy)
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5) Helper: dentro_ventana_notificacion()
--    True si la hora Mérida está entre 09:00 y 17:00 (5pm).
-- ─────────────────────────────────────────────────────────────────────
create or replace function dentro_ventana_notificacion()
returns boolean
language sql stable
as $$
  select extract(hour from (now() at time zone 'America/Merida'))::int
    between 9 and 16; -- 9am inclusive, 17:00 exclusivo (último envío 16:xx)
$$;

comment on function supervisores_pendientes_hoy is
  'Lista de supervisores activos (rol USER) que aún no tienen asistencias capturadas hoy en sus sedes.';
comment on function dentro_ventana_notificacion is
  '9am-5pm Mérida — fuera de esto, los cron no deben mandar push.';

-- ─────────────────────────────────────────────────────────────────────
-- 6) pg_cron job: dispara HTTP cada 3 horas
-- ─────────────────────────────────────────────────────────────────────
-- Requiere extensiones pg_cron + pg_net (Supabase las incluye)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Desinstalamos si existía y reinstalamos
do $$
declare
  v_job_id int;
begin
  select jobid into v_job_id from cron.job where jobname = 'vortex_notify_pendientes';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end$$;

-- Cada 3 horas — el endpoint hace su propio quiet-hours check
select cron.schedule(
  'vortex_notify_pendientes',
  '0 */3 * * *',
  $cron$
    select net.http_post(
      url := 'https://vertice-rosy.vercel.app/api/cron/notify-pendientes',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.cron_secret', true)
      )
    );
  $cron$
);

comment on extension pg_cron is 'pg_cron habilitado para Vortex (recordatorios de captura cada 3h).';

notify pgrst, 'reload schema';
