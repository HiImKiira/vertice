-- v18: RPCs de cobertura de captura por supervisor.
-- Para Centro LIVE: ver quién no terminó hoy + control de nómina (ayer).
-- "Empleados a capturar" = los que coinciden exactamente con las asignaciones
-- (sede_id, jornada) activas del supervisor, sin contar bajas.

-- ─────────────────────────────────────────────────────────────────────
-- cobertura_supervisores(fecha): vista resumen por supervisor en una fecha
-- ─────────────────────────────────────────────────────────────────────
create or replace function cobertura_supervisores(p_fecha date default null)
returns table (
  usuario_id uuid,
  username text,
  nombre text,
  sedes_n int,
  jornadas_n int,
  empleados_total int,
  capturadas int,
  pct_cobertura int,
  faltantes int,
  ultima_captura timestamptz
)
language sql stable security definer
set search_path = public
as $$
  with v_fecha as (
    select coalesce(p_fecha, (now() at time zone 'America/Merida')::date) as d
  ),
  asign as (
    select a.usuario_id, a.sede_id, a.jornada::text as jornada
    from asignaciones_supervisor a
    where a.activo = true
  ),
  emp_sup as (
    -- Empleados a cargo de cada supervisor (match exacto sede+jornada, sin baja)
    select distinct a.usuario_id, e.id as empleado_id
    from asign a
    join empleados e on e.sede_id = a.sede_id and e.jornada::text = a.jornada and e.fecha_baja is null
  ),
  totales as (
    select usuario_id, count(*)::int as n
    from emp_sup
    group by usuario_id
  ),
  capturadas_x_sup as (
    select es.usuario_id,
           count(distinct ast.empleado_id)::int as n_cap,
           max(ast.actualizado_en) as ultima
    from emp_sup es
    join asistencias ast on ast.empleado_id = es.empleado_id
    cross join v_fecha
    where ast.fecha = v_fecha.d
    group by es.usuario_id
  ),
  resumen_asign as (
    select usuario_id,
           count(distinct sede_id)::int as sedes_n,
           count(*)::int as jornadas_n
    from asign
    group by usuario_id
  )
  select
    u.id,
    u.username,
    u.nombre,
    coalesce(ra.sedes_n, 0),
    coalesce(ra.jornadas_n, 0),
    coalesce(t.n, 0),
    coalesce(c.n_cap, 0),
    case when coalesce(t.n, 0) > 0
         then least(100, round(coalesce(c.n_cap, 0)::numeric * 100 / t.n))::int
         else 0 end as pct,
    coalesce(t.n, 0) - coalesce(c.n_cap, 0),
    c.ultima
  from usuarios u
  join resumen_asign ra on ra.usuario_id = u.id
  left join totales t on t.usuario_id = u.id
  left join capturadas_x_sup c on c.usuario_id = u.id
  where u.activo = true and u.rol = 'USER'
  order by pct asc, u.nombre;
$$;

grant execute on function cobertura_supervisores(date) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- cobertura_supervisor_detalle(usuario_id, fecha): breakdown por sede×jornada
-- ─────────────────────────────────────────────────────────────────────
create or replace function cobertura_supervisor_detalle(
  p_usuario_id uuid,
  p_fecha date default null
)
returns table (
  sede_id uuid,
  sede_abrev text,
  sede_nombre text,
  jornada text,
  empleados int,
  capturadas int,
  pct int,
  ultima_captura timestamptz
)
language sql stable security definer
set search_path = public
as $$
  with v_fecha as (
    select coalesce(p_fecha, (now() at time zone 'America/Merida')::date) as d
  ),
  asign as (
    select a.sede_id, a.jornada::text as jornada
    from asignaciones_supervisor a
    where a.usuario_id = p_usuario_id and a.activo = true
  ),
  por_combo as (
    select a.sede_id, a.jornada,
           count(e.id)::int as emp_n,
           count(ast.id)::int as cap_n,
           max(ast.actualizado_en) as ultima
    from asign a
    left join empleados e on e.sede_id = a.sede_id and e.jornada::text = a.jornada and e.fecha_baja is null
    left join asistencias ast on ast.empleado_id = e.id and ast.fecha = (select d from v_fecha)
    group by a.sede_id, a.jornada
  )
  select
    p.sede_id,
    s.abrev,
    s.nombre,
    p.jornada,
    p.emp_n,
    p.cap_n,
    case when p.emp_n > 0 then least(100, round(p.cap_n::numeric * 100 / p.emp_n))::int else 0 end,
    p.ultima
  from por_combo p
  join sedes s on s.id = p.sede_id
  order by s.abrev, p.jornada;
$$;

grant execute on function cobertura_supervisor_detalle(uuid, date) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- cobertura_mensual_supervisor(usuario_id, year, month): días esperados vs reales
-- Útil para responder "¿cuántos registros debe haber al mes?".
-- ─────────────────────────────────────────────────────────────────────
create or replace function cobertura_mensual_supervisor(
  p_usuario_id uuid,
  p_year int,
  p_month int
)
returns table (
  total_empleados int,
  dias_mes int,
  dias_transcurridos int,
  registros_esperados_mes int,
  registros_esperados_a_hoy int,
  registros_capturados int,
  pct_mes int,
  pct_a_hoy int,
  dias_con_100 int,
  dias_con_0 int
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_inicio date := make_date(p_year, p_month, 1);
  v_fin date := (v_inicio + interval '1 month' - interval '1 day')::date;
  v_hoy date := (now() at time zone 'America/Merida')::date;
  v_hasta date := least(v_fin, v_hoy);
  v_dias_mes int := extract(day from v_fin)::int;
  v_dias_trans int := case when v_hasta >= v_inicio then (v_hasta - v_inicio + 1)::int else 0 end;
  v_emp_total int;
  v_regs_real int;
  v_regs_esp_mes int;
  v_regs_esp_hoy int;
  v_d100 int;
  v_d0 int;
begin
  -- Empleados a cargo
  select count(distinct e.id)::int into v_emp_total
  from asignaciones_supervisor a
  join empleados e on e.sede_id = a.sede_id and e.jornada::text = a.jornada::text and e.fecha_baja is null
  where a.usuario_id = p_usuario_id and a.activo = true;

  v_regs_esp_mes := v_emp_total * v_dias_mes;
  v_regs_esp_hoy := v_emp_total * v_dias_trans;

  -- Registros reales en el mes
  select count(*)::int into v_regs_real
  from asistencias ast
  join empleados e on e.id = ast.empleado_id
  join asignaciones_supervisor a on a.sede_id = e.sede_id and a.jornada::text = e.jornada::text
  where a.usuario_id = p_usuario_id and a.activo = true
    and ast.fecha between v_inicio and v_hasta;

  -- Días con 100% / 0%
  select
    count(*) filter (where dia_pct = 100)::int,
    count(*) filter (where dia_pct = 0)::int
  into v_d100, v_d0
  from (
    select ast_dia.fecha,
           case when v_emp_total > 0
                then least(100, round(count(distinct ast_dia.empleado_id)::numeric * 100 / v_emp_total))::int
                else 0 end as dia_pct
    from generate_series(v_inicio, v_hasta, interval '1 day') as g(fecha)
    left join asistencias ast_dia on ast_dia.fecha = g.fecha::date
      and ast_dia.empleado_id in (
        select e.id from asignaciones_supervisor a
        join empleados e on e.sede_id = a.sede_id and e.jornada::text = a.jornada::text and e.fecha_baja is null
        where a.usuario_id = p_usuario_id and a.activo = true
      )
    group by ast_dia.fecha
  ) dias;

  return query select
    v_emp_total,
    v_dias_mes,
    v_dias_trans,
    v_regs_esp_mes,
    v_regs_esp_hoy,
    v_regs_real,
    case when v_regs_esp_mes > 0 then least(100, round(v_regs_real::numeric * 100 / v_regs_esp_mes))::int else 0 end,
    case when v_regs_esp_hoy > 0 then least(100, round(v_regs_real::numeric * 100 / v_regs_esp_hoy))::int else 0 end,
    coalesce(v_d100, 0),
    coalesce(v_d0, 0);
end;
$$;

grant execute on function cobertura_mensual_supervisor(uuid, int, int) to authenticated;

notify pgrst, 'reload schema';
