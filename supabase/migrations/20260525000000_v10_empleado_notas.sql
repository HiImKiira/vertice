-- v10: campo de notas en empleados para el módulo de consulta de RH.
-- RH puede dejar observaciones sobre conducta, incidentes, méritos, etc.
-- Texto libre, sin estructura por ahora — se puede formalizar después si
-- se necesita historial.

alter table empleados add column if not exists notas text;
alter table empleados add column if not exists notas_actualizado_en timestamptz;
alter table empleados add column if not exists notas_actualizado_por uuid references usuarios(id);

comment on column empleados.notas is 'Notas libres de RH sobre el empleado (visibles solo para admin-like).';

notify pgrst, 'reload schema';
