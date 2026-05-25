-- v12: liberación global de todas las fechas para captura.
--
-- Cuando RH activa el toggle "Liberar todas las fechas", cualquier
-- supervisor puede capturar cualquier fecha (pasada/presente) sin
-- restricción de gracia, hasta que el toggle expire o se desactive.
--
-- Se complementa con fechas_liberadas (por-fecha) que ya existe:
-- - fechas_liberadas: libera UNA fecha específica
-- - liberaciones_globales: libera TODAS las fechas (atajo de emergencia)

create table if not exists liberaciones_globales (
  id uuid primary key default gen_random_uuid(),
  activado_por uuid not null references usuarios(id),
  activado_en timestamptz not null default now(),
  expira_en timestamptz,                -- null = sin expira (hasta apagar)
  motivo text,
  activo boolean not null default true,
  desactivado_por uuid references usuarios(id),
  desactivado_en timestamptz
);

create index if not exists liberaciones_globales_activas
  on liberaciones_globales (activado_en desc)
  where activo and (expira_en is null or expira_en > now());

alter table liberaciones_globales enable row level security;

drop policy if exists "libglobal_select" on liberaciones_globales;
create policy "libglobal_select" on liberaciones_globales for select to authenticated
  using (true);  -- todos pueden VER si hay liberación activa (la UI lo muestra)

drop policy if exists "libglobal_admin_write" on liberaciones_globales;
create policy "libglobal_admin_write" on liberaciones_globales for all to authenticated
  using (es_soporte_o_admin()) with check (es_soporte_o_admin());

-- ─────────────────────────────────────────────────────────────────────
-- Helper para chequear liberación global activa
-- ─────────────────────────────────────────────────────────────────────
create or replace function liberacion_global_activa()
returns boolean
language sql stable
as $$
  select exists (
    select 1 from liberaciones_globales
    where activo = true
      and (expira_en is null or expira_en > now())
  );
$$;

-- ─────────────────────────────────────────────────────────────────────
-- Actualizar fecha_liberada_para_usuario: también pasa si hay global activa
-- ─────────────────────────────────────────────────────────────────────
create or replace function fecha_liberada_para_usuario(p_fecha date, p_usuario uuid)
returns boolean
language sql stable
as $$
  select
    liberacion_global_activa()
    or exists (
      select 1 from fechas_liberadas
      where fecha = p_fecha
        and activo = true
        and (expira_en is null or expira_en > now())
    );
$$;

-- ─────────────────────────────────────────────────────────────────────
-- Actualizar evaluar_ventana_gracia: si global activa, retorna LIBERADA
-- ─────────────────────────────────────────────────────────────────────
create or replace function evaluar_ventana_gracia(
  p_fecha date,
  p_role user_role default null
) returns table (resultado text, expira timestamptz)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_role user_role := coalesce(p_role, rol_actual());
  v_now_merida timestamptz := now() at time zone 'America/Merida';
  v_hoy date := (v_now_merida)::date;
  v_ayer date := v_hoy - 1;
  v_limite_ayer timestamptz := (v_hoy::text || ' 12:00:00')::timestamp at time zone 'America/Merida';
  v_lib_expira timestamptz;
  v_lib_existe boolean;
  v_global_expira timestamptz;
begin
  -- SUPERADMIN y SOPORTE: ventana libre siempre
  if v_role in ('SUPERADMIN', 'SOPORTE') then
    return query select 'SUPER'::text, null::timestamptz;
    return;
  end if;

  -- ¿Liberación GLOBAL activa? Aplica a cualquier fecha
  select lg.expira_en into v_global_expira
    from liberaciones_globales lg
   where lg.activo
     and (lg.expira_en is null or lg.expira_en > now())
   order by lg.activado_en desc
   limit 1;
  if found then
    return query select 'LIBERADA'::text, v_global_expira;
    return;
  end if;

  -- ¿Fecha liberada individual y no expirada?
  select fl.expira_en, true
    into v_lib_expira, v_lib_existe
    from fechas_liberadas fl
   where fl.fecha = p_fecha
     and fl.activo
     and (fl.expira_en is null or fl.expira_en > now())
   order by fl.creado_en desc
   limit 1;

  if v_lib_existe then
    return query select 'LIBERADA'::text, v_lib_expira;
    return;
  end if;

  if p_fecha = v_hoy then
    return query select 'OK'::text, ((v_hoy + 1)::text || ' 12:00:00')::timestamp at time zone 'America/Merida';
    return;
  end if;

  if p_fecha = v_ayer and now() < v_limite_ayer then
    return query select 'OK'::text, v_limite_ayer;
    return;
  end if;

  if p_fecha > v_hoy then
    return query select 'FUTURO'::text, null::timestamptz;
    return;
  end if;

  return query select 'GRACIA_VENCIDA'::text, null::timestamptz;
end;
$$;

comment on function liberacion_global_activa is
  'True si hay una liberación global activa y no expirada — supera cualquier ventana de gracia.';

notify pgrst, 'reload schema';
