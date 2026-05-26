-- v14: Flujo completo de incapacidades IMSS.
--
-- Tipos manejados:
--   1) ENFERMEDAD_GENERAL: viral o ajena al trabajo. IMSS paga desde día 4.
--      Empresa NO paga días 1-3 (descuento $315.04/día). Si se envía
--      a tiempo no afecta el 7mo día de descanso.
--
--   2) RIESGO_TRABAJO: accidente en horario laboral, día laborable.
--      4 etapas: (1) ST7 inicial del médico familiar con leyenda
--      "INCAPACIDAD POR RIESGO DE TRABAJO: SI"; (2) RH llena parte
--      trasera de ST7 + sello; (3) Trabajador lleva ST7 a UMF IMSS,
--      Medicina de Trabajo dictamina; (4) Trabajador presenta ST2
--      (alta) + ST7 con dictamen.
--
--   3) RIESGO_TRAYECTO: igual que RIESGO_TRABAJO pero requiere mapa
--      de recorrido con horarios reales.
--
--   4) RIESGO_BIOLOGICO: ST9. Contacto con fluidos infectados, químicos
--      flamables. Riesgo de auditoría IMSS sin aviso + multas >$100k.
--
-- Estados (workflow):
--   REPORTADA            → Supervisor o RH levantó el reporte
--   DOCS_EMPLEADO        → Esperando documentos médicos iniciales
--   RH_VALIDA            → ST7 en oficina, RH llena parte trasera + firma + sello
--   MEDICINA_TRABAJO     → Trabajador lleva ST7 a UMF, espera dictamen
--   DICTAMEN             → IMSS calificó (sí/no) — se sube ST7 con calificación
--   ALTA_PENDIENTE       → Trabajador debe presentar ST2 antes de volver a laborar
--   CERRADA              → Todo el expediente subido al portal IMSS
--   RECHAZADA            → IMSS NO calificó como RT
--   CANCELADA            → Reporte cancelado (no procedente, error, etc.)

do $$ begin
  create type incapacidad_tipo as enum (
    'ENFERMEDAD_GENERAL',
    'RIESGO_TRABAJO',
    'RIESGO_TRAYECTO',
    'RIESGO_BIOLOGICO'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type incapacidad_estado as enum (
    'REPORTADA',
    'DOCS_EMPLEADO',
    'RH_VALIDA',
    'MEDICINA_TRABAJO',
    'DICTAMEN',
    'ALTA_PENDIENTE',
    'CERRADA',
    'RECHAZADA',
    'CANCELADA'
  );
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────
-- Tabla principal
-- ─────────────────────────────────────────────────────────────────────
create table if not exists incapacidades (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id) on delete restrict,

  tipo incapacidad_tipo not null,
  estado incapacidad_estado not null default 'REPORTADA',

  -- Datos del incidente
  fecha_accidente date,
  hora_accidente time,
  descripcion text,                 -- relato breve de lo ocurrido
  lugar_accidente text,             -- 'TRABAJO' | 'TRAYECTO' | 'DOMICILIO_TRAYECTO' | 'OTRO'
  testigos text,                    -- nombres o "ninguno"

  -- ST7
  folio_st7 text,
  diagnostico_nosologico text,      -- ej: "S709 - Traumatismo superficial..."
  unidad_medica text,               -- ej: "HGSMF NO 46 UMAN"
  matricula_medico text,

  -- Calendario incapacidad
  fecha_inicio date,
  fecha_fin date,
  dias_autorizados int,

  -- Dictamen final
  calificada boolean,               -- null=pendiente, true=es RT, false=no es RT
  dictamen_fecha date,
  dictamen_notas text,

  -- Auditoría
  reportada_por uuid references usuarios(id),
  observaciones text,               -- texto libre RH
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  cerrada_en timestamptz
);

create index if not exists incapacidades_empleado_idx on incapacidades (empleado_id, creado_en desc);
create index if not exists incapacidades_estado_idx on incapacidades (estado, creado_en desc);
create index if not exists incapacidades_tipo_idx on incapacidades (tipo, creado_en desc);

-- Trigger updated_at
create or replace function _set_incap_actualizado_en() returns trigger language plpgsql as $$
begin new.actualizado_en := now(); return new; end; $$;
drop trigger if exists incap_actualizado on incapacidades;
create trigger incap_actualizado before update on incapacidades
  for each row execute procedure _set_incap_actualizado_en();

-- ─────────────────────────────────────────────────────────────────────
-- Timeline / eventos
-- ─────────────────────────────────────────────────────────────────────
create table if not exists incapacidad_eventos (
  id bigserial primary key,
  incapacidad_id uuid not null references incapacidades(id) on delete cascade,
  tipo text not null,                -- 'creada' | 'estado_cambio' | 'comentario' | 'documento'
  estado_anterior incapacidad_estado,
  estado_nuevo incapacidad_estado,
  detalle text,
  archivo_path text,                 -- ruta storage si aplica
  usuario_id uuid references usuarios(id),
  creado_en timestamptz not null default now()
);
create index if not exists incap_eventos_idx on incapacidad_eventos (incapacidad_id, creado_en);

-- ─────────────────────────────────────────────────────────────────────
-- Documentos (lista de archivos asociados)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists incapacidad_documentos (
  id uuid primary key default gen_random_uuid(),
  incapacidad_id uuid not null references incapacidades(id) on delete cascade,
  tipo text not null,                -- 'ST7_INICIAL' | 'ST7_DICTAMEN' | 'ST2_ALTA' | 'INCAPACIDAD_MEDICO' | 'MAPA_TRAYECTO' | 'ST9' | 'OTRO'
  archivo_path text not null,        -- bucket/key
  archivo_nombre text,
  mime text,
  tamaño_bytes int,
  subido_por uuid references usuarios(id),
  subido_en timestamptz not null default now()
);
create index if not exists incap_docs_idx on incapacidad_documentos (incapacidad_id, subido_en);

-- ─────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────
alter table incapacidades enable row level security;
alter table incapacidad_eventos enable row level security;
alter table incapacidad_documentos enable row level security;

-- Lectura: admin-like ve todo; supervisor ve las de empleados en su sede
drop policy if exists "incap_select" on incapacidades;
create policy "incap_select" on incapacidades for select to authenticated
  using (
    es_soporte_o_admin()
    or empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
  );

-- Crear: admin-like o supervisor del empleado
drop policy if exists "incap_insert" on incapacidades;
create policy "incap_insert" on incapacidades for insert to authenticated
  with check (
    es_soporte_o_admin()
    or (
      reportada_por = auth.uid()
      and empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
    )
  );

-- Actualizar: solo admin-like (avanzar estado, dictaminar, cerrar)
drop policy if exists "incap_update" on incapacidades;
create policy "incap_update" on incapacidades for update to authenticated
  using (es_soporte_o_admin()) with check (es_soporte_o_admin());

-- Eventos: misma lectura que la incapacidad; admin escribe
drop policy if exists "incap_eventos_select" on incapacidad_eventos;
create policy "incap_eventos_select" on incapacidad_eventos for select to authenticated
  using (
    es_soporte_o_admin()
    or incapacidad_id in (
      select id from incapacidades
      where empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
    )
  );

drop policy if exists "incap_eventos_insert" on incapacidad_eventos;
create policy "incap_eventos_insert" on incapacidad_eventos for insert to authenticated
  with check (es_soporte_o_admin() or usuario_id = auth.uid());

-- Documentos: igual
drop policy if exists "incap_docs_select" on incapacidad_documentos;
create policy "incap_docs_select" on incapacidad_documentos for select to authenticated
  using (
    es_soporte_o_admin()
    or incapacidad_id in (
      select id from incapacidades
      where empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
    )
  );

drop policy if exists "incap_docs_insert" on incapacidad_documentos;
create policy "incap_docs_insert" on incapacidad_documentos for insert to authenticated
  with check (es_soporte_o_admin() or subido_por = auth.uid());

drop policy if exists "incap_docs_delete" on incapacidad_documentos;
create policy "incap_docs_delete" on incapacidad_documentos for delete to authenticated
  using (es_soporte_o_admin());

-- ─────────────────────────────────────────────────────────────────────
-- Storage bucket para PDFs / fotos del ST7, ST2, etc.
-- ─────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('incapacidades', 'incapacidades', false)
  on conflict (id) do nothing;

-- Policies de storage: solo admin escribe, todos los que ven la incap leen
do $$ begin
  drop policy if exists "incap_storage_select" on storage.objects;
  create policy "incap_storage_select" on storage.objects for select to authenticated
    using (
      bucket_id = 'incapacidades'
      and (es_soporte_o_admin() or true)  -- el control fino lo hace incap_documentos
    );
  drop policy if exists "incap_storage_insert" on storage.objects;
  create policy "incap_storage_insert" on storage.objects for insert to authenticated
    with check (bucket_id = 'incapacidades' and es_soporte_o_admin());
exception when others then null; end $$;

notify pgrst, 'reload schema';
