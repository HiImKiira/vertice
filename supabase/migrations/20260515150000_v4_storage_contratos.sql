-- ============================================================
-- Vortex — migración v4: storage bucket para PDFs de contratos
--
-- Bucket privado `contratos-pdf`. Acceso vía signed URLs (1h)
-- generados desde server actions con service_role.
-- Policies: solo ADMIN/SUPERADMIN pueden subir/leer.
-- ============================================================

-- Crear bucket privado
insert into storage.buckets (id, name, public)
values ('contratos-pdf', 'contratos-pdf', false)
on conflict (id) do nothing;

-- RLS para storage.objects (Supabase auto-enable)
-- Drop policies viejas si existen (safe)
drop policy if exists "contratos_pdf_read_admin" on storage.objects;
drop policy if exists "contratos_pdf_write_admin" on storage.objects;
drop policy if exists "contratos_pdf_update_admin" on storage.objects;
drop policy if exists "contratos_pdf_delete_admin" on storage.objects;

create policy "contratos_pdf_read_admin" on storage.objects for select to authenticated
  using (bucket_id = 'contratos-pdf' and es_admin());

create policy "contratos_pdf_write_admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'contratos-pdf' and es_admin());

create policy "contratos_pdf_update_admin" on storage.objects for update to authenticated
  using (bucket_id = 'contratos-pdf' and es_admin())
  with check (bucket_id = 'contratos-pdf' and es_admin());

create policy "contratos_pdf_delete_admin" on storage.objects for delete to authenticated
  using (bucket_id = 'contratos-pdf' and es_superadmin());

-- Columna en contratos para el path en Storage (separado de url_pdf que es signed)
alter table contratos add column if not exists pdf_storage_path text;
