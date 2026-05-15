-- ============================================================
-- Vértice — migración v2: alineación con sistema legacy MHS RH Pro
-- Fecha: 2026-05-15 12:00 (UTC)
--
-- Cambios derivados del análisis del Apps Script original (Code.js, 228 fns):
--
--   1. sedes: + abrev (código corto SHO/SV/etc), + ultimo_folio
--   2. usuarios: − sede_id, − jornada (movidos a tabla M2M); + username
--   3. asignaciones_supervisor: NUEVA tabla M2M usuario×sede×jornada
--   4. empleados: + segmento_original, + status_trabajador, + baja_capturado_por, + baja_ts
--   5. cdts: + fecha_fin (rango), + dia_descanso_orig/temp, + autoriza
--   6. incidencias: + cubre_id, + autoriza
--   7. compensaciones_descanso: rename fecha_trabajada→fecha_trabajo; + codigo_anterior/nuevo, motivo, autoriza
--   8. fechas_liberadas: − supervisor_id (es global); + activo flag
--   9. solicitudes_pase: NUEVA tabla con flujo PENDIENTE→APROBADA/RECHAZADA
--  10. turnos_eventuales: NUEVA tabla separada de cdts (cubrir turno, posible externo)
--  11. pagos_pendientes: NUEVA tabla con folio PP-####
--  12. tickets_soporte: rediseñada (folio TCK-####, chat_id, asignado_a, unread counts)
--  13. mensajes_soporte: NUEVA tabla con hilo de conversación
--  14. geo_asistencia: NUEVA tabla con log de GPS por sesión de captura
--  15. eventos: + target_roles[], + leido_por[], + full_name
-- ============================================================

-- ------------------------------------------------------------
-- 1) ENUMS nuevos
-- ------------------------------------------------------------
create type estado_solicitud as enum ('PENDIENTE', 'APROBADA', 'RECHAZADA');
create type estado_pago as enum ('PENDIENTE', 'PAGADO', 'CANCELADO');
create type status_trabajador as enum ('ACTIVO', 'BAJA', 'SUSPENDIDO', 'PERIODO_PRUEBA');
create type origen_remitente as enum ('USUARIO', 'SOPORTE', 'SISTEMA');

-- ------------------------------------------------------------
-- 2) sedes: + abrev (UNIQUE), + ultimo_folio
-- ------------------------------------------------------------
alter table sedes
  add column abrev text,
  add column ultimo_folio integer not null default 0;

-- backfill abrevs para las 3 sedes seed
update sedes set abrev = 'CEN' where codigo = 'CENTRO';
update sedes set abrev = 'NOR' where codigo = 'NORTE';
update sedes set abrev = 'SUR' where codigo = 'SUR';

alter table sedes alter column abrev set not null;
alter table sedes add constraint sedes_abrev_unique unique (abrev);

-- ------------------------------------------------------------
-- 3) usuarios: quitar sede/jornada, agregar username
-- ------------------------------------------------------------
alter table usuarios
  drop column if exists sede_id,
  drop column if exists jornada,
  add column username text;

update usuarios set username = email where username is null;
alter table usuarios alter column username set not null;
alter table usuarios add constraint usuarios_username_unique unique (username);

-- ------------------------------------------------------------
-- 4) asignaciones_supervisor (M2M)
-- ------------------------------------------------------------
create table asignaciones_supervisor (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  sede_id uuid not null references sedes(id) on delete cascade,
  jornada jornada not null,
  activo boolean not null default true,
  creado_por uuid references usuarios(id),
  creado_en timestamptz not null default now(),
  unique (usuario_id, sede_id, jornada)
);

create index asign_usuario_idx on asignaciones_supervisor (usuario_id) where activo;
create index asign_sede_idx on asignaciones_supervisor (sede_id, jornada) where activo;

-- ------------------------------------------------------------
-- 5) empleados: nuevos campos
-- ------------------------------------------------------------
alter table empleados
  add column segmento_original text,
  add column status status_trabajador not null default 'ACTIVO',
  add column baja_capturado_por uuid references usuarios(id),
  add column baja_ts timestamptz;

-- corregir salario_diario default
alter table empleados alter column salario_diario set default 315.04;
update empleados set salario_diario = 315.04 where salario_diario = 393.80;

-- ------------------------------------------------------------
-- 6) cdts: ampliar a rango + descansos + autoriza
-- ------------------------------------------------------------
alter table cdts
  add column fecha_fin date,
  add column dia_descanso_orig dia_semana,
  add column dia_descanso_temp dia_semana,
  add column autoriza uuid references usuarios(id),
  add column activo boolean generated always as (cancelado_en is null) stored;

-- ------------------------------------------------------------
-- 7) incidencias: cubre + autoriza
-- ------------------------------------------------------------
alter table incidencias
  add column cubre_id uuid references empleados(id),
  add column autoriza uuid references usuarios(id);

-- ------------------------------------------------------------
-- 8) compensaciones_descanso: ampliar
-- ------------------------------------------------------------
alter table compensaciones_descanso
  rename column fecha_trabajada to fecha_trabajo;

alter table compensaciones_descanso
  add column fecha_falta date,
  add column codigo_anterior codigo_asistencia,
  add column codigo_nuevo codigo_asistencia,
  add column motivo text,
  add column autoriza uuid references usuarios(id);

-- ------------------------------------------------------------
-- 9) fechas_liberadas: global, no per-supervisor
-- ------------------------------------------------------------
drop table fechas_liberadas;

create table fechas_liberadas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null unique,
  liberado_por uuid not null references usuarios(id),
  motivo text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create index fechas_liberadas_activas_idx on fechas_liberadas (fecha) where activo;

-- ------------------------------------------------------------
-- 10) solicitudes_pase (flujo de aprobación)
-- ------------------------------------------------------------
create table solicitudes_pase (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references usuarios(id),
  sede_id uuid references sedes(id),
  jornada jornada,
  fecha_pase date not null,
  notas text,
  estado estado_solicitud not null default 'PENDIENTE',
  respondido_por uuid references usuarios(id),
  respondido_en timestamptz,
  respuesta text,
  creado_en timestamptz not null default now()
);

create index solicitudes_pendientes_idx on solicitudes_pase (estado, creado_en desc) where estado = 'PENDIENTE';
create index solicitudes_supervisor_idx on solicitudes_pase (supervisor_id, creado_en desc);

-- ------------------------------------------------------------
-- 11) turnos_eventuales (cubrir turno, distinto de CDT)
-- ------------------------------------------------------------
create table turnos_eventuales (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  sede_id uuid not null references sedes(id),
  jornada jornada,
  empleado_id uuid references empleados(id),       -- null si es externo
  nombre_externo text,                             -- nombre cuando es externo
  cubre_id uuid references empleados(id),          -- a quién cubre
  observaciones text,
  autoriza uuid references usuarios(id),
  es_externo boolean not null default false,
  capturado_por uuid references usuarios(id),
  creado_en timestamptz not null default now(),
  check (
    (es_externo = true and nombre_externo is not null)
    or (es_externo = false and empleado_id is not null)
  )
);

create index turnos_sede_fecha_idx on turnos_eventuales (sede_id, fecha desc);

-- ------------------------------------------------------------
-- 12) pagos_pendientes (folio PP-####)
-- ------------------------------------------------------------
create sequence pagos_pendientes_folio_seq;

create table pagos_pendientes (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique
    default 'PP-' || lpad(nextval('pagos_pendientes_folio_seq')::text, 4, '0'),
  estado estado_pago not null default 'PENDIENTE',
  fecha_registro date not null default current_date,
  quincena text,                                    -- '2026-05-Q1'
  sede_id uuid not null references sedes(id),
  empleado_id uuid not null references empleados(id),
  monto numeric(10, 2) not null,
  motivo text,
  observaciones text,
  creado_por uuid references usuarios(id),
  ts_creacion timestamptz not null default now(),
  pagado_por uuid references usuarios(id),
  ts_pago timestamptz
);

create index pagos_estado_idx on pagos_pendientes (estado, fecha_registro desc);

-- ------------------------------------------------------------
-- 13) tickets_soporte (rediseño) + mensajes_soporte (hilo)
-- ------------------------------------------------------------
drop table tickets_soporte cascade;

create sequence tickets_folio_seq;

create table tickets_soporte (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique
    default 'TCK-' || lpad(nextval('tickets_folio_seq')::text, 4, '0'),
  chat_id text not null unique default gen_random_uuid()::text,
  supervisor_id uuid not null references usuarios(id),
  sede_id uuid references sedes(id),
  jornada jornada,
  fecha_solicitada date,
  tipo text not null,                       -- 'desbloqueo' | 'duda' | 'urgencia' | 'sugerencia'
  prioridad urgencia_ticket not null default 'NORMAL',
  estado estado_ticket not null default 'PENDIENTE',
  asignado_a uuid references usuarios(id),
  ultimo_mensaje text,
  unread_soporte int not null default 0,
  unread_user int not null default 0,
  device_id text,
  apertura_ts timestamptz not null default now(),
  ultimo_ts timestamptz not null default now(),
  cierre_ts timestamptz,
  cerrado_por uuid references usuarios(id)
);

create index tickets_estado_idx on tickets_soporte (estado, ultimo_ts desc);
create index tickets_supervisor_idx on tickets_soporte (supervisor_id, ultimo_ts desc);

create table mensajes_soporte (
  id bigserial primary key,
  ticket_id uuid not null references tickets_soporte(id) on delete cascade,
  remitente_id uuid references usuarios(id),
  origen origen_remitente not null,
  mensaje text not null,
  leido_soporte boolean not null default false,
  leido_user boolean not null default false,
  creado_en timestamptz not null default now()
);

create index mensajes_ticket_idx on mensajes_soporte (ticket_id, creado_en);

-- ------------------------------------------------------------
-- 14) geo_asistencia (log no bloqueante de GPS)
-- ------------------------------------------------------------
create table geo_asistencia (
  id bigserial primary key,
  ts timestamptz not null default now(),
  fecha date not null,
  sede_id uuid not null references sedes(id),
  jornada jornada,
  usuario_id uuid references usuarios(id),
  lat numeric(9, 6),
  lng numeric(9, 6),
  ubicacion text,                            -- reverse-geocode result
  total_registros int not null default 0
);

create index geo_fecha_idx on geo_asistencia (fecha desc);
create index geo_usuario_idx on geo_asistencia (usuario_id, ts desc);

-- ------------------------------------------------------------
-- 15) eventos: + target_roles, + leido_por, + full_name
-- ------------------------------------------------------------
alter table eventos
  add column target_roles user_role[],
  add column leido_por uuid[] not null default '{}',
  add column full_name text,
  add column jornada jornada,
  add column fecha date,
  add column mensaje text;

create index eventos_target_idx on eventos using gin (target_roles);

-- ------------------------------------------------------------
-- HELPER FUNCTIONS nuevas / actualizadas
-- ------------------------------------------------------------

-- Asignaciones de un usuario (devuelve array)
create or replace function asignaciones_usuario(p_usuario uuid)
returns table (sede_id uuid, jornada jornada)
language sql stable security definer
set search_path = public
as $$
  select sede_id, jornada
  from asignaciones_supervisor
  where usuario_id = p_usuario and activo;
$$;

-- ¿El usuario actual está asignado a esta sede/jornada?
create or replace function usuario_tiene_asignacion(p_sede uuid, p_jornada jornada default null)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from asignaciones_supervisor
    where usuario_id = auth.uid()
      and sede_id = p_sede
      and (p_jornada is null or jornada = p_jornada)
      and activo
  );
$$;

-- Override de la vieja sede_de_usuario: regresa la PRIMERA asignación activa
create or replace function sede_de_usuario()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select sede_id from asignaciones_supervisor
  where usuario_id = auth.uid() and activo
  order by creado_en asc
  limit 1;
$$;

-- Calcular si una fecha está dentro de la ventana de gracia para un USER.
-- Replica canEdit_() de Code.js:331.
-- Returns: ('OK', null) | ('GRACIA_VENCIDA', fecha_limite) | ('FUTURO', null) | ('LIBERADA', null) | ('SUPER', null)
create or replace function evaluar_ventana_gracia(
  p_fecha date,
  p_role user_role default null
) returns table (resultado text, expira timestamptz)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_role user_role := coalesce(p_role, rol_actual());
  v_now_merida timestamptz := now() at time zone 'America/Merida';
  v_hoy date := (v_now_merida)::date;
  v_ayer date := v_hoy - 1;
  v_limite_ayer timestamptz := (v_hoy::text || ' 12:00:00')::timestamp at time zone 'America/Merida';
begin
  if v_role = 'SUPERADMIN' then
    return query select 'SUPER'::text, null::timestamptz;
    return;
  end if;

  -- ¿Fecha liberada?
  if exists (select 1 from fechas_liberadas where fecha = p_fecha and activo) then
    return query select 'LIBERADA'::text, null::timestamptz;
    return;
  end if;

  if p_fecha = v_hoy then
    return query select 'OK'::text, ((v_hoy + 1)::text || ' 12:00:00')::timestamp at time zone 'America/Merida';
    return;
  end if;

  if p_fecha = v_ayer and now() < v_limite_ayer then
    return query select 'OK'::text, v_limite_ayer;
    return;
  end if;

  if p_fecha > v_hoy then
    return query select 'FUTURO'::text, null::timestamptz;
    return;
  end if;

  return query select 'GRACIA_VENCIDA'::text, null::timestamptz;
end;
$$;

-- ------------------------------------------------------------
-- RLS para tablas nuevas
-- ------------------------------------------------------------
alter table asignaciones_supervisor enable row level security;
alter table solicitudes_pase enable row level security;
alter table turnos_eventuales enable row level security;
alter table pagos_pendientes enable row level security;
alter table tickets_soporte enable row level security;
alter table mensajes_soporte enable row level security;
alter table geo_asistencia enable row level security;

-- asignaciones_supervisor
create policy "asign_select_propio_o_admin" on asignaciones_supervisor for select to authenticated
  using (usuario_id = auth.uid() or es_admin());
create policy "asign_admin_write" on asignaciones_supervisor for all to authenticated
  using (es_admin()) with check (es_admin());

-- solicitudes_pase
create policy "solic_select_propio_o_admin" on solicitudes_pase for select to authenticated
  using (supervisor_id = auth.uid() or es_admin());
create policy "solic_supervisor_insert" on solicitudes_pase for insert to authenticated
  with check (supervisor_id = auth.uid());
create policy "solic_admin_update" on solicitudes_pase for update to authenticated
  using (es_admin()) with check (es_admin());

-- turnos_eventuales
create policy "turnos_select" on turnos_eventuales for select to authenticated
  using (es_admin() or usuario_tiene_asignacion(sede_id, jornada));
create policy "turnos_insert" on turnos_eventuales for insert to authenticated
  with check (es_admin() or usuario_tiene_asignacion(sede_id, jornada));
create policy "turnos_admin_update" on turnos_eventuales for update to authenticated
  using (es_admin()) with check (es_admin());

-- pagos_pendientes (solo admin+)
create policy "pagos_admin_only" on pagos_pendientes for all to authenticated
  using (es_admin()) with check (es_admin());

-- tickets_soporte
create policy "tickets_select_propio_o_admin" on tickets_soporte for select to authenticated
  using (supervisor_id = auth.uid() or es_admin());
create policy "tickets_supervisor_insert" on tickets_soporte for insert to authenticated
  with check (supervisor_id = auth.uid());
create policy "tickets_admin_update" on tickets_soporte for update to authenticated
  using (es_admin() or supervisor_id = auth.uid()) with check (es_admin() or supervisor_id = auth.uid());

-- mensajes_soporte
create policy "mensajes_select" on mensajes_soporte for select to authenticated
  using (
    es_admin()
    or exists (select 1 from tickets_soporte t where t.id = mensajes_soporte.ticket_id and t.supervisor_id = auth.uid())
  );
create policy "mensajes_insert" on mensajes_soporte for insert to authenticated
  with check (
    es_admin()
    or (origen = 'USUARIO' and exists (select 1 from tickets_soporte t where t.id = mensajes_soporte.ticket_id and t.supervisor_id = auth.uid()))
  );

-- geo_asistencia
create policy "geo_admin_select" on geo_asistencia for select to authenticated using (es_admin());
create policy "geo_self_insert" on geo_asistencia for insert to authenticated
  with check (usuario_id = auth.uid() or usuario_id is null);

-- ------------------------------------------------------------
-- VISTAS DE CONVENIENCIA
-- ------------------------------------------------------------
create or replace view vw_supervisores_con_asignaciones as
  select u.id, u.username, u.email, u.nombre, u.rol,
         array_agg(distinct s.codigo) filter (where s.codigo is not null) as sedes,
         array_agg(distinct (s.codigo || ':' || a.jornada::text)) filter (where a.id is not null) as asignaciones
  from usuarios u
  left join asignaciones_supervisor a on a.usuario_id = u.id and a.activo
  left join sedes s on s.id = a.sede_id
  where u.activo and u.rol = 'USER'
  group by u.id, u.username, u.email, u.nombre, u.rol;
