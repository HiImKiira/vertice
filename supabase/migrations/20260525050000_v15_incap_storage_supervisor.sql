-- v15: relajar policy de storage para permitir a supervisores subir documentos
-- de incapacidades de sus sedes. El access control real lo hace la tabla
-- incapacidad_documentos (RLS por incapacidad_id) cuando registramos el archivo.

do $$ begin
  drop policy if exists "incap_storage_insert" on storage.objects;
  create policy "incap_storage_insert" on storage.objects for insert to authenticated
    with check (bucket_id = 'incapacidades');

  drop policy if exists "incap_storage_delete" on storage.objects;
  create policy "incap_storage_delete" on storage.objects for delete to authenticated
    using (bucket_id = 'incapacidades' and es_soporte_o_admin());
exception when others then null; end $$;

-- Permitir que supervisores escriban en incapacidad_documentos si la incapacidad
-- referida es accesible para ellos. Reescribimos la policy con esa lógica.
drop policy if exists "incap_docs_insert" on incapacidad_documentos;
create policy "incap_docs_insert" on incapacidad_documentos for insert to authenticated
  with check (
    es_soporte_o_admin()
    or (
      subido_por = auth.uid()
      and incapacidad_id in (
        select id from incapacidades
        where empleado_id in (select id from empleados where sede_id in (select sedes_de_usuario()))
      )
    )
  );

notify pgrst, 'reload schema';
