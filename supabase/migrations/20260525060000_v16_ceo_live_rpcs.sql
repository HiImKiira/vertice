-- v16: RPCs para el dashboard CEO LIVE.
-- Centralizamos cálculos pesados en SQL para que la página /live cargue rápido
-- sin hacer N queries desde el cliente.

-- ─────────────────────────────────────────────────────────────────────
-- captura_por_sede_hoy: empleados activos vs asistencias capturadas hoy,
-- agrupado por sede. Incluye % de cobertura.
-- ─────────────────────────────────────────────────────────────────────
create or replace function captura_por_sede_hoy()
returns table (
  sede_id uuid,
  sede_abrev text,
  sede_nombre text,
  empleados_activos int,
  asistencias_hoy int,
  pct_cobertura int,
  ultima_captura timestamptz
)
language sql stable security definer
set search_path = public
as $$
  with hoy as (
    select (now() at time zone 'America/Merida')::date as d
  ),
  emp_por_sede as (
    select s.id as sede_id, s.abrev, s.nombre,
           count(e.id) filter (where e.fecha_baja is null) as activos
    from sedes s
    left join empleados e on e.sede_id = s.id
    where coalesce(s.activa, true) = true
    group by s.id, s.abrev, s.nombre
  ),
  ast_por_sede as (
    select e.sede_id, count(a.id) as cap, max(a.actualizado_en) as ultima
    from asistencias a
    join empleados e on e.id = a.empleado_id
    cross join hoy
    where a.fecha = hoy.d
    group by e.sede_id
  )
  select
    e.sede_id,
    e.abrev,
    e.nombre,
    e.activos::int,
    coalesce(a.cap, 0)::int,
    case when e.activos > 0 then least(100, round(coalesce(a.cap, 0)::numeric * 100 / e.activos))::int else 0 end as pct,
    a.ultima
  from emp_por_sede e
  left join ast_por_sede a on a.sede_id = e.sede_id
  where e.activos > 0
  order by pct asc, e.nombre;
$$;

grant execute on function captura_por_sede_hoy() to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- ceo_kpis_overview: KPIs principales del dashboard en una sola call.
-- ─────────────────────────────────────────────────────────────────────
create or replace function ceo_kpis_overview()
returns table (
  empleados_activos int,
  sedes_activas int,
  sedes_con_captura_hoy int,
  asistencias_hoy int,
  asistencias_esperadas_hoy int,
  tickets_abiertos int,
  tickets_urgentes int,
  tickets_sin_responder int,
  incap_activas int,
  incap_riesgo_trabajo_activas int,
  incap_st9_activas int,
  liberaciones_globales_activas int,
  liberaciones_fechas_activas int,
  pushes_24h_enviados int,
  pushes_24h_fallidos int
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Merida')::date;
  v_24h timestamptz := now() - interval '24 hours';
begin
  return query
  with
  emp_act as (select count(*)::int as n from empleados where fecha_baja is null),
  sedes_act as (select count(*)::int as n from sedes where coalesce(activa, true)),
  cap_sedes as (
    select count(distinct e.sede_id)::int as n
    from asistencias a join empleados e on e.id = a.empleado_id
    where a.fecha = v_hoy
  ),
  ast_hoy as (select count(*)::int as n from asistencias where fecha = v_hoy),
  tic_abiertos as (select count(*)::int as n from tickets_soporte where estado != 'CERRADO'),
  tic_urgentes as (select count(*)::int as n from tickets_soporte where estado != 'CERRADO' and prioridad = 'URGENTE'),
  tic_sin_resp as (select count(*)::int as n from tickets_soporte where estado != 'CERRADO' and unread_soporte > 0),
  inc_act as (select count(*)::int as n from incapacidades where estado not in ('CERRADA','RECHAZADA','CANCELADA')),
  inc_rt as (select count(*)::int as n from incapacidades where estado not in ('CERRADA','RECHAZADA','CANCELADA') and tipo in ('RIESGO_TRABAJO','RIESGO_TRAYECTO')),
  inc_st9 as (select count(*)::int as n from incapacidades where estado not in ('CERRADA','RECHAZADA','CANCELADA') and tipo = 'RIESGO_BIOLOGICO'),
  lib_glob as (select count(*)::int as n from liberaciones_globales where activo and (expira_en is null or expira_en > now())),
  lib_fec as (select count(*)::int as n from fechas_liberadas where activo and (expira_en is null or expira_en > now())),
  push_ok as (select count(*)::int as n from notify_log where creado_en > v_24h and resultado = 'enviado'),
  push_fail as (select count(*)::int as n from notify_log where creado_en > v_24h and resultado != 'enviado')
  select
    emp_act.n,
    sedes_act.n,
    cap_sedes.n,
    ast_hoy.n,
    emp_act.n,           -- asistencias esperadas = empleados activos
    tic_abiertos.n,
    tic_urgentes.n,
    tic_sin_resp.n,
    inc_act.n,
    inc_rt.n,
    inc_st9.n,
    lib_glob.n,
    lib_fec.n,
    push_ok.n,
    push_fail.n
  from emp_act, sedes_act, cap_sedes, ast_hoy, tic_abiertos, tic_urgentes, tic_sin_resp,
       inc_act, inc_rt, inc_st9, lib_glob, lib_fec, push_ok, push_fail;
end;
$$;

grant execute on function ceo_kpis_overview() to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- liberaciones_activas_detail: detalle de liberaciones vigentes (global + fechas)
-- ─────────────────────────────────────────────────────────────────────
create or replace function liberaciones_activas_detail()
returns table (
  tipo text,                -- 'GLOBAL' | 'FECHA'
  fecha date,
  activada_por_nombre text,
  motivo text,
  expira_en timestamptz,
  creado_en timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select 'GLOBAL'::text,
         null::date,
         u.nombre,
         lg.motivo,
         lg.expira_en,
         lg.activado_en
  from liberaciones_globales lg
  left join usuarios u on u.id = lg.activado_por
  where lg.activo and (lg.expira_en is null or lg.expira_en > now())
  union all
  select 'FECHA'::text,
         fl.fecha,
         u.nombre,
         fl.motivo,
         fl.expira_en,
         fl.creado_en
  from fechas_liberadas fl
  left join usuarios u on u.id = fl.liberado_por
  where fl.activo and (fl.expira_en is null or fl.expira_en > now())
  order by 5 desc nulls last;  -- expira_en desc, null al final
$$;

grant execute on function liberaciones_activas_detail() to authenticated;

notify pgrst, 'reload schema';
