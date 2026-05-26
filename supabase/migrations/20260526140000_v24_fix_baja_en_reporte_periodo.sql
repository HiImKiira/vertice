-- v24: Fix empleados_por_sede_periodo para excluir empleados dados de baja
-- antes del inicio del periodo.
--
-- Bug observado por el usuario: el PDF de nómina/asistencias incluía empleados
-- que ya estaban dados de baja (no aparecen en pase de lista, pero sí en el
-- export). La función v21 unía dos sets:
--   1) Empleados cuya sede ACTUAL es p_sede  ← incluye bajas si no se reasignó
--   2) Empleados con asistencias históricas en p_sede en el rango
--
-- Y luego solo filtraba por "tener al menos 1 día calculado en la sede". Eso
-- dejaba pasar empleados dados de baja ANTES de p_inicio pero que en algún
-- punto fueron asignados a p_sede.
--
-- Regla correcta: solo aparecen empleados que estuvieron ACTIVOS en algún
-- momento dentro del periodo. Es decir:
--   fecha_baja IS NULL                  (siguen activos)
--   OR fecha_baja >= p_inicio           (dados de baja durante o después del periodo)
--
-- Si la fecha_baja < p_inicio, ya estaban fuera ANTES del reporte y NO deben
-- aparecer (es lo mismo que el pase de lista, que ya filtra `fecha_baja IS NULL`).

drop function if exists empleados_por_sede_periodo(uuid, date, date);

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
  cambio_durante_periodo boolean,
  dias_en_sede int
)
language sql stable security definer
set search_path = public
as $$
  with candidates as (
    -- 1) Empleados cuya sede actual es p_sede (excluyendo bajas previas al periodo)
    select id from empleados
    where sede_id = p_sede
      and (fecha_baja is null or fecha_baja >= p_inicio)
    union
    -- 2) Empleados que tuvieron asistencias en p_sede históricamente
    --    durante el rango (estos no necesitan tener sede actual = p_sede;
    --    pueden haber migrado a otra sede, pero registramos los días que sí estuvieron).
    --    Excluimos bajas anteriores al periodo.
    select distinct ast.empleado_id
    from asistencias ast
    join empleados e on e.id = ast.empleado_id
    where ast.fecha between p_inicio and p_fin
      and sede_efectiva(ast.empleado_id, ast.fecha) = p_sede
      and (e.fecha_baja is null or e.fecha_baja >= p_inicio)
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
    select distinct mov.empleado_id
    from empleado_movimientos mov
    where mov.tipo in ('cambio_sede', 'multi')
      and mov.efectuado_en::date between p_inicio and p_fin
      and (mov.sede_anterior = p_sede or mov.sede_nueva = p_sede)
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
  where coalesce(d.dias, 0) > 0
    -- Doble seguridad: si fecha_baja existe Y es anterior al periodo, fuera.
    and (e.fecha_baja is null or e.fecha_baja >= p_inicio)
  order by e.numero_empleado;
$$;

grant execute on function empleados_por_sede_periodo(uuid, date, date) to authenticated;

notify pgrst, 'reload schema';
