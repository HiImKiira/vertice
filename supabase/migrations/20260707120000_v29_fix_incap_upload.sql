-- v29: Arreglar el upload de documentos de incapacidades.
-- ─────────────────────────────────────────────────────────────────────
-- PROBLEMA: al aplicar v14 en Supabase Studio, el ñ de la columna
-- `tamaño_bytes` se guardó con encoding corrupto y quedó como
-- `tamaÃ±o_bytes` (mojibake). El código inserta `tamano_bytes`/`tamaño_bytes`,
-- que NO coincide con el nombre real → cada INSERT en incapacidad_documentos
-- fallaba → NINGÚN documento se pudo subir (0 documentos en la tabla).
--
-- SOLUCIÓN: renombrar la columna a `tamano_bytes` (ASCII puro, sin ñ) sin
-- depender del nombre corrupto exacto. Idempotente.

do $$
declare
  col_actual text;
begin
  -- Si ya existe la columna correcta, no hacemos nada.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'incapacidad_documentos'
      and column_name = 'tamano_bytes'
  ) then
    return;
  end if;

  -- Buscar cualquier columna tipo "tama...o_bytes" (la corrupta o la de ñ real).
  select column_name into col_actual
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'incapacidad_documentos'
    and column_name like 'tama%o_bytes'
  limit 1;

  if col_actual is not null then
    execute format(
      'alter table public.incapacidad_documentos rename column %I to tamano_bytes',
      col_actual
    );
  else
    -- No había ninguna variante → crearla limpia.
    alter table public.incapacidad_documentos add column tamano_bytes int;
  end if;
end $$;

-- Re-asegurar el bucket (idempotente) por si algún entorno no lo tuviera.
insert into storage.buckets (id, name, public)
  values ('incapacidades', 'incapacidades', false)
  on conflict (id) do nothing;

notify pgrst, 'reload schema';
