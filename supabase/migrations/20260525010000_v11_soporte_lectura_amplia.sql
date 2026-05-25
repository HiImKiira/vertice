-- v11: Extender lectura a SOPORTE en tablas que solo permitían es_admin().
-- Edy (SOPORTE) no podía consultar empleados, contratos ni asistencias
-- históricas porque las policies de SELECT solo aceptaban
-- ADMIN/CEO/SUPERADMIN. Ahora pueden leer (no escribir) igual que ellos.
--
-- Mantiene la restricción de escritura: SOPORTE solo escribe lo que ya tenía
-- permitido (tickets, mensajes, fechas_liberadas, push_subs).

-- Dependencia: helper es_soporte_o_admin (idempotente por si v6 no se aplicó)
create or replace function es_soporte_o_admin()
returns boolean
language sql stable
as $$
  select rol_actual() in ('ADMIN', 'CEO', 'SUPERADMIN', 'SOPORTE');
$$;

-- ─────────────────────────────────────────────────────────────────────
-- EMPLEADOS: SOPORTE puede leer todo igual que admin (consulta histórica)
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists "empleados_select_sede_o_admin" on empleados;
create policy "empleados_select_sede_o_admin" on empleados for select to authenticated
  using (es_soporte_o_admin() or sede_id in (select sedes_de_usuario()));

-- ─────────────────────────────────────────────────────────────────────
-- ASISTENCIAS: SOPORTE puede leer todo (para histórico en /consulta)
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists "asistencias_select" on asistencias;
create policy "asistencias_select" on asistencias for select to authenticated
  using (
    es_soporte_o_admin()
    or empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
  );

-- ─────────────────────────────────────────────────────────────────────
-- CONTRATOS: SOPORTE lee igual que admin
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists "contratos_select_admin" on contratos;
create policy "contratos_select_admin" on contratos for select to authenticated
  using (es_soporte_o_admin());

-- ─────────────────────────────────────────────────────────────────────
-- INCIDENCIAS: SOPORTE puede leer todo
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists "incidencias_select" on incidencias;
create policy "incidencias_select" on incidencias for select to authenticated
  using (
    es_soporte_o_admin()
    or empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
  );

notify pgrst, 'reload schema';
