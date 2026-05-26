-- v20: Ausencias de supervisor + log de movimientos de empleados.

-- ─────────────────────────────────────────────────────────────────────
-- 1) Ausencias en usuarios
-- ─────────────────────────────────────────────────────────────────────
alter table usuarios add column if not exists ausente_desde date;
alter table usuarios add column if not exists ausente_hasta date;
alter table usuarios add column if not exists ausente_motivo text;
alter table usuarios add column if not exists ausencia_marcada_por uuid references usuarios(id);
alter table usuarios add column if not exists ausencia_marcada_en timestamptz;

create index if not exists usuarios_ausentes_idx on usuarios (ausente_desde, ausente_hasta)
  where ausente_desde is not null;

comment on column usuarios.ausente_desde is 'Inicio de ausencia (vacaciones, permiso, incap. prolongada). Inclusive.';
comment on column usuarios.ausente_hasta is 'Fin de ausencia. Inclusive. Si vencido, ya no aplica.';

-- Helper: ¿el usuario está ausente HOY (o en fecha dada)?
create or replace function usuario_esta_ausente(p_usuario_id uuid, p_fecha date default null)
returns boolean
language sql stable
as $$
  select exists (
    select 1 from usuarios
    where id = p_usuario_id
      and ausente_desde is not null
      and ausente_hasta is not null
      and coalesce(p_fecha, (now() at time zone 'America/Merida')::date) between ausente_desde and ausente_hasta
  );
$$;

grant execute on function usuario_esta_ausente(uuid, date) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 2) Update supervisores_pendientes_hoy() para saltar ausentes
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
  select u.id, u.nombre, asign.n_sedes::int
  from usuarios u
  join asign on asign.usuario_id = u.id
  where u.activo = true
    and u.rol = 'USER'
    and u.id not in (select usuario_id from asistencias_hoy)
    and not usuario_esta_ausente(u.id, (select d from hoy));
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3) Update incapacidades_atoradas() — solo notifica si reporter no ausente
-- ─────────────────────────────────────────────────────────────────────
create or replace function incapacidades_atoradas()
returns table (
  id uuid,
  tipo text,
  estado text,
  dias_atorada numeric,
  empleado_nombre text,
  empleado_numero text,
  sede_abrev text,
  reportada_por uuid,
  motivo text
)
language sql stable security definer
set search_path = public
as $$
  with base as (
    select
      i.id,
      i.tipo::text,
      i.estado::text,
      extract(epoch from (now() - i.actualizado_en)) / 86400 as dias,
      i.reportada_por,
      e.nombre,
      e.numero_empleado,
      s.abrev,
      case
        when i.estado in ('REPORTADA','DOCS_EMPLEADO') and (now() - i.actualizado_en) > interval '24 hours'
          then 'Empleado no ha traído documentos (>24h)'
        when i.estado = 'RH_VALIDA' and (now() - i.actualizado_en) > interval '24 hours'
          then 'RH no llenó ST-7 (regla de oro: <24h)'
        when i.estado = 'MEDICINA_TRABAJO' and (now() - i.actualizado_en) > interval '7 days'
          then 'En IMSS >7 días sin dictamen'
        when i.estado = 'ALTA_PENDIENTE' and (now() - i.actualizado_en) > interval '48 hours'
          then 'Empleado sin ST-2 >48h — no puede laborar'
        else null
      end as motivo
    from incapacidades i
    join empleados e on e.id = i.empleado_id
    left join sedes s on s.id = e.sede_id
    where i.estado not in ('CERRADA','RECHAZADA','CANCELADA')
  )
  select id, tipo, estado, round(dias::numeric, 1), nombre, numero_empleado, abrev, reportada_por, motivo
  from base
  where motivo is not null
  order by dias desc;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4) Log de movimientos de empleados (cambios de sede / jornada)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists empleado_movimientos (
  id bigserial primary key,
  empleado_id uuid not null references empleados(id) on delete cascade,
  tipo text not null,                       -- 'cambio_sede' | 'cambio_jornada' | 'multi'
  sede_anterior uuid references sedes(id),
  sede_nueva uuid references sedes(id),
  jornada_anterior text,
  jornada_nueva text,
  motivo text,
  efectuado_por uuid references usuarios(id),
  efectuado_en timestamptz not null default now()
);

create index if not exists emp_movs_empleado on empleado_movimientos (empleado_id, efectuado_en desc);
create index if not exists emp_movs_recientes on empleado_movimientos (efectuado_en desc);

alter table empleado_movimientos enable row level security;

drop policy if exists "emp_movs_select" on empleado_movimientos;
create policy "emp_movs_select" on empleado_movimientos for select to authenticated
  using (es_soporte_o_admin());

drop policy if exists "emp_movs_insert" on empleado_movimientos;
create policy "emp_movs_insert" on empleado_movimientos for insert to authenticated
  with check (es_soporte_o_admin() and efectuado_por = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- 5) RPC reciente_supervisor_actividad(usuario_id): para mostrar última conexión real
--    Toma el max entre ultimo_acceso (heartbeat) y ultima_captura.
-- ─────────────────────────────────────────────────────────────────────
create or replace function supervisor_actividad(p_usuario_id uuid)
returns timestamptz
language sql stable security definer
set search_path = public
as $$
  select greatest(
    (select ultimo_acceso from usuarios where id = p_usuario_id),
    (select max(actualizado_en) from asistencias where capturado_por = p_usuario_id)
  );
$$;

grant execute on function supervisor_actividad(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 6) Extender supervisor_resumen() para incluir info de ausencia.
-- Postgres no permite cambiar columnas OUT con OR REPLACE → drop primero.
-- ─────────────────────────────────────────────────────────────────────
drop function if exists supervisor_resumen(uuid);
create function supervisor_resumen(p_usuario_id uuid)
returns table (
  id uuid,
  nombre text,
  username text,
  email text,
  rol text,
  activo boolean,
  notas text,
  notas_actualizado_en timestamptz,
  notas_autor_username text,
  ultimo_acceso timestamptz,
  creado_en timestamptz,
  sedes_asignadas int,
  jornadas_asignadas int,
  empleados_a_cargo int,
  capturadas_hoy int,
  empleados_total_hoy int,
  pct_hoy int,
  capturas_mes int,
  tickets_abiertos int,
  push_dispositivos int,
  ultima_captura timestamptz,
  ausente_desde date,
  ausente_hasta date,
  ausente_motivo text,
  esta_ausente boolean
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Merida')::date;
  v_inicio_mes date := date_trunc('month', v_hoy)::date;
begin
  return query
  with asign as (
    select sede_id, jornada::text as jornada
    from asignaciones_supervisor
    where usuario_id = p_usuario_id and activo = true
  ),
  emp_sup as (
    select distinct e.id, e.sede_id, e.jornada::text as jornada
    from asign a
    join empleados e on e.sede_id = a.sede_id and e.jornada::text = a.jornada and e.fecha_baja is null
  )
  select
    u.id, u.nombre, u.username, u.email, u.rol::text, u.activo,
    u.notas, u.notas_actualizado_en, aut.username, u.ultimo_acceso, u.creado_en,
    (select count(distinct sede_id)::int from asign),
    (select count(*)::int from asign),
    (select count(*)::int from emp_sup),
    coalesce((
      select count(distinct ast.empleado_id)::int
      from asistencias ast
      where ast.fecha = v_hoy and ast.empleado_id in (select id from emp_sup)
    ), 0),
    (select count(*)::int from emp_sup),
    case when (select count(*) from emp_sup) > 0
      then least(100, round(
        coalesce((select count(distinct ast.empleado_id)::numeric from asistencias ast
                  where ast.fecha = v_hoy and ast.empleado_id in (select id from emp_sup)), 0)
        * 100 / (select count(*) from emp_sup)
      ))::int
      else 0 end,
    coalesce((
      select count(*)::int from asistencias ast
      where ast.fecha >= v_inicio_mes and ast.fecha <= v_hoy
        and ast.capturado_por = p_usuario_id
    ), 0),
    coalesce((select count(*)::int from tickets_soporte where supervisor_id = p_usuario_id and estado != 'CERRADO'), 0),
    coalesce((select count(*)::int from push_subscriptions where usuario_id = p_usuario_id and activo = true), 0),
    (select max(ast.actualizado_en) from asistencias ast where ast.capturado_por = p_usuario_id),
    u.ausente_desde,
    u.ausente_hasta,
    u.ausente_motivo,
    usuario_esta_ausente(u.id, v_hoy)
  from usuarios u
  left join usuarios aut on aut.id = u.notas_actualizado_por
  where u.id = p_usuario_id;
end;
$$;

grant execute on function supervisor_resumen(uuid) to authenticated;

notify pgrst, 'reload schema';
