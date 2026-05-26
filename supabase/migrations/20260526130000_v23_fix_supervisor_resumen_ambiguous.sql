-- v23: Fix "column reference 'activo' is ambiguous" en supervisor_resumen.
--
-- El bug: dentro de la query principal (FROM usuarios u) hay subqueries
-- correlated sobre `push_subscriptions` y `asignaciones_supervisor`,
-- ambas tienen columna `activo`. Postgres resuelve `activo` en la subquery
-- como ambiguo porque también podría referirse a `u.activo` (outer scope
-- correlation).
--
-- Solución: calificar TODAS las referencias a `activo` con su tabla.
-- También agregamos el flag `acceso_facturacion` al output, ya que la UI
-- ahora lo necesita.

drop function if exists supervisor_resumen(uuid);

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
  ultima_captura timestamptz,
  ausente_desde date,
  ausente_hasta date,
  ausente_motivo text,
  esta_ausente boolean,
  acceso_facturacion boolean
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
    select asg.sede_id, asg.jornada::text as jornada
    from asignaciones_supervisor asg
    where asg.usuario_id = p_usuario_id
      and asg.activo = true
  ),
  emp_sup as (
    select distinct e.id, e.sede_id, e.jornada::text as jornada
    from asign a
    join empleados e
      on e.sede_id = a.sede_id
     and e.jornada::text = a.jornada
     and e.fecha_baja is null
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
    (select count(distinct a.sede_id)::int from asign a),
    (select count(*)::int from asign),
    (select count(*)::int from emp_sup),
    coalesce((
      select count(distinct ast.empleado_id)::int
      from asistencias ast
      where ast.fecha = v_hoy
        and ast.empleado_id in (select es.id from emp_sup es)
    ), 0),
    (select count(*)::int from emp_sup),
    case when (select count(*) from emp_sup) > 0
      then least(100, round(
        coalesce((
          select count(distinct ast.empleado_id)::numeric
          from asistencias ast
          where ast.fecha = v_hoy
            and ast.empleado_id in (select es.id from emp_sup es)
        ), 0)
        * 100 / (select count(*) from emp_sup)
      ))::int
      else 0 end,
    coalesce((
      select count(*)::int from asistencias ast
      where ast.fecha >= v_inicio_mes
        and ast.fecha <= v_hoy
        and ast.capturado_por = p_usuario_id
    ), 0),
    coalesce((
      select count(*)::int from tickets_soporte ts
      where ts.supervisor_id = p_usuario_id
        and ts.estado != 'CERRADO'
    ), 0),
    coalesce((
      -- IMPORTANTE: calificar push_subscriptions.activo para evitar
      -- ambigüedad con u.activo del outer scope.
      select count(*)::int
      from push_subscriptions ps
      where ps.usuario_id = p_usuario_id
        and ps.activo = true
    ), 0),
    (select max(ast.actualizado_en) from asistencias ast where ast.capturado_por = p_usuario_id),
    u.ausente_desde,
    u.ausente_hasta,
    u.ausente_motivo,
    usuario_esta_ausente(u.id, v_hoy),
    coalesce(u.acceso_facturacion, false)
  from usuarios u
  left join usuarios aut on aut.id = u.notas_actualizado_por
  where u.id = p_usuario_id;
end;
$$;

grant execute on function supervisor_resumen(uuid) to authenticated;

notify pgrst, 'reload schema';
