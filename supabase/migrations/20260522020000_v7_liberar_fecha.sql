-- v7: liberación temporal de fechas + SOPORTE como rol con ventana libre.
--
-- Cambios:
--   1) fechas_liberadas: agregar expira_en timestamptz (null = sin expira)
--   2) evaluar_ventana_gracia: tomar en cuenta expira_en + tratar SOPORTE
--      como SUPER (sin restricciones de ventana)
--   3) Nuevo RPC liberar_fecha(p_fecha, p_horas, p_motivo) — útil para que
--      soporte libere fechas desde tickets o desde el botón de pase de lista.

-- 1) Columna expira_en (default null = sin expira, comportamiento previo)
alter table fechas_liberadas
  add column if not exists expira_en timestamptz;

-- Reindex: filtramos por activo Y no expirado
drop index if exists fechas_liberadas_activas_idx;
create index fechas_liberadas_activas_idx
  on fechas_liberadas (fecha)
  where activo and (expira_en is null or expira_en > now());

-- 2) Reescribir evaluar_ventana_gracia
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
begin
  -- SUPERADMIN y SOPORTE: ventana libre siempre
  if v_role in ('SUPERADMIN', 'SOPORTE') then
    return query select 'SUPER'::text, null::timestamptz;
    return;
  end if;

  -- ¿Fecha liberada y no expirada?
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

-- 3) RPC para liberar fecha (asume current user)
create or replace function liberar_fecha(
  p_fecha date,
  p_horas int default null,         -- null = sin expira; entero = horas desde ahora
  p_motivo text default null
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_rol user_role;
  v_expira timestamptz;
begin
  if v_user is null then
    raise exception 'No hay sesión activa';
  end if;
  select rol into v_rol from usuarios where id = v_user;
  if v_rol not in ('ADMIN', 'CEO', 'SUPERADMIN', 'SOPORTE') then
    raise exception 'Solo ADMIN/CEO/SUPERADMIN/SOPORTE pueden liberar fechas';
  end if;

  v_expira := case when p_horas is null then null else now() + (p_horas || ' hours')::interval end;

  -- Upsert: si ya hay una libre activa para esa fecha, la actualiza
  insert into fechas_liberadas (fecha, liberado_por, motivo, activo, expira_en)
  values (p_fecha, v_user, coalesce(p_motivo, 'Liberada por soporte'), true, v_expira)
  on conflict (fecha) do update
    set liberado_por = excluded.liberado_por,
        motivo       = excluded.motivo,
        activo       = true,
        expira_en    = excluded.expira_en;

  return v_expira;
end;
$$;

-- Permitir que SOPORTE escriba en fechas_liberadas (la policy previa restringía a SUPERADMIN)
drop policy if exists "fechas_lib_superadmin_write" on fechas_liberadas;
create policy "fechas_lib_admin_write" on fechas_liberadas for all to authenticated
  using (es_soporte_o_admin()) with check (es_soporte_o_admin());

comment on function liberar_fecha is
  'Libera una fecha. p_horas=null para indefinido, o entero para liberar N horas. Auto-detecta el usuario.';
