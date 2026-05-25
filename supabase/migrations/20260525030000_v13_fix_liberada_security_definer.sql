-- v13: SECURITY DEFINER en funciones de chequeo de liberación.
--
-- Bug: las funciones fecha_liberada_para_usuario y liberacion_global_activa
-- corrían con privilegios del caller. Como la policy SELECT de
-- fechas_liberadas solo permite a admin-like, los supervisores no podían
-- "ver" la liberación → la función devolvía false → RLS de asistencias
-- bloqueaba el INSERT con "new row violates row-level security policy".
--
-- Fix: ambas funciones se redefinen con SECURITY DEFINER (corren con
-- privilegios del owner postgres, bypass de RLS).
--
-- Side effect: no leak de información sensible porque ambas devuelven
-- solo boolean.

create or replace function liberacion_global_activa()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from liberaciones_globales
    where activo = true
      and (expira_en is null or expira_en > now())
  );
$$;

create or replace function fecha_liberada_para_usuario(p_fecha date, p_usuario uuid)
returns boolean
language sql stable
security definer
set search_path = public
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

-- Para que los supervisores autenticados puedan ejecutar las funciones
grant execute on function liberacion_global_activa() to authenticated;
grant execute on function fecha_liberada_para_usuario(date, uuid) to authenticated;

notify pgrst, 'reload schema';
