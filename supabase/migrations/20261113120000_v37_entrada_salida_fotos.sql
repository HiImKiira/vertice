-- v37: Entrada/Salida con horarios + foto de respaldo en cada checada.
-- ─────────────────────────────────────────────────────────────────────
-- Para los Eventos Extraordinarios (Xmatkuil) se registra hora de ENTRADA y
-- de SALIDA sobre la MISMA fila diaria de asistencias (unique empleado×fecha),
-- junto con una foto tomada en el momento del escaneo. La foto es evidencia
-- de que la persona estuvo físicamente ahí: si un supervisor marca a alguien
-- que no vino, la foto no coincide.
--
--   · hora_entrada / hora_salida: timestamptz del escaneo.
--   · foto_entrada / foto_salida: path dentro del bucket privado.
--
-- El código de asistencia sigue siendo 'A' (una fila por día); entrada/salida
-- son metadatos de esa fila, no cambian el pase de lista ni los reportes.

alter table asistencias add column if not exists hora_entrada  timestamptz;
alter table asistencias add column if not exists hora_salida   timestamptz;
alter table asistencias add column if not exists foto_entrada  text;
alter table asistencias add column if not exists foto_salida   text;

comment on column asistencias.hora_entrada is 'Timestamp del escaneo de entrada (Eventos Extraordinarios).';
comment on column asistencias.hora_salida  is 'Timestamp del escaneo de salida (Eventos Extraordinarios).';
comment on column asistencias.foto_entrada is 'Path en bucket asistencia-fotos de la foto tomada al marcar entrada.';
comment on column asistencias.foto_salida  is 'Path en bucket asistencia-fotos de la foto tomada al marcar salida.';

-- Bucket PRIVADO para las fotos (se sirven con signed URLs desde el panel admin).
insert into storage.buckets (id, name, public)
values ('asistencia-fotos', 'asistencia-fotos', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
