-- v21: snapshot histórico de sede por empleado/fecha para reportes correctos
-- después de un cambio de sede en mitad del periodo (nómina).

-- Función: dado empleado_id y fecha, devuelve la sede a la que pertenecía
-- ese día (no necesariamente la actual).
create or replace function sede_efectiva(p_empleado uuid, p_fecha date)
returns uuid
language sql stable security definer
set search_path = public
as $$
  -- Buscamos el primer movimiento POSTERIOR a la fecha consultada.
  -- Si existe, el empleado estaba en sede_anterior ese día.
  -- Si no hay ningún movimiento posterior, está/estaba en su sede actual.
  select coalesce(
    (
      select sede_anterior
      from empleado_movimientos
      where empleado_id = p_empleado
        and tipo in ('cambio_sede', 'multi')
        and efectuado_en::date > p_fecha
        and sede_anterior is not null
      order by efectuado_en asc
      limit 1
    ),
    (select sede_id from empleados where id = p_empleado)
  );
$$;

grant execute on function sede_efectiva(uuid, date) to authenticated;

-- Función: empleados que estuvieron en la sede X durante un periodo dado.
-- Incluye los que YA NO están ahí (cambio mid-quincena) y excluye los que
-- llegaron DESPUÉS del fin del periodo.
create or replace function empleados_por_sede_periodo(
  p_sede uuid,
  p_inicio date,
  p_fin date
)
returns table (
  empleado_id uuid,
  numero_empleado text,
  nombre text,
  jornada text,
  salario_diario numeric,
  fecha_baja date,
  -- True si el empleado tuvo algún cambio de sede entre p_inicio y p_fin
  cambio_durante_periodo boolean,
  -- Días que estuvo en p_sede dentro del rango (cap: hasta p_fin)
  dias_en_sede int
)
language sql stable security definer
set search_path = public
as $$
  with candidates as (
    -- Empleados cuya sede actual es p_sede
    select id from empleados where sede_id = p_sede
    union
    -- Empleados que tuvieron asistencias en p_sede históricamente
    select distinct ast.empleado_id
    from asistencias ast
    where ast.fecha between p_inicio and p_fin
      and sede_efectiva(ast.empleado_id, ast.fecha) = p_sede
  ),
  dias_calc as (
    select c.id as empleado_id,
           count(*)::int as dias
    from candidates c
    cross join generate_series(p_inicio::timestamp, p_fin::timestamp, interval '1 day') g(d)
    where sede_efectiva(c.id, g.d::date) = p_sede
    group by c.id
  ),
  cambios_durante as (
    select distinct empleado_id
    from empleado_movimientos
    where tipo in ('cambio_sede', 'multi')
      and efectuado_en::date between p_inicio and p_fin
      and (sede_anterior = p_sede or sede_nueva = p_sede)
  )
  select e.id,
         e.numero_empleado,
         e.nombre,
         e.jornada::text,
         e.salario_diario,
         e.fecha_baja,
         (cd.empleado_id is not null) as cambio,
         coalesce(d.dias, 0)
  from candidates c
  join empleados e on e.id = c.id
  left join dias_calc d on d.empleado_id = e.id
  left join cambios_durante cd on cd.empleado_id = e.id
  where coalesce(d.dias, 0) > 0  -- solo los que efectivamente estuvieron en la sede
  order by e.numero_empleado;
$$;

grant execute on function empleados_por_sede_periodo(uuid, date, date) to authenticated;

-- Función: para un empleado y rango, devuelve sus asistencias FILTRADAS a
-- los días en que estaba en la sede dada. Útil para que el reporte no
-- cuente días de cuando ya estaba en otra sede.
create or replace function asistencias_empleado_en_sede(
  p_empleado uuid,
  p_sede uuid,
  p_inicio date,
  p_fin date
)
returns table (
  fecha date,
  codigo text
)
language sql stable security definer
set search_path = public
as $$
  select ast.fecha, ast.codigo::text
  from asistencias ast
  where ast.empleado_id = p_empleado
    and ast.fecha between p_inicio and p_fin
    and sede_efectiva(p_empleado, ast.fecha) = p_sede
  order by ast.fecha;
$$;

grant execute on function asistencias_empleado_en_sede(uuid, uuid, date, date) to authenticated;

notify pgrst, 'reload schema';
