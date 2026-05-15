-- ============================================================
-- Vértice — migración v2.1: ajustes de shape descubiertos
-- al inspeccionar el dataset real (348 empleados, 13 usuarios).
--
-- Cambios:
--  1. user_role: + 'SOPORTE'  (Edy es SOPORTE en USUARIOS, mi enum no lo tenía)
--  2. jornada:   + 'TURNO_ROTATIVO', 'CUBRETURNOS', 'DIURNO'
--                (data real tiene 4 + 89 + 39 jornadas estándar + 5 raras)
--  3. empleados.dia_descanso: dia_semana → dia_semana[]
--     (16 empleados descansan SAB+DOM, los demás 1 solo día)
-- ============================================================

-- 1) Agregar valor SOPORTE al enum user_role
alter type user_role add value if not exists 'SOPORTE';

-- 2) Agregar valores extra al enum jornada
alter type jornada add value if not exists 'TURNO_ROTATIVO';
alter type jornada add value if not exists 'CUBRETURNOS';
alter type jornada add value if not exists 'DIURNO';

-- 3) empleados.dia_descanso: enum → array
-- La vista vw_empleados_activos depende de esta columna; hay que dropearla
-- antes del ALTER y recrearla después.
drop view if exists vw_empleados_activos;

alter table empleados
  alter column dia_descanso drop default,
  alter column dia_descanso type dia_semana[] using array[dia_descanso]::dia_semana[],
  alter column dia_descanso set default '{DOM}'::dia_semana[];

create or replace view vw_empleados_activos as
  select e.*, s.codigo as sede_codigo, s.nombre as sede_nombre, s.abrev as sede_abrev
  from empleados e
  join sedes s on s.id = e.sede_id
  where e.fecha_baja is null;
