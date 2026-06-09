-- v28: Agregar código DL (Descanso Laborado) al enum codigo_asistencia.
-- ─────────────────────────────────────────────────────────────────────
-- DL = el trabajador laboró en su día de descanso → se paga TRIPLE (3x)
-- como un día feriado trabajado (LFT art. 73). Distinto de:
--   · DS = descanso semanal normal (pagado 1x, no trabajó)
--   · DT = doble turno (1x extra)
--
-- IMPORTANTE: alter type add value es idempotente con if not exists.
-- No puede ir dentro de una transacción junto a usos del nuevo valor,
-- pero como statement único (Supabase Studio lo corre en autocommit) está OK.

alter type codigo_asistencia add value if not exists 'DL' after 'DS';

notify pgrst, 'reload schema';
