-- v26: Rol FACTURACION como rol propio.
-- ─────────────────────────────────────────────────────────────────────
-- Hasta v25, "acceso a facturación" era un flag (acceso_facturacion=true)
-- que se asignaba sobre un rol base (típicamente USER de supervisor de campo
-- con compras, como Alex).
--
-- A partir de v26, FACTURACION es además un VALOR DEL ENUM de rol, para
-- usuarios que SOLO trabajan en el módulo de facturación (sin asistencias,
-- sin pase de lista, sin RH). Ej: Diego de facturación, Brenda, Alejandra
-- si quieren un acceso restringido en lugar de SUPERADMIN.
--
-- Reglas:
--   · rol = FACTURACION   → acceso_facturacion = true automático (trigger)
--   · acceso_facturacion adicional sigue funcionando para supervisores
--     híbridos (Alex es USER + acceso_facturacion=true).
--   · tiene_acceso_facturacion() ahora también devuelve true si rol=FACTURACION.
--   · es_facturacion_only() para detectar usuarios que SOLO hacen facturación.

-- 1) Extender enum (idempotente)
alter type user_role add value if not exists 'FACTURACION';

-- 2) Trigger: si el rol cambia a FACTURACION, activar acceso_facturacion
--    automáticamente (para no olvidarlo en la UI).
create or replace function _tg_sync_acceso_facturacion()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if NEW.rol::text = 'FACTURACION' and (NEW.acceso_facturacion is null or NEW.acceso_facturacion = false) then
    NEW.acceso_facturacion := true;
  end if;
  return NEW;
end$$;

drop trigger if exists tg_sync_acceso_facturacion on usuarios;
create trigger tg_sync_acceso_facturacion
before insert or update of rol on usuarios
for each row execute function _tg_sync_acceso_facturacion();

-- 3) Backfill: usuarios que ya tengan rol FACTURACION reciban el flag
update usuarios
   set acceso_facturacion = true
 where rol::text = 'FACTURACION'
   and (acceso_facturacion is null or acceso_facturacion = false);

-- 4) Refrescar tiene_acceso_facturacion() para reconocer el nuevo rol
create or replace function tiene_acceso_facturacion()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select acceso_facturacion
         or rol::text in ('SUPERADMIN','SOPORTE','CEO','FACTURACION')
       from usuarios where id = auth.uid()),
    false
  );
$$;

-- 5) Helper: ¿el caller actual es SOLO facturación? (para redirects de UI)
create or replace function es_facturacion_only()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select rol::text = 'FACTURACION'
       from usuarios where id = auth.uid()),
    false
  );
$$;

grant execute on function tiene_acceso_facturacion() to authenticated;
grant execute on function es_facturacion_only() to authenticated;

-- 6) Refrescar usuarios_con_acceso_facturacion() para incluir el nuevo rol
create or replace function usuarios_con_acceso_facturacion()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select id from usuarios
   where (acceso_facturacion = true
          or rol::text in ('SUPERADMIN','SOPORTE','CEO','FACTURACION'))
     and (ausente_desde is null or current_date < ausente_desde or current_date > ausente_hasta);
$$;

grant execute on function usuarios_con_acceso_facturacion() to authenticated;

notify pgrst, 'reload schema';
