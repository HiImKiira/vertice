-- v19: Centro de Supervisores en RH Pro.
-- Notas internas + tracking de última actividad + RPC resumen agregado.

-- ─────────────────────────────────────────────────────────────────────
-- Columnas nuevas en usuarios
-- ─────────────────────────────────────────────────────────────────────
alter table usuarios add column if not exists notas text;
alter table usuarios add column if not exists notas_actualizado_en timestamptz;
alter table usuarios add column if not exists notas_actualizado_por uuid references usuarios(id);
alter table usuarios add column if not exists ultimo_acceso timestamptz;

comment on column usuarios.notas is 'Notas internas de RH sobre el supervisor';
comment on column usuarios.ultimo_acceso is 'Última vez que el usuario tuvo actividad capturando o navegando (best-effort)';

-- ─────────────────────────────────────────────────────────────────────
-- RPC supervisor_resumen(usuario_id): toda la info para la ficha en un call
-- ─────────────────────────────────────────────────────────────────────
create or replace function supervisor_resumen(p_usuario_id uuid)
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
  ultima_captura timestamptz
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
    u.id,
    u.nombre,
    u.username,
    u.email,
    u.rol::text,
    u.activo,
    u.notas,
    u.notas_actualizado_en,
    aut.username,
    u.ultimo_acceso,
    u.creado_en,
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
      else 0
    end,
    coalesce((
      select count(*)::int from asistencias ast
      where ast.fecha >= v_inicio_mes
        and ast.fecha <= v_hoy
        and ast.capturado_por = p_usuario_id
    ), 0),
    coalesce((select count(*)::int from tickets_soporte where supervisor_id = p_usuario_id and estado != 'CERRADO'), 0),
    coalesce((select count(*)::int from push_subscriptions where usuario_id = p_usuario_id and activo = true), 0),
    (select max(ast.actualizado_en) from asistencias ast where ast.capturado_por = p_usuario_id)
  from usuarios u
  left join usuarios aut on aut.id = u.notas_actualizado_por
  where u.id = p_usuario_id;
end;
$$;

grant execute on function supervisor_resumen(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- RPC supervisores_lista(): catálogo para la página /rh-pro/supervisores
-- ─────────────────────────────────────────────────────────────────────
create or replace function supervisores_lista()
returns table (
  id uuid,
  nombre text,
  username text,
  rol text,
  activo boolean,
  sedes_asignadas int,
  jornadas_asignadas int,
  empleados_a_cargo int,
  capturadas_hoy int,
  pct_hoy int,
  push_dispositivos int,
  ultimo_acceso timestamptz,
  ultima_captura timestamptz,
  tiene_notas boolean
)
language sql stable security definer
set search_path = public
as $$
  with hoy as (
    select (now() at time zone 'America/Merida')::date as d
  ),
  asign_x_user as (
    select usuario_id,
           count(distinct sede_id)::int as sedes_n,
           count(*)::int as jornadas_n
    from asignaciones_supervisor
    where activo = true
    group by usuario_id
  ),
  emp_x_user as (
    select a.usuario_id, count(distinct e.id)::int as emp_n
    from asignaciones_supervisor a
    join empleados e on e.sede_id = a.sede_id and e.jornada::text = a.jornada::text and e.fecha_baja is null
    where a.activo = true
    group by a.usuario_id
  ),
  cap_hoy as (
    select e.capturado_por as user_id, count(distinct e.empleado_id)::int as cap, max(e.actualizado_en) as ult
    from asistencias e cross join hoy
    where e.fecha = hoy.d
    group by e.capturado_por
  ),
  subs as (
    select usuario_id, count(*)::int as n
    from push_subscriptions
    where activo = true
    group by usuario_id
  )
  select
    u.id,
    u.nombre,
    u.username,
    u.rol::text,
    u.activo,
    coalesce(a.sedes_n, 0),
    coalesce(a.jornadas_n, 0),
    coalesce(eu.emp_n, 0),
    coalesce(c.cap, 0),
    case when coalesce(eu.emp_n, 0) > 0
      then least(100, round(coalesce(c.cap, 0)::numeric * 100 / eu.emp_n))::int
      else 0
    end as pct,
    coalesce(s.n, 0),
    u.ultimo_acceso,
    c.ult,
    (u.notas is not null and length(trim(u.notas)) > 0)
  from usuarios u
  left join asign_x_user a on a.usuario_id = u.id
  left join emp_x_user eu on eu.usuario_id = u.id
  left join cap_hoy c on c.user_id = u.id
  left join subs s on s.usuario_id = u.id
  where u.rol = 'USER'
  order by u.activo desc, pct asc, u.nombre;
$$;

grant execute on function supervisores_lista() to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- RPC bitacora_supervisor(usuario_id, limite): últimas N capturas hechas
-- ─────────────────────────────────────────────────────────────────────
create or replace function bitacora_supervisor(p_usuario_id uuid, p_limite int default 20)
returns table (
  fecha date,
  codigo text,
  actualizado_en timestamptz,
  empleado_nombre text,
  empleado_numero text,
  sede_abrev text
)
language sql stable security definer
set search_path = public
as $$
  select
    ast.fecha,
    ast.codigo::text,
    ast.actualizado_en,
    e.nombre,
    e.numero_empleado,
    s.abrev
  from asistencias ast
  join empleados e on e.id = ast.empleado_id
  left join sedes s on s.id = e.sede_id
  where ast.capturado_por = p_usuario_id
  order by ast.actualizado_en desc
  limit p_limite;
$$;

grant execute on function bitacora_supervisor(uuid, int) to authenticated;

notify pgrst, 'reload schema';
