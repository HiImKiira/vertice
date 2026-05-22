-- v6: dar al rol SOPORTE acceso a tickets/mensajes como si fuera admin.
-- La app (lib/session.ts isAdminLike) ya trata a SOPORTE como admin-like,
-- pero las policies SQL solo usaban es_admin() que excluye SOPORTE.
--
-- Nuevo helper es_soporte_o_admin() y se reescriben las policies de
-- tickets_soporte / mensajes_soporte para usarlo.

create or replace function es_soporte_o_admin()
returns boolean
language sql stable
as $$
  select rol_actual() in ('ADMIN', 'CEO', 'SUPERADMIN', 'SOPORTE');
$$;

-- tickets_soporte
drop policy if exists "tickets_select_propio_o_admin" on tickets_soporte;
create policy "tickets_select_propio_o_admin" on tickets_soporte for select to authenticated
  using (supervisor_id = auth.uid() or es_soporte_o_admin());

drop policy if exists "tickets_admin_update" on tickets_soporte;
create policy "tickets_admin_update" on tickets_soporte for update to authenticated
  using (es_soporte_o_admin() or supervisor_id = auth.uid())
  with check (es_soporte_o_admin() or supervisor_id = auth.uid());

-- mensajes_soporte
drop policy if exists "mensajes_select" on mensajes_soporte;
create policy "mensajes_select" on mensajes_soporte for select to authenticated
  using (
    es_soporte_o_admin()
    or exists (select 1 from tickets_soporte t where t.id = mensajes_soporte.ticket_id and t.supervisor_id = auth.uid())
  );

drop policy if exists "mensajes_insert" on mensajes_soporte;
create policy "mensajes_insert" on mensajes_soporte for insert to authenticated
  with check (
    es_soporte_o_admin()
    or (origen = 'USUARIO' and exists (select 1 from tickets_soporte t where t.id = mensajes_soporte.ticket_id and t.supervisor_id = auth.uid()))
  );

comment on function es_soporte_o_admin() is
  'True para roles que pueden gestionar tickets: ADMIN, CEO, SUPERADMIN, SOPORTE.';
