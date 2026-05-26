-- v25: Datos personales y bancarios en empleados
-- =====================================================================
-- Agrega columnas para:
--  · Datos fiscales/laborales: RFC, NSS, CURP
--  · Contacto: telefono, email_personal
--  · Bancarios (para depósito de nómina): banco, cuenta_bancaria, clabe
--  · Dirección
--
-- Privacidad: estos datos son sensibles. La política de RLS existente para
-- `empleados` (lectura para admin-like) los cubre. Adicionalmente, todo
-- usuario con `acceso_facturacion = true` también puede leerlos para
-- procesar pagos.

alter table empleados
  add column if not exists rfc text,
  add column if not exists nss text,
  add column if not exists curp text,
  add column if not exists telefono text,
  add column if not exists email_personal text,
  add column if not exists direccion text,
  add column if not exists banco text,
  add column if not exists cuenta_bancaria text,
  add column if not exists clabe text;

-- Índices para búsqueda rápida (case-insensitive)
create index if not exists idx_empleados_rfc on empleados (lower(rfc)) where rfc is not null;
create index if not exists idx_empleados_nss on empleados (nss) where nss is not null;
create index if not exists idx_empleados_curp on empleados (lower(curp)) where curp is not null;

comment on column empleados.rfc is 'RFC del trabajador (13 chars con homoclave o genérica XAXX010101000)';
comment on column empleados.nss is 'Número de Seguridad Social (11 dígitos IMSS)';
comment on column empleados.curp is 'CURP del trabajador (18 chars)';
comment on column empleados.banco is 'Nombre del banco (BBVA, Banamex, Santander, etc.)';
comment on column empleados.cuenta_bancaria is 'Número de cuenta del banco (formato variable según banco)';
comment on column empleados.clabe is 'CLABE interbancaria de 18 dígitos para transferencias SPEI';
comment on column empleados.email_personal is 'Email personal del trabajador (distinto al de Vortex)';

-- ─────────────────────────────────────────────────────────────────────
-- Extender RLS: usuarios con acceso_facturacion pueden leer empleados
-- (necesario para que el módulo /facturacion exporte datos bancarios)
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists empleados_read_facturacion on empleados;
create policy empleados_read_facturacion on empleados
  for select
  using (tiene_acceso_facturacion());

-- ─────────────────────────────────────────────────────────────────────
-- RPC: empleados con datos bancarios por sede — para exportación
-- (filtra solo los que tienen al menos un dato bancario llenado, o todos
--  según p_solo_con_datos = false para auditar gaps)
-- ─────────────────────────────────────────────────────────────────────
create or replace function empleados_bancarios_por_sede(
  p_sede uuid default null,
  p_solo_con_datos boolean default false
)
returns table (
  id uuid,
  numero_empleado text,
  nombre text,
  sede_id uuid,
  sede_abrev text,
  sede_nombre text,
  jornada text,
  puesto text,
  rfc text,
  nss text,
  curp text,
  telefono text,
  email_personal text,
  banco text,
  cuenta_bancaria text,
  clabe text,
  salario_diario numeric,
  activo boolean,
  fecha_alta date,
  fecha_baja date,
  -- 0..1 con qué tan completos están los datos bancarios (para flag visual)
  completo_bancario boolean,
  faltantes text
)
language sql stable security definer
set search_path = public
as $$
  select
    e.id,
    e.numero_empleado,
    e.nombre,
    e.sede_id,
    s.abrev as sede_abrev,
    s.nombre as sede_nombre,
    e.jornada::text,
    null::text as puesto, -- placeholder: puesto vive en contratos, no en empleados
    e.rfc,
    e.nss,
    e.curp,
    e.telefono,
    e.email_personal,
    e.banco,
    e.cuenta_bancaria,
    e.clabe,
    e.salario_diario,
    (e.fecha_baja is null) as activo,
    e.fecha_alta,
    e.fecha_baja,
    (e.banco is not null and e.cuenta_bancaria is not null and e.clabe is not null) as completo_bancario,
    array_to_string(
      array_remove(array[
        case when e.rfc is null then 'RFC' end,
        case when e.nss is null then 'NSS' end,
        case when e.curp is null then 'CURP' end,
        case when e.banco is null then 'Banco' end,
        case when e.cuenta_bancaria is null then 'Cuenta' end,
        case when e.clabe is null then 'CLABE' end
      ], null),
      ', '
    ) as faltantes
  from empleados e
  join sedes s on s.id = e.sede_id
  where e.fecha_baja is null
    and (p_sede is null or e.sede_id = p_sede)
    and (
      not p_solo_con_datos
      or (e.banco is not null or e.cuenta_bancaria is not null or e.clabe is not null)
    )
  order by s.abrev, e.nombre;
$$;

grant execute on function empleados_bancarios_por_sede(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
