-- v27: Cambio de descanso fijo (permanente) con auditoría.
-- ─────────────────────────────────────────────────────────────────────
-- El módulo /rh-pro/cambio-descanso permite cambiar el dia_descanso FIJO
-- de un trabajador individual (sede → trabajador → día → motivo), dejando
-- registro en empleado_movimientos. Distinto al módulo /descansos que es
-- temporal (CDTs de 1 semana) y NO toca empleados.dia_descanso.
--
-- Reutilizamos empleado_movimientos (creada en v20) agregando soporte para
-- el tipo 'cambio_descanso' con las columnas del estado anterior/nuevo.

-- 1) Columnas para registrar el cambio de día de descanso
alter table empleado_movimientos
  add column if not exists dia_descanso_anterior text[],
  add column if not exists dia_descanso_nuevo text[];

comment on column empleado_movimientos.dia_descanso_anterior is 'Días de descanso ANTES del cambio (solo para tipo=cambio_descanso)';
comment on column empleado_movimientos.dia_descanso_nuevo is 'Días de descanso DESPUÉS del cambio (solo para tipo=cambio_descanso)';

-- 2) Índice para consultar bitácora de cambios de descanso rápido
create index if not exists idx_empleado_movimientos_descanso
  on empleado_movimientos (efectuado_en desc)
  where tipo = 'cambio_descanso';

-- 3) RPC: bitácora reciente de cambios de descanso fijo (con nombres resueltos)
create or replace function bitacora_cambios_descanso(p_limite int default 30)
returns table (
  id bigint,
  empleado_id uuid,
  empleado_nombre text,
  empleado_numero text,
  sede_abrev text,
  dia_descanso_anterior text[],
  dia_descanso_nuevo text[],
  motivo text,
  efectuado_en timestamptz,
  efectuado_por_nombre text
)
language sql stable security definer
set search_path = public
as $$
  select
    m.id,
    m.empleado_id,
    e.nombre,
    e.numero_empleado,
    s.abrev,
    m.dia_descanso_anterior,
    m.dia_descanso_nuevo,
    m.motivo,
    m.efectuado_en,
    u.nombre
  from empleado_movimientos m
  join empleados e on e.id = m.empleado_id
  left join sedes s on s.id = e.sede_id
  left join usuarios u on u.id = m.efectuado_por
  where m.tipo = 'cambio_descanso'
  order by m.efectuado_en desc
  limit greatest(1, least(p_limite, 200));
$$;

grant execute on function bitacora_cambios_descanso(int) to authenticated;

notify pgrst, 'reload schema';
