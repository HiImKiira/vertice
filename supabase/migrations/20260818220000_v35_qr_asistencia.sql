-- v35: Asistencia por QR.
-- ─────────────────────────────────────────────────────────────────────
-- Cada trabajador de una sede DESIGNADA recibe una credencial con QR. El
-- supervisor la escanea con la cámara de su teléfono y Vortex marca la
-- asistencia (A) del día automáticamente.
--
--   · empleados.qr_token: token aleatorio único que vive dentro del QR.
--     NO es el numero_empleado (sería falsificable); es revocable: se
--     regenera y las credenciales viejas dejan de servir.
--   · sedes.qr_habilitado: solo las sedes designadas aceptan asistencia
--     por QR (se enciende desde /rh-pro/qr).

alter table empleados add column if not exists qr_token text;
alter table sedes add column if not exists qr_habilitado boolean not null default false;

-- Único cuando existe (los que no usan QR quedan null)
create unique index if not exists empleados_qr_token_unico
  on empleados (qr_token) where qr_token is not null;

comment on column empleados.qr_token is
  'Token del QR de asistencia (formato VTX1.xxxx). Revocable: regenerar invalida la credencial anterior.';
comment on column sedes.qr_habilitado is
  'True = sede designada para asistencia por QR (escáner y credenciales activos).';

notify pgrst, 'reload schema';
