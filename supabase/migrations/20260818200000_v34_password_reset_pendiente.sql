-- v34: aviso en-app de "define tu nueva contraseña".
-- ─────────────────────────────────────────────────────────────────────
-- Cuando RH restablece una contraseña, el push puede no abrirse (SW viejo,
-- notificación descartada…). Este flag hace que al abrir la app aparezca un
-- banner con botón directo a /cuenta, hasta que la persona defina la nueva.

alter table usuarios add column if not exists password_reset_pendiente boolean not null default false;

comment on column usuarios.password_reset_pendiente is
  'True cuando RH restableció la contraseña y el usuario aún no define la suya. El banner del dashboard lo muestra; /cuenta lo apaga al guardar.';

notify pgrst, 'reload schema';
