-- v31: COORDINACION puede gestionar Incapacidades IMSS.
-- ─────────────────────────────────────────────────────────────────────
-- COORDINACION (caso Pedro) no tiene sedes asignadas y NO está en
-- es_soporte_o_admin() —a propósito, para no heredar permisos de RH completo
-- (ej. sobrescribir marcas de pase de lista). Por eso, sin esta migración
-- vería la lista de incapacidades VACÍA: el RLS filtra por sedes_de_usuario().
--
-- Aquí se le abre acceso SOLO a las tres tablas del módulo de incapacidades.
-- No se toca es_soporte_o_admin(), así que su acceso al resto del sistema
-- (asistencias, empleados, facturación, etc.) queda igual de restringido.

create or replace function es_coordinacion()
returns boolean
language sql stable
as $$
  select rol_actual() = 'COORDINACION';
$$;

comment on function es_coordinacion() is
  'True solo para el rol COORDINACION (perfil acotado: reportes, altas/bajas, contratos, supervisión, incapacidades).';

-- ── incapacidades ────────────────────────────────────────────────────
drop policy if exists "incap_select" on incapacidades;
create policy "incap_select" on incapacidades for select to authenticated
  using (
    es_soporte_o_admin()
    or es_coordinacion()
    or empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
  );

drop policy if exists "incap_insert" on incapacidades;
create policy "incap_insert" on incapacidades for insert to authenticated
  with check (
    es_soporte_o_admin()
    or es_coordinacion()
    or (
      reportada_por = auth.uid()
      and empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
    )
  );

drop policy if exists "incap_update" on incapacidades;
create policy "incap_update" on incapacidades for update to authenticated
  using (es_soporte_o_admin() or es_coordinacion())
  with check (es_soporte_o_admin() or es_coordinacion());

-- ── incapacidad_eventos (timeline) ───────────────────────────────────
drop policy if exists "incap_eventos_select" on incapacidad_eventos;
create policy "incap_eventos_select" on incapacidad_eventos for select to authenticated
  using (
    es_soporte_o_admin()
    or es_coordinacion()
    or incapacidad_id in (
      select id from incapacidades
      where empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
    )
  );

drop policy if exists "incap_eventos_insert" on incapacidad_eventos;
create policy "incap_eventos_insert" on incapacidad_eventos for insert to authenticated
  with check (es_soporte_o_admin() or es_coordinacion() or usuario_id = auth.uid());

-- ── incapacidad_documentos ───────────────────────────────────────────
drop policy if exists "incap_docs_select" on incapacidad_documentos;
create policy "incap_docs_select" on incapacidad_documentos for select to authenticated
  using (
    es_soporte_o_admin()
    or es_coordinacion()
    or incapacidad_id in (
      select id from incapacidades
      where empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
    )
  );

drop policy if exists "incap_docs_insert" on incapacidad_documentos;
create policy "incap_docs_insert" on incapacidad_documentos for insert to authenticated
  with check (
    es_soporte_o_admin()
    or es_coordinacion()
    or (
      subido_por = auth.uid()
      and incapacidad_id in (
        select id from incapacidades
        where empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
      )
    )
  );

drop policy if exists "incap_docs_delete" on incapacidad_documentos;
create policy "incap_docs_delete" on incapacidad_documentos for delete to authenticated
  using (es_soporte_o_admin() or es_coordinacion());

notify pgrst, 'reload schema';
