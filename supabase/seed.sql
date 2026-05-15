-- ============================================================
-- Vértice — datos semilla mínimos para desarrollo local
-- (Se ejecuta automáticamente con `supabase db reset`.)
-- ============================================================

insert into sedes (codigo, nombre, direccion) values
  ('CENTRO', 'Sede Centro', 'Av. Principal 100'),
  ('NORTE',  'Sede Norte',  'Blvd. Norte 200'),
  ('SUR',    'Sede Sur',    'Calz. Sur 300')
on conflict (codigo) do nothing;

-- Período de nómina actual abierto (quincena que contiene hoy).
insert into periodos_nomina (quincena_inicio, quincena_fin, estado)
select
  case when extract(day from current_date) <= 15
       then date_trunc('month', current_date)::date
       else (date_trunc('month', current_date) + interval '15 days')::date end,
  case when extract(day from current_date) <= 15
       then (date_trunc('month', current_date) + interval '14 days')::date
       else (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date end,
  'ABIERTO'
on conflict (quincena_inicio, quincena_fin) do nothing;
