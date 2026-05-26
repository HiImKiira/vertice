-- v22: Módulo Facturación + Cotizaciones + Solicitudes de compra.
-- - Flag acceso_facturacion en usuarios (se asigna a supervisores específicos como Alex).
-- - Catálogo de productos.
-- - Clientes para cotizar.
-- - Cotizaciones con líneas y totales auto-calculados via trigger.
-- - Solicitudes de compra que cualquier supervisor puede levantar; FAC + admins las gestionan.
-- - RPCs de folio (COT-YYYY-NNNN, SC-YYYY-NNNN) y KPIs de dashboard.
-- - RLS estricto: solo gente con acceso_facturacion (o admin-like) entra al módulo.

-- ─────────────────────────────────────────────────────────────────────
-- 1) Flag de acceso
-- ─────────────────────────────────────────────────────────────────────
alter table usuarios add column if not exists acceso_facturacion boolean not null default false;

create index if not exists idx_usuarios_acceso_facturacion
  on usuarios(acceso_facturacion) where acceso_facturacion = true;

-- Helper: ¿el caller actual tiene acceso al módulo?
create or replace function tiene_acceso_facturacion()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select acceso_facturacion or rol in ('SUPERADMIN','SOPORTE','CEO')
       from usuarios where id = auth.uid()),
    false
  );
$$;

grant execute on function tiene_acceso_facturacion() to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 2) Catálogo de productos
-- ─────────────────────────────────────────────────────────────────────
create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  nombre text not null,
  descripcion text,
  unidad text not null default 'PIEZA',
  precio_unitario numeric(12,2) not null default 0,
  iva_pct numeric(5,2) not null default 16.00,
  categoria text,
  stock_actual integer not null default 0,
  stock_minimo integer not null default 0,
  proveedor text,
  activo boolean not null default true,
  notas text,
  creado_en timestamptz not null default now(),
  creado_por uuid references usuarios(id),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_productos_activo on productos(activo) where activo = true;
create index if not exists idx_productos_categoria on productos(categoria);

-- ─────────────────────────────────────────────────────────────────────
-- 3) Clientes de cotización
-- ─────────────────────────────────────────────────────────────────────
create table if not exists clientes_cotizacion (
  id uuid primary key default gen_random_uuid(),
  razon_social text not null,
  rfc text,
  contacto_nombre text,
  contacto_email text,
  contacto_telefono text,
  direccion text,
  notas text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid references usuarios(id)
);

create index if not exists idx_clientes_cotizacion_activo on clientes_cotizacion(activo) where activo = true;

-- ─────────────────────────────────────────────────────────────────────
-- 4) Cotizaciones
-- ─────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'cotizacion_estado') then
    create type cotizacion_estado as enum ('BORRADOR','ENVIADA','ACEPTADA','RECHAZADA','FACTURADA','CANCELADA');
  end if;
end$$;

create sequence if not exists cotizaciones_folio_seq start 1;

create or replace function siguiente_folio_cotizacion()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  yr text := to_char(now() at time zone 'America/Merida', 'YYYY');
  nxt bigint := nextval('cotizaciones_folio_seq');
begin
  return 'COT-' || yr || '-' || lpad(nxt::text, 4, '0');
end$$;

grant execute on function siguiente_folio_cotizacion() to authenticated;

create table if not exists cotizaciones (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  cliente_id uuid not null references clientes_cotizacion(id) on delete restrict,
  fecha date not null default current_date,
  vigencia_dias integer not null default 30,
  estado cotizacion_estado not null default 'BORRADOR',
  subtotal numeric(14,2) not null default 0,
  iva_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  notas text,
  condiciones text,
  creado_en timestamptz not null default now(),
  creado_por uuid references usuarios(id),
  enviado_en timestamptz,
  aceptado_en timestamptz,
  rechazado_motivo text
);

create index if not exists idx_cotizaciones_estado on cotizaciones(estado);
create index if not exists idx_cotizaciones_fecha on cotizaciones(fecha desc);
create index if not exists idx_cotizaciones_cliente on cotizaciones(cliente_id);

-- ─────────────────────────────────────────────────────────────────────
-- 5) Líneas de cotización (con totales calculados automáticamente)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists cotizacion_lineas (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references cotizaciones(id) on delete cascade,
  producto_id uuid references productos(id) on delete set null,
  -- Snapshot al momento (por si el catálogo cambia luego)
  descripcion_snapshot text not null,
  unidad_snapshot text,
  cantidad numeric(12,3) not null default 1,
  precio_unitario numeric(12,2) not null default 0,
  iva_pct numeric(5,2) not null default 16.00,
  subtotal numeric(14,2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  iva numeric(14,2) generated always as (round(cantidad * precio_unitario * iva_pct / 100, 2)) stored,
  total numeric(14,2) generated always as (round(cantidad * precio_unitario * (1 + iva_pct/100), 2)) stored,
  orden integer not null default 0
);

create index if not exists idx_cotizacion_lineas_cot on cotizacion_lineas(cotizacion_id);

-- Trigger: recalcular totales del header al modificar líneas
create or replace function _recalc_cotizacion_totales(p_cot uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update cotizaciones
  set subtotal  = coalesce((select sum(subtotal) from cotizacion_lineas where cotizacion_id = p_cot), 0),
      iva_total = coalesce((select sum(iva)      from cotizacion_lineas where cotizacion_id = p_cot), 0),
      total     = coalesce((select sum(total)    from cotizacion_lineas where cotizacion_id = p_cot), 0)
  where id = p_cot;
end$$;

create or replace function _tg_cotizacion_lineas_recalc()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    perform _recalc_cotizacion_totales(old.cotizacion_id);
  else
    perform _recalc_cotizacion_totales(new.cotizacion_id);
  end if;
  return null;
end$$;

drop trigger if exists tg_recalc_lineas on cotizacion_lineas;
create trigger tg_recalc_lineas
after insert or update or delete on cotizacion_lineas
for each row execute function _tg_cotizacion_lineas_recalc();

-- ─────────────────────────────────────────────────────────────────────
-- 6) Solicitudes de compra (cualquier supervisor puede levantar)
-- ─────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'solicitud_compra_estado') then
    create type solicitud_compra_estado as enum ('SOLICITADA','APROBADA','RECHAZADA','COMPRADA','ENTREGADA','CANCELADA');
  end if;
end$$;

create sequence if not exists solicitudes_compra_folio_seq start 1;

create or replace function siguiente_folio_compra()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  yr text := to_char(now() at time zone 'America/Merida', 'YYYY');
  nxt bigint := nextval('solicitudes_compra_folio_seq');
begin
  return 'SC-' || yr || '-' || lpad(nxt::text, 4, '0');
end$$;

grant execute on function siguiente_folio_compra() to authenticated;

create table if not exists solicitudes_compra (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  solicitante_id uuid not null references usuarios(id) on delete restrict,
  sede_id uuid references sedes(id) on delete set null,
  motivo text,
  prioridad text not null default 'NORMAL', -- BAJA/NORMAL/ALTA/URGENTE
  estado solicitud_compra_estado not null default 'SOLICITADA',
  total_estimado numeric(14,2) not null default 0,
  notas_aprobador text,
  notas_solicitante text,
  solicitado_en timestamptz not null default now(),
  aprobado_en timestamptz,
  aprobado_por uuid references usuarios(id),
  comprado_en timestamptz,
  comprado_por uuid references usuarios(id),
  entregado_en timestamptz
);

create index if not exists idx_solicitudes_compra_estado on solicitudes_compra(estado);
create index if not exists idx_solicitudes_compra_solicitante on solicitudes_compra(solicitante_id);
create index if not exists idx_solicitudes_compra_solicitado on solicitudes_compra(solicitado_en desc);

create table if not exists solicitud_compra_items (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references solicitudes_compra(id) on delete cascade,
  producto_id uuid references productos(id) on delete set null,
  descripcion text not null,
  cantidad numeric(12,3) not null default 1,
  unidad text default 'PIEZA',
  precio_estimado numeric(12,2) not null default 0,
  precio_real numeric(12,2),
  notas text,
  orden integer not null default 0
);

create index if not exists idx_solicitud_compra_items_sol on solicitud_compra_items(solicitud_id);

-- Recalcular total_estimado al modificar items
create or replace function _recalc_solicitud_total(p_sol uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update solicitudes_compra
  set total_estimado = coalesce(
    (select sum(cantidad * precio_estimado) from solicitud_compra_items where solicitud_id = p_sol),
    0
  )
  where id = p_sol;
end$$;

create or replace function _tg_solicitud_items_recalc()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    perform _recalc_solicitud_total(old.solicitud_id);
  else
    perform _recalc_solicitud_total(new.solicitud_id);
  end if;
  return null;
end$$;

drop trigger if exists tg_recalc_solicitud_items on solicitud_compra_items;
create trigger tg_recalc_solicitud_items
after insert or update or delete on solicitud_compra_items
for each row execute function _tg_solicitud_items_recalc();

-- ─────────────────────────────────────────────────────────────────────
-- 7) KPIs de dashboard
-- ─────────────────────────────────────────────────────────────────────
create or replace function facturacion_kpis_mes(p_mes date default current_date)
returns table(
  total_cotizaciones integer,
  monto_cotizado numeric,
  cotizaciones_aceptadas integer,
  monto_aceptado numeric,
  cotizaciones_pendientes integer,
  cotizaciones_rechazadas integer,
  solicitudes_compra_pendientes integer,
  solicitudes_compra_aprobadas integer,
  productos_activos integer,
  productos_bajo_stock integer
)
language sql stable security definer
set search_path = public
as $$
  with rango as (
    select date_trunc('month', p_mes)::date as ini,
           (date_trunc('month', p_mes) + interval '1 month')::date as fin
  )
  select
    (select count(*)::int from cotizaciones, rango where fecha >= ini and fecha < fin),
    (select coalesce(sum(total),0) from cotizaciones, rango where fecha >= ini and fecha < fin),
    (select count(*)::int from cotizaciones, rango where fecha >= ini and fecha < fin and estado = 'ACEPTADA'),
    (select coalesce(sum(total),0) from cotizaciones, rango where fecha >= ini and fecha < fin and estado = 'ACEPTADA'),
    (select count(*)::int from cotizaciones, rango where fecha >= ini and fecha < fin and estado in ('BORRADOR','ENVIADA')),
    (select count(*)::int from cotizaciones, rango where fecha >= ini and fecha < fin and estado = 'RECHAZADA'),
    (select count(*)::int from solicitudes_compra where estado = 'SOLICITADA'),
    (select count(*)::int from solicitudes_compra where estado in ('APROBADA','COMPRADA') and (entregado_en is null)),
    (select count(*)::int from productos where activo = true),
    (select count(*)::int from productos where activo = true and stock_actual <= stock_minimo);
$$;

grant execute on function facturacion_kpis_mes(date) to authenticated;

-- IDs de usuarios con acceso a facturación (para push)
create or replace function usuarios_con_acceso_facturacion()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select id from usuarios
   where (acceso_facturacion = true or rol in ('SUPERADMIN','SOPORTE','CEO'))
     and (ausente_desde is null or current_date < ausente_desde or current_date > ausente_hasta);
$$;

grant execute on function usuarios_con_acceso_facturacion() to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 8) RLS — solo gente con acceso_facturacion (o admin-like) entra al módulo
-- ─────────────────────────────────────────────────────────────────────
alter table productos               enable row level security;
alter table clientes_cotizacion     enable row level security;
alter table cotizaciones            enable row level security;
alter table cotizacion_lineas       enable row level security;
alter table solicitudes_compra      enable row level security;
alter table solicitud_compra_items  enable row level security;

-- Productos: read+write para usuarios con acceso
drop policy if exists productos_read on productos;
create policy productos_read on productos for select
  using (tiene_acceso_facturacion());

drop policy if exists productos_write on productos;
create policy productos_write on productos for all
  using (tiene_acceso_facturacion())
  with check (tiene_acceso_facturacion());

-- Clientes
drop policy if exists clientes_cot_read on clientes_cotizacion;
create policy clientes_cot_read on clientes_cotizacion for select using (tiene_acceso_facturacion());

drop policy if exists clientes_cot_write on clientes_cotizacion;
create policy clientes_cot_write on clientes_cotizacion for all
  using (tiene_acceso_facturacion()) with check (tiene_acceso_facturacion());

-- Cotizaciones
drop policy if exists cotizaciones_read on cotizaciones;
create policy cotizaciones_read on cotizaciones for select using (tiene_acceso_facturacion());

drop policy if exists cotizaciones_write on cotizaciones;
create policy cotizaciones_write on cotizaciones for all
  using (tiene_acceso_facturacion()) with check (tiene_acceso_facturacion());

drop policy if exists cot_lineas_read on cotizacion_lineas;
create policy cot_lineas_read on cotizacion_lineas for select using (tiene_acceso_facturacion());

drop policy if exists cot_lineas_write on cotizacion_lineas;
create policy cot_lineas_write on cotizacion_lineas for all
  using (tiene_acceso_facturacion()) with check (tiene_acceso_facturacion());

-- Solicitudes de compra:
--  - SELECT: facturación ve todas + supervisor ve las suyas
--  - INSERT: cualquier usuario autenticado puede crear (como solicitante)
--  - UPDATE: facturación todo; solicitante solo si SOLICITADA (puede cancelar/editar)
drop policy if exists sol_compra_read on solicitudes_compra;
create policy sol_compra_read on solicitudes_compra for select
  using (tiene_acceso_facturacion() or solicitante_id = auth.uid());

drop policy if exists sol_compra_insert on solicitudes_compra;
create policy sol_compra_insert on solicitudes_compra for insert
  with check (solicitante_id = auth.uid());

drop policy if exists sol_compra_update on solicitudes_compra;
create policy sol_compra_update on solicitudes_compra for update
  using (
    tiene_acceso_facturacion()
    or (solicitante_id = auth.uid() and estado = 'SOLICITADA')
  )
  with check (
    tiene_acceso_facturacion()
    or (solicitante_id = auth.uid() and estado = 'SOLICITADA')
  );

drop policy if exists sol_compra_delete on solicitudes_compra;
create policy sol_compra_delete on solicitudes_compra for delete
  using (
    tiene_acceso_facturacion()
    or (solicitante_id = auth.uid() and estado = 'SOLICITADA')
  );

-- Items de solicitud de compra (mismos permisos siguiendo la cabecera)
drop policy if exists sol_items_read on solicitud_compra_items;
create policy sol_items_read on solicitud_compra_items for select
  using (
    tiene_acceso_facturacion()
    or exists (select 1 from solicitudes_compra s where s.id = solicitud_id and s.solicitante_id = auth.uid())
  );

drop policy if exists sol_items_write on solicitud_compra_items;
create policy sol_items_write on solicitud_compra_items for all
  using (
    tiene_acceso_facturacion()
    or exists (select 1 from solicitudes_compra s where s.id = solicitud_id
               and s.solicitante_id = auth.uid() and s.estado = 'SOLICITADA')
  )
  with check (
    tiene_acceso_facturacion()
    or exists (select 1 from solicitudes_compra s where s.id = solicitud_id
               and s.solicitante_id = auth.uid() and s.estado = 'SOLICITADA')
  );

-- ─────────────────────────────────────────────────────────────────────
-- 9) Activar acceso para Alex (alex@vertice.mhs.local) — ventas inicial
-- ─────────────────────────────────────────────────────────────────────
update usuarios
   set acceso_facturacion = true
 where lower(email) = 'alex@vertice.mhs.local'
    or lower(username) = 'alex';

-- ─────────────────────────────────────────────────────────────────────
-- 10) Seed inicial: cliente "MHS Integradora" (autoconsumo) y unas categorías
-- ─────────────────────────────────────────────────────────────────────
insert into clientes_cotizacion (razon_social, rfc, contacto_nombre, contacto_email, notas)
values (
  'MHS INTEGRADORA · COMERCIAL Y DE SERVICIOS S. DE R.L. DE C.V.',
  null,
  'Administración',
  null,
  'Cliente interno para autoconsumo / pruebas'
)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────
-- 11) Reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────────
notify pgrst, 'reload schema';
