-- v9: Fix de la función fecha_liberada_para_usuario.
--
-- Bug: la función original (init.sql:240) referenciaba
-- fechas_liberadas.supervisor_id, pero esa columna se dropeo en v2
-- (cuando fechas_liberadas pasó a ser global). El error
-- "column supervisor_id does not exist" aparece al evaluar el RLS de
-- asistencias_insert para cualquier supervisor capturando.
--
-- Fix: reescribir la función como "fecha está liberada globalmente y
-- no expirada". p_usuario se ignora (lo dejamos como parámetro por
-- compatibilidad con las RLS que ya lo usan).

-- ─────────────────────────────────────────────────────────────────────
-- 0) Dependencias de v7 y v6 (idempotentes, por si no se aplicaron)
-- ─────────────────────────────────────────────────────────────────────
alter table fechas_liberadas add column if not exists expira_en timestamptz;

create or replace function es_soporte_o_admin()
returns boolean
language sql stable
as $$
  select rol_actual() in ('ADMIN', 'CEO', 'SUPERADMIN', 'SOPORTE');
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 1) Fix de fecha_liberada_para_usuario
-- ─────────────────────────────────────────────────────────────────────
create or replace function fecha_liberada_para_usuario(p_fecha date, p_usuario uuid)
returns boolean
language sql stable
as $$
  select exists (
    select 1 from fechas_liberadas
    where fecha = p_fecha
      and activo = true
      and (expira_en is null or expira_en > now())
  );
$$;

comment on function fecha_liberada_para_usuario is
  'Fecha liberada globalmente (no por usuario individual). El segundo parámetro se mantiene por compatibilidad con policies existentes.';

-- Mientras estamos, también permitamos a SOPORTE capturar como admin
-- (la policy v5 ya tiene es_admin() OR ... — agregamos un OR es_soporte_o_admin para incluir SOPORTE)
drop policy if exists "asistencias_insert" on asistencias;
create policy "asistencias_insert" on asistencias for insert to authenticated
  with check (
    es_soporte_o_admin()
    or (
      capturado_por = auth.uid()
      and empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
      and (
        fecha >= current_date - 1
        or fecha_liberada_para_usuario(fecha, auth.uid())
      )
    )
  );

drop policy if exists "asistencias_update" on asistencias;
create policy "asistencias_update" on asistencias for update to authenticated
  using (
    es_soporte_o_admin()
    or (
      capturado_por = auth.uid()
      and (
        fecha >= current_date - 1
        or fecha_liberada_para_usuario(fecha, auth.uid())
      )
    )
  )
  with check (
    es_soporte_o_admin()
    or (
      capturado_por = auth.uid()
      and (
        fecha >= current_date - 1
        or fecha_liberada_para_usuario(fecha, auth.uid())
      )
    )
  );

notify pgrst, 'reload schema';
