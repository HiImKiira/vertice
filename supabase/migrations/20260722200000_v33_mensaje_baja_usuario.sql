-- v33: mensaje de baja por usuario, mostrado en el login.
-- ─────────────────────────────────────────────────────────────────────
-- Cuando un usuario está dado de baja/baneado, en lugar del error genérico
-- ("Credenciales incorrectas" / "User is banned") el login muestra este texto.
-- El valor con acentos se setea desde el CLI con service role (UTF-8 seguro),
-- no aquí, para evitar cualquier mojibake al pegar en el editor SQL.

alter table usuarios add column if not exists mensaje_baja text;

comment on column usuarios.mensaje_baja is
  'Si está presente, el login lo muestra en vez del error genérico (usuario dado de baja).';

notify pgrst, 'reload schema';
