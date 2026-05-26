-- v17: RPC que devuelve incapacidades atoradas según reglas IMSS.
-- Usado por el cron /api/cron/notify-incapacidades.
--
-- Reglas de "atorada":
--   * REPORTADA o DOCS_EMPLEADO con >24h → empleado no trajo docs
--   * RH_VALIDA con >24h → RH no llenó la parte trasera del ST-7 (regla de oro!)
--   * MEDICINA_TRABAJO con >7 días → puede estar atorada en IMSS
--   * ALTA_PENDIENTE con >48h → empleado no trae ST-2 (no puede laborar)

create or replace function incapacidades_atoradas()
returns table (
  id uuid,
  tipo text,
  estado text,
  dias_atorada numeric,
  empleado_nombre text,
  empleado_numero text,
  sede_abrev text,
  reportada_por uuid,
  motivo text          -- por qué está atorada
)
language sql stable security definer
set search_path = public
as $$
  with base as (
    select
      i.id,
      i.tipo::text,
      i.estado::text,
      extract(epoch from (now() - i.actualizado_en)) / 86400 as dias,
      i.reportada_por,
      e.nombre,
      e.numero_empleado,
      s.abrev,
      case
        when i.estado in ('REPORTADA','DOCS_EMPLEADO') and (now() - i.actualizado_en) > interval '24 hours'
          then 'Empleado no ha traído documentos (>24h)'
        when i.estado = 'RH_VALIDA' and (now() - i.actualizado_en) > interval '24 hours'
          then 'RH no llenó ST-7 (regla de oro: <24h)'
        when i.estado = 'MEDICINA_TRABAJO' and (now() - i.actualizado_en) > interval '7 days'
          then 'En IMSS >7 días sin dictamen'
        when i.estado = 'ALTA_PENDIENTE' and (now() - i.actualizado_en) > interval '48 hours'
          then 'Empleado sin ST-2 >48h — no puede laborar'
        else null
      end as motivo
    from incapacidades i
    join empleados e on e.id = i.empleado_id
    left join sedes s on s.id = e.sede_id
    where i.estado not in ('CERRADA','RECHAZADA','CANCELADA')
  )
  select id, tipo, estado, round(dias::numeric, 1), nombre, numero_empleado, abrev, reportada_por, motivo
  from base
  where motivo is not null
  order by dias desc;
$$;

grant execute on function incapacidades_atoradas() to authenticated;

-- Cron: corre cada día a las 9am hora Mérida (15:00 UTC) y a las 3pm (21:00 UTC)
do $$
declare
  v_job_id int;
begin
  select jobid into v_job_id from cron.job where jobname = 'vortex_notify_incap_atoradas';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
exception when undefined_table then null; end$$;

do $$ begin
  perform cron.schedule(
    'vortex_notify_incap_atoradas',
    '0 15,21 * * *',  -- 9am y 3pm hora Mérida
    $cron$
      select net.http_post(
        url := 'https://vertice-rosy.vercel.app/api/cron/notify-incapacidades',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', 'vortex_cron_a8e3f9c2b1d7e4a6f8c0b3d5e7a9c1b3'
        )
      );
    $cron$
  );
exception when undefined_function then null; end $$;

notify pgrst, 'reload schema';
