-- ============================================================
-- Vortex — migración v3: módulo de contratos / alta
--
-- Replica el modelo del Apps Script de altas + tablas relacionadas:
--   1. config_contratos: key/value de constantes legales (empresa,
--      representante, acta, plantillas, proyecto, etc.)
--   2. contratos: snapshot completo del contrato individual con
--      folio MHS/<ABREV>/NNN/2026, datos del trabajador, sueldo,
--      jornada y links al PDF generado.
--   3. Trigger que actualiza sedes.ultimo_folio al crear contrato.
-- ============================================================

-- ─── 1) CONFIG_CONTRATOS ───
create table if not exists config_contratos (
  clave        text primary key,
  valor        text not null,
  descripcion  text,
  actualizado_en timestamptz not null default now()
);

alter table config_contratos enable row level security;
create policy "config_contratos_select_admin" on config_contratos for select to authenticated
  using (es_admin());
create policy "config_contratos_write_superadmin" on config_contratos for all to authenticated
  using (es_superadmin()) with check (es_superadmin());

-- Seed inicial (constantes de la empresa MHS Integradora)
insert into config_contratos (clave, valor, descripcion) values
  ('EMPRESA',                   'MHS INTEGRADORA COMERCIAL Y DE SERVICIOS S. DE R.L. DE C.V.', 'Razón social'),
  ('REPRESENTANTE_LEGAL',       'SERGIO FERNANDO MENA HERRERA',                                'Representante legal'),
  ('DOMICILIO_FISCAL',          'Calle 26-B número 460, entre 45 y 47, Colonia Roble Agrícola, C.P. 97255, Mérida, Yucatán.', 'Domicilio fiscal'),
  ('ACTA_REFERENCIA',           'acta número novecientos cincuenta y dos, de fecha nueve de septiembre de dos mil veinticinco, pasa ante la fe del Abogado Miguel Jesús Sarabia Pérez, Notario Público número noventa y tres del Estado de Yucatán', 'Referencia notarial'),
  ('PUESTO_DEFAULT',            'PERSONAL DE LIMPIEZA',                                        'Puesto por defecto'),
  ('JORNADA_HORAS_DEFAULT',     '8',                                                            'Horas de jornada por defecto'),
  ('PROYECTO_DEFAULT',          'proyecto de servicio de limpieza, adjudicado por el Gobierno del Estado de Yucatán', 'Descripción del proyecto'),
  ('HORA_INICIO_DEFAULT',       '06:00',                                                       'Hora de inicio'),
  ('HORA_FIN_DEFAULT',          '14:00',                                                       'Hora de fin'),
  ('JORNADA_DESCRIPCION_DEFAULT','Lunes a sábado',                                              'Descripción de jornada'),
  ('DIA_DESCANSO_DEFAULT',      'Domingo',                                                     'Día de descanso'),
  ('FECHA_INICIO_DEFAULT',      'primero de abril de dos mil veintiseis',                      'Inicio en letra'),
  ('FECHA_FIN_DEFAULT',         'treinta y uno de diciembre de dos mil veintiseis',            'Fin en letra')
on conflict (clave) do nothing;

-- ─── 2) CONTRATOS ───
create table if not exists contratos (
  id uuid primary key default gen_random_uuid(),
  contrato_id text unique not null,                              -- MHS/OHR058/2026
  empleado_id uuid references empleados(id) on delete set null,  -- linked once empleado is created
  fecha_captura timestamptz not null default now(),

  -- Identidad del trabajador
  sexo text not null check (sexo in ('HOMBRE', 'MUJER')),
  nombre_trabajador text not null,
  rfc text,
  domicilio_completo text not null,
  cp text,

  -- Asignación
  sede_id uuid not null references sedes(id),
  segmento_original text,
  puesto text not null default 'PERSONAL DE LIMPIEZA',
  jornada_legacy jornada not null default 'MATUTINO',
  dia_descanso dia_semana[] not null default '{DOM}'::dia_semana[],

  -- Sueldo
  sueldo_mensual numeric(10, 2) not null,
  sueldo_mensual_letra text not null,
  salario_diario numeric(10, 2) not null default 315.04,

  -- Período (texto en letra como en el legacy)
  fecha_inicio_texto text not null,
  fecha_fin_texto text not null,
  fecha_firma_texto text not null,

  -- Jornada en texto
  hora_inicio text not null default '06:00',
  hora_fin text not null default '14:00',
  jornada_descripcion text not null default 'Lunes a sábado',
  jornada_horas int not null default 8,
  dia_descanso_texto text not null default 'Domingo',

  -- Constantes (snapshot al momento de crear, para auditoría)
  proyecto_texto text,
  acta_referencia text,
  representante_legal text,

  -- PDF output
  status_pdf text not null default 'PENDIENTE',  -- PENDIENTE | GENERADO | ERROR
  url_pdf text,
  plantilla_usada text,
  observaciones text,

  -- Auditoría
  creado_por uuid references usuarios(id),
  creado_en timestamptz not null default now()
);

create index contratos_sede_idx on contratos (sede_id, creado_en desc);
create index contratos_empleado_idx on contratos (empleado_id);
create index contratos_status_idx on contratos (status_pdf, fecha_captura desc);

alter table contratos enable row level security;
create policy "contratos_select_admin" on contratos for select to authenticated using (es_admin());
create policy "contratos_admin_write"  on contratos for all to authenticated using (es_admin()) with check (es_admin());

-- ─── 3) FUNCIÓN siguiente_folio ───
-- Atómica: aumenta sedes.ultimo_folio y devuelve el folio formateado.
create or replace function siguiente_folio_contrato(p_sede uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_abrev text;
  v_folio int;
  v_year text := extract(year from current_date)::text;
begin
  update sedes
  set ultimo_folio = ultimo_folio + 1
  where id = p_sede
  returning ultimo_folio, abrev into v_folio, v_abrev;

  if v_folio is null then
    raise exception 'Sede no encontrada: %', p_sede;
  end if;

  return 'MHS/' || v_abrev || lpad(v_folio::text, 3, '0') || '/' || v_year;
end;
$$;

grant execute on function siguiente_folio_contrato(uuid) to authenticated;
