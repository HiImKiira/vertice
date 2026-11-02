-- v36: Geocerca para la asistencia por QR.
-- ─────────────────────────────────────────────────────────────────────
-- Candado de seguridad: el escaneo solo vale si el teléfono que escanea está
-- físicamente DENTRO del radio de la sede. Evita que alguien marque desde su
-- casa escaneando fotos de credenciales.
--
--   · sedes.geo_lat / geo_lng: coordenadas del punto de la sede.
--   · sedes.geo_radio_m: radio permitido en metros (default 150).
--   · Solo ADMIN y SUPERADMIN pueden vincular/cambiar la ubicación (gate en
--     la server action). Si la sede no tiene geo vinculada, el escáner
--     funciona sin el candado (sedes que no lo necesitan no se afectan).

alter table sedes add column if not exists geo_lat double precision;
alter table sedes add column if not exists geo_lng double precision;
alter table sedes add column if not exists geo_radio_m int not null default 150;

comment on column sedes.geo_lat is 'Latitud del punto de la sede para la geocerca del escáner QR.';
comment on column sedes.geo_lng is 'Longitud del punto de la sede para la geocerca del escáner QR.';
comment on column sedes.geo_radio_m is 'Radio en metros dentro del cual se acepta el escaneo (default 150).';

notify pgrst, 'reload schema';
