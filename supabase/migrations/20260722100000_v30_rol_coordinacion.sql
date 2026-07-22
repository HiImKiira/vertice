-- v30: Rol COORDINACION — perfil acotado (caso Pedro).
-- ─────────────────────────────────────────────────────────────────────
-- Acceso permitido:
--   · Reportes PDF / Excel (nómina y asistencias)
--   · Alta y baja de empleados + módulo de contratos + consulta de empleados
--   · Centro de supervisores: medición del avance de quincena y push a supervisores
--
-- NO tiene: facturación, sedes, descansos, liberaciones, LIVE, actividad,
-- ni permisos sensibles (crear/eliminar supervisores, resetear passwords —
-- eso sigue siendo SUPERADMIN/SOPORTE).
--
-- Nota: COORDINACION NO se agrega a es_soporte_o_admin() a propósito, para que
-- no herede permisos de RLS de RH completo (ej. sobrescribir marcas de
-- pase de lista ya capturadas).

alter type user_role add value if not exists 'COORDINACION';

notify pgrst, 'reload schema';
