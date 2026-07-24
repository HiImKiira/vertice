-- v32: COORDINACION con acceso "tipo ADMIN" a sus módulos RH (caso Pedro).
-- ─────────────────────────────────────────────────────────────────────
-- Objetivo: Pedro (COORDINACION) puede REALIZAR todo en sus módulos —
-- registrar contratos, dar altas/bajas, editar consulta— viendo GLOBAL
-- (todos los empleados/contratos), como un admin. Pero:
--   · NO se toca es_admin() ni es_soporte_o_admin() (esos controlan
--     asistencias/usuarios/sedes globales; darle eso rompería que en pase de
--     lista solo vea SU sede y le dejaría sobrescribir marcas de cualquier sede).
--   · Se le abre solo lo de RH-empleados/contratos con es_coordinacion()
--     (definida en v31), tabla por tabla.
--   · La captura de asistencias NO se toca: Pedro marca su sede (PDCW) por su
--     asignación de supervisor, no por este rol.

-- ── empleados: lectura global + escritura (alta/baja de cualquiera) ──
drop policy if exists "empleados_select_sede_o_admin" on empleados;
create policy "empleados_select_sede_o_admin" on empleados for select to authenticated
  using (es_soporte_o_admin() or es_coordinacion() or sede_id in (select sedes_de_usuario()));

drop policy if exists "empleados_admin_write" on empleados;
create policy "empleados_admin_write" on empleados for all to authenticated
  using (es_admin() or es_coordinacion())
  with check (es_admin() or es_coordinacion());

-- ── contratos: leer y escribir (registrar/editar) ──
drop policy if exists "contratos_select_admin" on contratos;
create policy "contratos_select_admin" on contratos for select to authenticated
  using (es_admin() or es_coordinacion());

drop policy if exists "contratos_admin_write" on contratos;
create policy "contratos_admin_write" on contratos for all to authenticated
  using (es_admin() or es_coordinacion())
  with check (es_admin() or es_coordinacion());

-- ── config_contratos: leer la config para generar el contrato ──
drop policy if exists "config_contratos_select_admin" on config_contratos;
create policy "config_contratos_select_admin" on config_contratos for select to authenticated
  using (es_admin() or es_coordinacion());

-- ── asistencias: SOLO lectura global (reportes de cualquier sede + histórico
--    en consulta). El INSERT/UPDATE se deja SIN tocar: Pedro captura solo su
--    sede asignada, como cualquier supervisor. ──
drop policy if exists "asistencias_select" on asistencias;
create policy "asistencias_select" on asistencias for select to authenticated
  using (
    es_soporte_o_admin()
    or es_coordinacion()
    or empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
  );

-- ── storage del PDF de contratos: leer/escribir/actualizar (generar y bajar) ──
do $$ begin
  drop policy if exists "contratos_pdf_read_admin" on storage.objects;
  create policy "contratos_pdf_read_admin" on storage.objects for select to authenticated
    using (bucket_id = 'contratos-pdf' and (es_admin() or es_coordinacion()));

  drop policy if exists "contratos_pdf_write_admin" on storage.objects;
  create policy "contratos_pdf_write_admin" on storage.objects for insert to authenticated
    with check (bucket_id = 'contratos-pdf' and (es_admin() or es_coordinacion()));

  drop policy if exists "contratos_pdf_update_admin" on storage.objects;
  create policy "contratos_pdf_update_admin" on storage.objects for update to authenticated
    using (bucket_id = 'contratos-pdf' and (es_admin() or es_coordinacion()))
    with check (bucket_id = 'contratos-pdf' and (es_admin() or es_coordinacion()));
exception when others then null; end $$;

notify pgrst, 'reload schema';
