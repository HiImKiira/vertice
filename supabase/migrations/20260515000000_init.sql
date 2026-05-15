-- ============================================================
-- Vértice — migración inicial
-- Fecha:  2026-05-15
-- Esquema base: empleados, asistencias, incidencias, CDTs,
-- tickets de soporte, períodos de nómina, fechas liberadas,
-- log de eventos, roles, helpers y políticas RLS.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- ENUM TYPES
-- ------------------------------------------------------------

create type user_role as enum ('USER', 'ADMIN', 'CEO', 'SUPERADMIN');

create type jornada as enum ('MATUTINO', 'VESPERTINO', 'NOCTURNO');

create type dia_semana as enum ('LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM');

create type codigo_asistencia as enum (
  'A',    -- Asistencia
  'AF',   -- Asistencia forzada
  'DS',   -- Descanso pagado
  'DT',   -- Doble turno (+extra)
  'INH',  -- Inhábil
  'FER',  -- Feriado
  'PCG',  -- Permiso con goce
  'PSG',  -- Permiso sin goce
  'I',    -- Incapacidad
  'F',    -- Falta
  'SN'    -- Sin marcar
);

create type estado_ticket as enum ('PENDIENTE', 'RESPONDIDO', 'CERRADO');
create type urgencia_ticket as enum ('NORMAL', 'URGENTE');
create type estado_periodo as enum ('ABIERTO', 'CERRADO');

-- ------------------------------------------------------------
-- TABLES
-- ------------------------------------------------------------

create table sedes (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nombre text not null,
  direccion text,
  creado_en timestamptz not null default now()
);

create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  nombre text not null,
  rol user_role not null default 'USER',
  sede_id uuid references sedes(id),
  jornada jornada,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index usuarios_rol_idx on usuarios (rol) where activo;

create table empleados (
  id uuid primary key default gen_random_uuid(),
  numero_empleado text unique not null,
  nombre text not null,
  sede_id uuid not null references sedes(id),
  jornada jornada not null,
  dia_descanso dia_semana not null,
  salario_diario numeric(10, 2) not null default 393.80,
  fecha_alta date not null default current_date,
  fecha_baja date,
  motivo_baja text,
  activo boolean generated always as (fecha_baja is null) stored,
  foto_url text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index empleados_sede_idx on empleados (sede_id) where fecha_baja is null;
create index empleados_jornada_idx on empleados (jornada) where fecha_baja is null;

create table asistencias (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id) on delete cascade,
  fecha date not null,
  codigo codigo_asistencia not null,
  capturado_por uuid references usuarios(id),
  observacion text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (empleado_id, fecha)
);

create index asistencias_fecha_idx on asistencias (fecha desc);
create index asistencias_empleado_fecha_idx on asistencias (empleado_id, fecha desc);

create table incidencias (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id) on delete cascade,
  fecha date not null,
  codigo codigo_asistencia not null,
  observacion text,
  documento_url text,
  capturado_por uuid references usuarios(id),
  creado_en timestamptz not null default now()
);

create index incidencias_fecha_idx on incidencias (fecha desc);

create table cdts (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id),
  sede_id uuid not null references sedes(id),
  fecha_original date not null,
  fecha_temporal date not null,
  motivo text,
  creado_por uuid references usuarios(id),
  cancelado_en timestamptz,
  cancelado_por uuid references usuarios(id),
  creado_en timestamptz not null default now()
);

create index cdts_sede_fecha_idx on cdts (sede_id, fecha_temporal) where cancelado_en is null;
create index cdts_empleado_idx on cdts (empleado_id) where cancelado_en is null;

create table compensaciones_descanso (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id),
  fecha_trabajada date not null,
  fecha_compensar date,
  pagada boolean not null default false,
  creado_por uuid references usuarios(id),
  creado_en timestamptz not null default now()
);

create table periodos_nomina (
  id uuid primary key default gen_random_uuid(),
  quincena_inicio date not null,
  quincena_fin date not null,
  estado estado_periodo not null default 'ABIERTO',
  cerrado_por uuid references usuarios(id),
  cerrado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (quincena_inicio, quincena_fin)
);

create table fechas_liberadas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  supervisor_id uuid not null references usuarios(id),
  liberado_por uuid not null references usuarios(id),
  motivo text,
  expira_en timestamptz not null default (now() + interval '24 hours'),
  creado_en timestamptz not null default now()
);

create index fechas_liberadas_supervisor_idx on fechas_liberadas (supervisor_id, fecha) where expira_en > now();

create table tickets_soporte (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references usuarios(id),
  sede_id uuid references sedes(id),
  jornada jornada,
  asunto text not null,
  mensaje text not null,
  urgencia urgencia_ticket not null default 'NORMAL',
  estado estado_ticket not null default 'PENDIENTE',
  respuesta text,
  respondido_por uuid references usuarios(id),
  respondido_en timestamptz,
  leido_por_supervisor boolean not null default false,
  creado_en timestamptz not null default now()
);

create index tickets_estado_idx on tickets_soporte (estado, creado_en desc);
create index tickets_supervisor_idx on tickets_soporte (supervisor_id, creado_en desc);

create table eventos (
  id bigserial primary key,
  tipo text not null,
  usuario_id uuid references usuarios(id),
  sede_id uuid references sedes(id),
  payload jsonb,
  creado_en timestamptz not null default now()
);

create index eventos_creado_idx on eventos (creado_en desc);
create index eventos_sede_creado_idx on eventos (sede_id, creado_en desc);

-- ------------------------------------------------------------
-- HELPER FUNCTIONS
-- ------------------------------------------------------------

create or replace function rol_actual()
returns user_role
language sql stable security definer
set search_path = public
as $$
  select rol from usuarios where id = auth.uid();
$$;

create or replace function es_admin()
returns boolean
language sql stable
as $$
  select rol_actual() in ('ADMIN', 'CEO', 'SUPERADMIN');
$$;

create or replace function es_superadmin()
returns boolean
language sql stable
as $$
  select rol_actual() = 'SUPERADMIN';
$$;

create or replace function sede_de_usuario()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select sede_id from usuarios where id = auth.uid();
$$;

create or replace function fecha_en_periodo_abierto(p_fecha date)
returns boolean
language sql stable
as $$
  select exists (
    select 1 from periodos_nomina
    where p_fecha between quincena_inicio and quincena_fin
      and estado = 'ABIERTO'
  );
$$;

create or replace function fecha_liberada_para_usuario(p_fecha date, p_usuario uuid)
returns boolean
language sql stable
as $$
  select exists (
    select 1 from fechas_liberadas
    where fecha = p_fecha
      and supervisor_id = p_usuario
      and expira_en > now()
  );
$$;

-- ------------------------------------------------------------
-- TRIGGERS: actualizado_en + log de eventos
-- ------------------------------------------------------------

create or replace function set_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger usuarios_actualizado before update on usuarios
  for each row execute procedure set_actualizado_en();

create trigger empleados_actualizado before update on empleados
  for each row execute procedure set_actualizado_en();

create trigger asistencias_actualizado before update on asistencias
  for each row execute procedure set_actualizado_en();

create or replace function emit_evento_asistencia()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into eventos (tipo, usuario_id, sede_id, payload)
  select
    case when tg_op = 'INSERT' then 'asistencia_capturada' else 'asistencia_modificada' end,
    new.capturado_por,
    e.sede_id,
    jsonb_build_object(
      'empleado_id', new.empleado_id,
      'fecha', new.fecha,
      'codigo', new.codigo,
      'op', tg_op
    )
  from empleados e where e.id = new.empleado_id;
  return new;
end;
$$;

create trigger asistencias_evento after insert or update on asistencias
  for each row execute procedure emit_evento_asistencia();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------

alter table sedes enable row level security;
alter table usuarios enable row level security;
alter table empleados enable row level security;
alter table asistencias enable row level security;
alter table incidencias enable row level security;
alter table cdts enable row level security;
alter table compensaciones_descanso enable row level security;
alter table periodos_nomina enable row level security;
alter table fechas_liberadas enable row level security;
alter table tickets_soporte enable row level security;
alter table eventos enable row level security;

-- Sedes: todos los autenticados leen, solo superadmin escribe.
create policy "sedes_select" on sedes for select to authenticated using (true);
create policy "sedes_admin_write" on sedes for all to authenticated
  using (es_superadmin()) with check (es_superadmin());

-- Usuarios: cada quien ve su perfil; admin ve todos; admin gestiona.
create policy "usuarios_select_propio_o_admin" on usuarios for select to authenticated
  using (id = auth.uid() or es_admin());
create policy "usuarios_admin_write" on usuarios for all to authenticated
  using (es_admin()) with check (es_admin());

-- Empleados: supervisor ve su sede, admin ve todo, admin escribe.
create policy "empleados_select_sede_o_admin" on empleados for select to authenticated
  using (es_admin() or sede_id = sede_de_usuario());
create policy "empleados_admin_write" on empleados for all to authenticated
  using (es_admin()) with check (es_admin());

-- Asistencias: supervisor lee/escribe en su sede dentro de ventana; admin todo.
create policy "asistencias_select" on asistencias for select to authenticated
  using (
    es_admin()
    or empleado_id in (select id from empleados where sede_id = sede_de_usuario())
  );

create policy "asistencias_insert" on asistencias for insert to authenticated
  with check (
    es_admin()
    or (
      capturado_por = auth.uid()
      and empleado_id in (select id from empleados where sede_id = sede_de_usuario())
      and (
        fecha >= current_date - 1
        or fecha_liberada_para_usuario(fecha, auth.uid())
      )
    )
  );

create policy "asistencias_update" on asistencias for update to authenticated
  using (
    es_admin()
    or (
      capturado_por = auth.uid()
      and (
        fecha >= current_date - 1
        or fecha_liberada_para_usuario(fecha, auth.uid())
      )
    )
  )
  with check (
    es_admin()
    or (
      capturado_por = auth.uid()
      and (
        fecha >= current_date - 1
        or fecha_liberada_para_usuario(fecha, auth.uid())
      )
    )
  );

create policy "asistencias_delete_admin" on asistencias for delete to authenticated using (es_admin());

-- Incidencias: similar a asistencias.
create policy "incidencias_select" on incidencias for select to authenticated
  using (
    es_admin()
    or empleado_id in (select id from empleados where sede_id = sede_de_usuario())
  );
create policy "incidencias_insert" on incidencias for insert to authenticated
  with check (
    es_admin()
    or empleado_id in (select id from empleados where sede_id = sede_de_usuario())
  );
create policy "incidencias_admin_write" on incidencias for update to authenticated
  using (es_admin()) with check (es_admin());
create policy "incidencias_admin_delete" on incidencias for delete to authenticated using (es_admin());

-- CDTs
create policy "cdts_select" on cdts for select to authenticated
  using (es_admin() or sede_id = sede_de_usuario());
create policy "cdts_supervisor_insert" on cdts for insert to authenticated
  with check (es_admin() or sede_id = sede_de_usuario());
create policy "cdts_supervisor_update" on cdts for update to authenticated
  using (es_admin() or sede_id = sede_de_usuario());

-- Compensaciones
create policy "comp_select" on compensaciones_descanso for select to authenticated
  using (
    es_admin()
    or empleado_id in (select id from empleados where sede_id = sede_de_usuario())
  );
create policy "comp_insert" on compensaciones_descanso for insert to authenticated
  with check (
    es_admin()
    or empleado_id in (select id from empleados where sede_id = sede_de_usuario())
  );
create policy "comp_admin_update" on compensaciones_descanso for update to authenticated
  using (es_admin()) with check (es_admin());

-- Períodos de nómina: admin lee, superadmin cierra/abre.
create policy "periodos_select" on periodos_nomina for select to authenticated using (es_admin());
create policy "periodos_superadmin_write" on periodos_nomina for all to authenticated
  using (es_superadmin()) with check (es_superadmin());

-- Fechas liberadas: admin lee, superadmin libera.
create policy "fechas_lib_select" on fechas_liberadas for select to authenticated
  using (es_admin() or supervisor_id = auth.uid());
create policy "fechas_lib_superadmin_write" on fechas_liberadas for all to authenticated
  using (es_superadmin()) with check (es_superadmin());

-- Tickets de soporte: propios + admins.
create policy "tickets_select" on tickets_soporte for select to authenticated
  using (supervisor_id = auth.uid() or es_admin());
create policy "tickets_supervisor_insert" on tickets_soporte for insert to authenticated
  with check (supervisor_id = auth.uid());
create policy "tickets_supervisor_marca_leido" on tickets_soporte for update to authenticated
  using (supervisor_id = auth.uid() or es_admin())
  with check (supervisor_id = auth.uid() or es_admin());

-- Eventos: solo admin+.
create policy "eventos_select_admin" on eventos for select to authenticated using (es_admin());
create policy "eventos_insert_sistema" on eventos for insert to authenticated with check (true);

-- ------------------------------------------------------------
-- VISTAS DE CONVENIENCIA
-- ------------------------------------------------------------

create or replace view vw_empleados_activos as
  select e.*, s.codigo as sede_codigo, s.nombre as sede_nombre
  from empleados e
  join sedes s on s.id = e.sede_id
  where e.fecha_baja is null;
