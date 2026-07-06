# Vortex — Snapshot de contexto para Claude

> **Este archivo es para que cualquier sesión futura de Claude tome el hilo sin re-descubrir el proyecto.** Léelo completo antes de hacer cambios. Última actualización: 2026-06-09. Migraciones hasta v28. SW en v9 (minimalista solo-push, no cachea /_next/).

---

## TL;DR

**Vortex** es el sistema de **asistencia + RH multi-sede + facturación** de MHS Integradora (limpieza y servicios, Yucatán). Reemplaza un Google Sheet + Apps Script legacy de ~6000 líneas. Está en producción usado por ~10-15 supervisores + admin + 1 facturación. URL: https://vertice-rosy.vercel.app

**Stack**: Next.js 15 App Router + Supabase (Auth + Postgres + Storage) + Vercel + pnpm workspaces. PWA instalable con push notifications + modo offline real (IndexedDB) + import/export xlsx + PDFs server-side.

**Cliente principal**: tú eres Edy (SOPORTE). Colegas: Brenda (SUPERADMIN, facturación), Diego Orlando (SUPERADMIN), Alejandra Mejía (SUPERADMIN), Pedro (SUPERADMIN), Alex (USER + acceso_facturacion).

---

## Repo y comandos

```
C:\Users\edyme\proyectos\vertice         (Windows)
github: HiImKiira/vertice (público)
deploy: Vercel (proyecto "vertice" en team_WJJutvhMvUeXD3SlO18kzv0Y)
```

**pnpm workspaces**:
- `apps/web/` — Next.js 15 (la app)
- `apps/mobile/` — Expo (vacío, futuro)
- `packages/shared/` — códigos de asistencia, constantes de nómina
- `supabase/migrations/` — SQL versionado v1..v26
- `scripts/` — scripts node mjs (sync, import, helpers admin, create-user, import-clabe-rfc)

**Comandos esenciales** (desde la raíz):
```bash
# Typecheck del frontend
pnpm --filter @vertice/web typecheck

# Deploy a prod (desde raíz del repo; .vercel/project.json apunta al proyecto correcto)
vercel deploy --prod --yes

# PowerShell: copiar SQL al clipboard
Get-Content supabase/migrations/20260526160000_v26_rol_facturacion.sql -Raw | Set-Clipboard

# PowerShell add env var a Vercel (cuidado con \r\n trailing — siempre revisa)
"valor" | vercel env add NAME production

# Crear usuario nuevo (auth + tabla usuarios)
node scripts/create-user.mjs <email> <password> <rol> <nombre> [username]

# Import masivo de CLABE/RFC desde xlsx legacy (matching por nombre)
node scripts/import-clabe-rfc.mjs <ruta-xlsx> [--dry-run]
```

**No instales nada en `vercel.json` que diga rootDirectory** — está configurado vía Management API a `apps/web`.

---

## Roles y usuarios actuales

Roles en `usuarios.rol` (enum `user_role`):
- `USER` — supervisor de campo (captura pase de lista)
- `ADMIN` — RH operativo
- `SUPERADMIN` — full access
- `CEO` — full access, gestión ejecutiva
- `SOPORTE` — IT/soporte, ve casi todo (igual que admin para tickets/empleados/asistencias/incap)
- `FACTURACION` — **NUEVO en v26**. Exclusivo del módulo /facturacion. NO ve pase de lista, incidencias, RH. Topbar restringido.

Función SQL `es_admin()` → ADMIN/CEO/SUPERADMIN. `es_soporte_o_admin()` → los 4 admin-like (incluye SOPORTE).
Función SQL `tiene_acceso_facturacion()` → SUPERADMIN/SOPORTE/CEO/FACTURACION o usuarios con flag `acceso_facturacion=true`.
Función SQL `es_facturacion_only()` → rol = FACTURACION (para redirects UI).

**Cuentas de admin actuales**:
| Usuario | Email | Rol | Notas |
|---|---|---|---|
| Edy | `edy` | SOPORTE | tú |
| Brenda Presta | `brendaisla88@gmail.com` | SUPERADMIN | facturación |
| Diego Orlando | `dieorlando.dc@gmail.com` | SUPERADMIN | facturación |
| Alejandra Mejía | `alemejia14@hotmail.com` | SUPERADMIN | facturación |
| Alejandro Pasos | `alex@vertice.mhs.local` | USER + acceso_facturacion | supervisor MAT + compras |
| Pedro Facturación | `pedro@vertice.mhs.local` | SUPERADMIN | acceso completo |

Passwords están en el historial del chat / scripts pero no se guardan en repo. Si necesitas resetear: `/rh-pro/supervisores/[id]` → botón **"Generar password temporal"**.

---

## Datos en producción (al 2026-05-26)

- **352 empleados** (273 activos, 79 dados de baja) importados de `Asistencias V4` Google Sheet pestaña `CONTRATOS_2026`
- **129 empleados** con datos bancarios completos (RFC + CURP + CLABE + banco) tras correr `scripts/import-clabe-rfc.mjs` con el archivo `CLABE INTERBANCARIA 1A Q MAYO26-final.xlsx`. 1 ambiguo, 6 sin match.
- **26 sedes activas** (mayormente sector salud Yucatán: SHO, SHM, SVAL, SCSM, SCSSJ, UTM, UPY, etc.)
- **~8800 asistencias** históricas importadas (1 abril → 21 mayo 2026)
- **Asignaciones supervisor**: Ivan 16, Fernando 10, Alex 3 (combinadas sede × jornada)
- **Numero_empleado**: 1-354 son legacy del sheet. Vortex auto-asigna **400+** para nuevas altas.

---

## Tech stack

### Frontend
- Next.js **15.x** App Router, **Server Components** por default
- React 19 + `useTransition` para pending states
- TypeScript con `exactOptionalPropertyTypes: true` (cuidado, marca undefined explícitamente)
- TailwindCSS con custom utilities en `globals.css` (paleta navy/blue/gold)
- Fonts: Syne (display) + DM Sans (body)
- `@react-pdf/renderer` para PDFs server-side
- `exceljs` para xlsx (export + import + template generator)
- Web Push API + Service Worker propio
- IndexedDB nativo (sin dep) para modo offline

### Backend
- Supabase Postgres (proyecto `sdfddpyeugdpuwbifvwx`)
- RLS habilitado en todas las tablas
- pg_cron + pg_net habilitados para crons
- web-push library para enviar notificaciones

### Storage
- Bucket `contratos` (PDFs de contratos generados)
- Bucket `incapacidades` (ST-7, ST-2, fotos médicas)

### Deploy
- Vercel "vertice-rosy.vercel.app"
- Service Worker en `/sw.js` con CACHE_VERSION bumpeable (actualmente **v6**)
- Push manifest en `/manifest.webmanifest`, iconos en `/icons/`

---

## Variables de entorno

### En `apps/web/.env.local` (no commiteado)
```
NEXT_PUBLIC_SUPABASE_URL=https://sdfddpyeugdpuwbifvwx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BBdRWY6l9scMTDV8N2QHY...
VAPID_PRIVATE_KEY=v9mpctQI4xthCo6OliMexY...
VAPID_SUBJECT=https://vertice-rosy.vercel.app
CRON_SECRET=vortex_cron_a8e3f9c2b1d7e4a6f8c0b3d5e7a9c1b3
```

**En Vercel production** los mismos están configurados. **Cuidado**: si los seteas vía PowerShell con `"valor" | vercel env add`, agrega `\r\n` al final → sanea en código con `.replace(/[\r\n\s]+/g, "")`.

---

## Módulos construidos (en orden de importancia)

### `/pase-lista` — captura diaria de asistencia
- Por sede × jornada, filtra empleados que el supervisor tiene asignados
- Códigos: A, F, DS, DT, INH, FER, PCG, PSG, I, AF, SN (en `packages/shared/src/codes.ts`)
- Botones rápidos A/F/I por renglón + menú `⋯` para códigos avanzados
- Captura por ID bulk (numpad on-screen con coma)
- Quick actions: copiar pase anterior, pendientes como A, todos A
- Chips de jornada por empleado (MAT/VES/NOC color-coded)
- Inmutabilidad: una vez capturada, solo admin-like puede sobrescribir
- **Modo offline real con IndexedDB** (apps/web/src/lib/offline-{store,sync}.ts)
- Marca quién capturó cada asistencia + hora

### `/rh-pro` — hub principal de RH
Sub-rutas:
- `/rh-pro/alta` — alta de empleado + contrato auto-genera folio `MHS/<ABREV><NNN>/<año>`, PDF
- `/rh-pro/baja` — dar de baja (fecha + motivo + auditoría)
- `/rh-pro/empleados` — captura rápida (calendario mes × empleado) **+ botón "📥 Import masivo (xlsx)"**
- `/rh-pro/empleados/importar` — **NUEVO**: drop zone para xlsx + preview con validaciones + confirm
- `/rh-pro/contratos` — lista + edit + regenerar PDF
- `/rh-pro/sedes` — gestión sedes (activar/desactivar, notas)
- `/rh-pro/consulta` + `/[id]` — buscar empleado + ficha completa con **DatosPersonalesEditor** (RFC/NSS/CURP/banco/CLABE)
- `/rh-pro/supervisores` + `/[id]` — Centro de Supervisores con **CRUD completo**:
  - Botón "+ Nuevo supervisor" (modal con email/nombre/rol incluyendo FACTURACION)
  - DatosEditor: editar nombre/username/email/rol/activo
  - AsignacionesEditorInline: agregar/quitar sedes × jornadas con chips coloreados por turno
  - Botón "Eliminar/desactivar" (soft si tiene historial, hard si no)
  - Toggle "Acceso a Facturación" en GestionPanel
- `/rh-pro/liberacion-global` — toggle "abrir todas las fechas" con expira opcional (SUPERADMIN/SOPORTE)
- `/rh-pro/cambio-sede` — reasignación masiva de empleados entre sedes (SUPERADMIN/SOPORTE)
- `/rh-pro/descansos-semanales` — edita `dia_descanso` masivo (grid). El pase de lista **sugiere** DS ese día (ya no lo auto-marca — ver gotcha 18)
- `/rh-pro/cambio-descanso` — cambio de descanso **fijo/permanente** individual (sede→trabajador→día→motivo), con bitácora. ADMIN-like
- `/descansos/fijo` — **misma capacidad para supervisores (USER)**, acotada a sus sedes. Reusa `CambioDescansoForm`; el scope se valida en la action (`asignaciones_supervisor`)

### `/facturacion` — **NUEVO módulo completo** (v22-v26)
**Acceso**: rol = FACTURACION (exclusivo) o acceso_facturacion=true o admin-like.

- `/facturacion` — Dashboard con **HERO destacado** de Empleados Bancarios (X/Y listos · %), KPIs, accesos rápidos, últimas cotizaciones y compras
- `/facturacion/empleados-bancarios` — **vista core**: tabla filtrable por sede/estado/búsqueda. Exporta xlsx con 3 hojas: Depósitos, Layout SPEI, Incompletos. Cada fila tiene link "Llenar →" a la ficha del empleado.
- `/facturacion/cotizaciones` + `/[id]` + `/nueva` — CRUD cotizaciones con builder de líneas (catálogo + libres), totales auto-calc, estados (BORRADOR→ENVIADA→ACEPTADA/RECHAZADA→FACTURADA), descarga PDF con plantilla "MHS Integradora by Vortex"
- `/facturacion/productos` — CRUD productos con SKU, IVA, stock, alertas bajo stock
- `/facturacion/clientes` — CRUD clientes con razón social, RFC, contacto
- `/facturacion/compras` + `/[id]` + `/nueva` — solicitudes de compra que cualquier supervisor puede crear, workflow SOLICITADA→APROBADA→COMPRADA→ENTREGADA con push automático al equipo FAC + al solicitante en cambios de estado. Exporta xlsx con 2 hojas (Solicitudes + Items detalle).

**Nav del módulo** reordenada: Dashboard → Empleados bancarios (highlight azul) → Cotizaciones → Productos → Clientes → Compras.

**Redirect automático**: si rol=FACTURACION o (USER + acceso_facturacion sin asignaciones), `/dashboard` redirige a `/facturacion`. Topbar para rol FACTURACION solo muestra Facturación y Soporte.

### `/live` — CEO Live Dashboard
- Auto-refresh 30s con toggle + countdown
- 4 KPI hero (empleados / sedes / capturas hoy / % cobertura)
- Alertas accionables (tickets urgentes, ST-9, sedes incompletas, liberaciones)
- Sección **Cobertura por supervisor** con top 6 incompletos
- Captura por sede con progress bars
- Liberaciones vigentes (global + por fecha)
- Tickets abiertos + incapacidades activas (top 8 cada uno)
- Push 24h stats

### `/live/cobertura` — detalle por supervisor
- Date picker con presets "Hoy" y "Ayer (nómina)"
- KPIs globales: completos, incompletos, cero, % global
- Lista expandible: cada supervisor con detalle sede×jornada + cobertura mensual
- Botón notificar pendientes por supervisor con un click

### `/incapacidades` — flujo IMSS
- 4 tipos: ENFERMEDAD_GENERAL, RIESGO_TRABAJO, RIESGO_TRAYECTO, RIESGO_BIOLOGICO (ST-9)
- 9 estados workflow: REPORTADA → DOCS_EMPLEADO → RH_VALIDA → MEDICINA_TRABAJO → DICTAMEN → ALTA_PENDIENTE → CERRADA | RECHAZADA | CANCELADA
- Timeline con eventos (estado_cambio, comentario, documento)
- **Upload de PDFs/fotos** del ST-7, ST-2, mapa de trayecto, ST-9 al bucket storage
- Push automático en cada transición (incl. reporter + admins-like)
- Cron recordatorios cada día 9am/3pm Mérida para casos atorados

### `/soporte` — tickets
- 4 tipos: DESBLOQUEO, URGENCIA, DUDA, SUGERENCIA
- Thread con mensajes (supervisor + RH anonimizado como "Recursos Humanos")
- Botón "Liberar fecha 6h" desde el ticket
- Botón "Ir a capturar →" directo al pase con fecha+sede+jornada precargadas
- Estados: PENDIENTE / RESPONDIDO / CERRADO
- Push integrado en todo el flujo
- **AnnouncementPanel**: anuncios push manuales con targeting (broadcast o usuarios específicos)

### `/sonidos` — preferencias de sonido personalizadas
- 9 presets sintetizados via Web Audio API (sin descargas)
- 11 tipos de evento con sonido configurable (ahora incluye solicitud_compra_nueva, solicitud_compra_estado, acceso_facturacion)
- localStorage por dispositivo
- SW broadcast a clients abiertos via postMessage `vortex-push`

### `/reportes` — generación PDF + Excel
- `/api/reportes/asistencias` + `/xlsx` — matriz mes × empleado con códigos
- `/api/reportes/nomina` + `/xlsx` — cálculo de pago estimado con tarifas (315.04/día, 78.76/dom, 393.80/falta)
- **Ambos usan snapshot histórico** (v21+v24): si Juanita se cambió de sede a mitad de quincena, aparece en cada sede con sus días respectivos + leyenda "⚑ Se cambió de sede · 9d aquí". **Excluye empleados con fecha_baja anterior al periodo**.
- **Branding correcto**: Document title "Vortex · Nómina/Asistencias", author "Vortex · MHS Integradora", filenames "Vortex_..." (antes decían "Vertice").
- **Excel xlsx**: hoja principal con celdas coloreadas por código, freeze panes, auto-filter, formato monetario, hoja Leyenda.

---

## Push notifications

VAPID setup completo. `lib/push.ts` con:
- `sendPush(payload, usuarioIds?, tipo)` — manda a usuarios específicos o broadcast
- `notifyAdminLike(payload, tipo, excluirUserId?)` — manda a todos los admin-like

SW (`/sw.js` **v6**):
- `push` event → `showNotification` + postMessage a clients abiertos
- `notificationclick` → enfoca tab existente o abre nueva con la URL
- `message` SKIP_WAITING para take-over inmediato de versiones nuevas

Crons en pg_cron (Supabase):
- `vortex_notify_pendientes` — cada 3h, supervisores sin capturar hoy (entre 9-17 Mérida)
- `vortex_notify_incap_atoradas` — 9am y 3pm Mérida, incapacidades estancadas

Tablas:
- `push_subscriptions` — (usuario × dispositivo)
- `announcements` — anuncios mandados, con quién y cuántos llegaron
- `notify_log` — log de cada push (enviado/fallido_410/etc) para auditoría

Eventos que disparan push:
- `ticket_nuevo`, `ticket_respuesta_user`, `ticket_respuesta_rh`, `ticket_cerrado`, `fecha_liberada`
- `recordatorio_captura` (cron), `announcement` (manual), `test`
- `incapacidad_nueva`, `incapacidad_estado`, `incapacidad_documento`, `incapacidad_atorada`
- `reasignacion_sede`, `mensaje_rh_individual`, `recordatorio_masivo_rh`
- **NUEVO**: `solicitud_compra_nueva`, `solicitud_compra_estado`, `acceso_facturacion`

---

## Modo offline (pase-lista)

`apps/web/src/lib/offline-store.ts` + `offline-sync.ts`:
- IndexedDB DB `vortex-offline` v1, store `pending_saves`
- Schema: { id, fecha, sedeId, jornada, marcas[], createdAt, status, attempts, errorMsg }
- Status: pending / syncing / synced / error
- Auto-sync al volver online (event listener `online`) con delay 1.5s
- Polling cada 30s reintenta pending mientras online
- Max 5 reintentos antes de marcar error

**Detector offline fiable** (no se basa en `navigator.onLine` que miente en 4G):
- Hace ping real a `/api/ping` (edge runtime, HEAD, 4s timeout) para confirmar.
- `guardar()` siempre intenta server primero; cae a IndexedDB solo si fetch lanza por red caída.

Componente global `<OfflineBadge />` en root layout. Pill flotante con estados color-coded.

---

## Migraciones SQL aplicadas (v1..v26)

Todas en `supabase/migrations/` con prefijo timestamp. Aplicadas en Supabase Studio paste-and-run.

| Migración | Qué hace |
|---|---|
| v1 init | Schema base: usuarios, sedes, empleados, asistencias, incidencias, CDTs, tickets, eventos, fechas_liberadas |
| v2 legacy alignment | Reescritura para alinear con sheet legacy: sedes con abrev, contratos, tickets v2, mensajes_soporte, fechas_liberadas global, asignaciones_supervisor |
| v2.1 fixes | rol SOPORTE agregado al enum, sede_id en usuarios dropeada, vw_supervisores recreada |
| v3 contratos | Tabla contratos + sequence folio + RPC siguiente_folio_contrato |
| v4 storage contratos | Bucket "contratos" + policies |
| v5 multi-sede RLS | Fix RLS para que supervisor vea múltiples sedes (función sedes_de_usuario setof uuid) |
| v6 SOPORTE rol | es_soporte_o_admin + extensión tickets/mensajes policies |
| v7 liberar fecha | fechas_liberadas.expira_en + RPC liberar_fecha |
| v8 push notifications | push_subscriptions, announcements, notify_log + pg_cron schedule |
| v9 fix fecha_liberada | Bug RLS: supervisor_id que ya no existe — rewrite función |
| v10 empleado notas | usuarios y empleados con notas internas |
| v11 SOPORTE lectura amplia | empleados/asistencias/contratos/incidencias accesibles a SOPORTE |
| v12 liberación global | liberaciones_globales con toggle on/off |
| v13 fix liberada SECURITY DEFINER | función fecha_liberada_para_usuario corre con privs de owner |
| v14 incapacidades | Tablas + enums + workflow + storage bucket |
| v15 incap storage supervisor | Permite supervisor subir docs |
| v16 ceo live RPCs | ceo_kpis_overview, captura_por_sede_hoy, liberaciones_activas_detail |
| v17 incap recordatorios | RPC incapacidades_atoradas + pg_cron 9am/3pm |
| v18 cobertura supervisores | cobertura_supervisores, cobertura_supervisor_detalle, cobertura_mensual_supervisor |
| v19 centro supervisores | usuarios.notas + supervisor_resumen + supervisores_lista + bitacora_supervisor |
| v20 ausencias movimientos | usuarios.ausente_* + empleado_movimientos + supervisor_resumen v2 (DROP+CREATE) |
| v21 snapshot histórico | sede_efectiva + empleados_por_sede_periodo + asistencias_empleado_en_sede |
| **v22 facturación** | productos, clientes_cotizacion, cotizaciones+lineas, solicitudes_compra+items, RPCs folio, KPIs, RLS, flag acceso_facturacion |
| **v23 fix activo ambiguous** | DROP+CREATE supervisor_resumen calificando ps.activo / asg.activo. Output incluye acceso_facturacion |
| **v24 fix bajas en periodo** | empleados_por_sede_periodo filtra (fecha_baja IS NULL OR fecha_baja >= p_inicio) |
| **v25 datos personales y bancarios** | empleados.rfc, nss, curp, telefono, email_personal, direccion, banco, cuenta_bancaria, clabe + RPC empleados_bancarios_por_sede + RLS para acceso_facturacion |
| **v26 rol FACTURACION** | Agregar FACTURACION al enum user_role + trigger auto-activar acceso_facturacion + tiene_acceso_facturacion() y usuarios_con_acceso_facturacion() reconocen el nuevo rol + es_facturacion_only() helper |
| **v27 cambio descanso fijo** | empleado_movimientos + dia_descanso_anterior/nuevo text[] + RPC bitacora_cambios_descanso. Soporta tipo='cambio_descanso' |
| **v28 código DL** | Agregar 'DL' (Descanso Laborado, pago triple) al enum codigo_asistencia |

**Cómo verificar si una migración está aplicada**:
```sql
-- Lista de funciones definidas:
select proname from pg_proc where proname like '%facturacion%' or proname like '%empleados_bancarios%';

-- Cron jobs:
select jobname, schedule from cron.job;

-- Enum user_role:
select unnest(enum_range(NULL::user_role));
```

---

## Scripts útiles (`scripts/`)

- `create-user.mjs <email> <password> <rol> <nombre> [username]` — crea auth user + fila en usuarios. **Roles válidos**: USER, ADMIN, SUPERADMIN, CEO, SOPORTE, FACTURACION.
- `full-sync.mjs` — sync completo desde `Asistencias_LATEST.xlsx` (sedes + empleados + asignaciones)
- `import-contratos-2026.mjs` — sync de CONTRATOS_2026 con bajas + ultimo_folio
- `import-pase-lista-v2.mjs` — histórico de asistencias del sheet
- `diagnostico-sync.mjs` — compara sheet vs DB
- **`import-clabe-rfc.mjs <ruta-xlsx> [--dry-run]`** — importa RFC/CURP/CLABE/banco desde un xlsx legacy con matching por nombre normalizado (tokens ordenados). Banco se deduce automáticamente del prefijo CLABE (mapeo CNBV con 36 bancos). Reporte detallado al final.

---

## Endpoints API destacados

- `/api/heartbeat` — ping de presencia (escribe `ultimo_acceso` cada 5min)
- `/api/ping` — verificación de red, edge runtime, 204 No Content (para detector offline real)
- `/api/contratos/[id]/pdf` — genera/sirve PDF del contrato
- `/api/reportes/nomina` + `/xlsx` — reporte nómina PDF + Excel
- `/api/reportes/asistencias` + `/xlsx` — reporte asistencias PDF + Excel
- `/api/empleados/import-template` — descarga template xlsx para alta masiva
- `/api/facturacion/cotizaciones/[id]/pdf` — PDF "MHS Integradora by Vortex"
- `/api/facturacion/empleados-bancarios/xlsx` — Layout SPEI por sede para depósitos
- `/api/facturacion/compras/xlsx` — solicitudes de compra exportadas
- `/api/cron/*` — endpoints disparados por pg_cron (recordatorios, incapacidades atoradas)

---

## Gotchas / lecciones aprendidas

1. **PostgreSQL no permite cambiar return type con `OR REPLACE`**: usar `DROP FUNCTION` primero. Pasó con v20 (supervisor_resumen 21→25 cols) y v23.

2. **`now()` no es IMMUTABLE**: no usar en predicates de índices parciales. Pasó con v12.

3. **VAPID env vars contaminados con `\r\n`** al setearlos via PowerShell pipe. Saneamos en código con `.replace(/[\r\n\s]+/g, "")`.

4. **`PostgrestFilterBuilder` no es Promise**: no se puede hacer `.catch()` directo. Hacer await y revisar `.error`.

5. **`exactOptionalPropertyTypes: true`**: hay que declarar `field?: string | undefined`, no solo `field?: string`. TS estricto.

6. **Service Worker requiere bump de CACHE_VERSION** para que clients invaliden. Actualmente `vortex-v9` (minimalista: solo push, NO cachea navegación ni `/_next/`).

7. **`pushManager.subscribe(applicationServerKey)`** exige bytes válidos. Sanitizar VAPID key removiendo cualquier non-base64url char.

8. **iOS Safari + `Notification.requestPermission()`** exige llamarlo SINCRÓNICAMENTE desde el user gesture. No envolver en `useTransition`.

9. **iOS PWA + push**: solo funciona si la app está **instalada como PWA standalone**, no en Safari directo. Detectar con `navigator.standalone` o `display-mode: standalone`.

10. **Supabase RLS + SECURITY DEFINER**: las funciones SQL que leen tablas restringidas deben ser `SECURITY DEFINER` para que bypass de RLS. Ej. `fecha_liberada_para_usuario`, `sede_efectiva`, `empleados_bancarios_por_sede`.

11. **`fetchEmpleadosPorSedePeriodo`** tiene fallback a `fetchEmpleadosActivos` si v21 RPC no existe. Importante para resilencia.

12. **El cron `vortex_notify_pendientes` se setteó con `'0 */3 * * *'`** que es cada 3h en UTC, pero el endpoint hace su propio quiet-hours check Mérida (9-17). Si quieres ajustar, ojo con el TZ.

13. **navigator.onLine miente en móviles 4G/5G**: usar ping real a `/api/ping` para confirmar. El detector offline NUNCA se basa solo en navigator.onLine.

14. **Un archivo `"use server"` SOLO puede exportar funciones async**. Exportar `const`/objetos desde ahí rompe en runtime de producción con `c.map is not a function` (Next.js convierte el const en una referencia de server-action). Mover constantes a un `constants.ts` aparte sin `"use server"`. Pasó en descansos-semanales y cambio-descanso.

15. **El SW NO debe cachear `/_next/` cache-first**: causaba `ChunkLoadError` ("application error: a client-side exception") tras cada deploy al mezclar chunks de builds distintos. Desde v9 el SW no tiene listener `fetch` (solo push). Hay `public/reset-sw.html` para limpiar dispositivos atascados con SW viejo.

16. **Imports legacy pueden traer mojibake (UTF-8 leído como CP850)**: `n├║mero`→`número`, `Yucat├ín`→`Yucatán`. Reparable con `iconv.decode(iconv.encode(s,'cp850'),'utf8')`. Ver `scripts/fix-mojibake-contratos.mjs`. Afectó a config_contratos y contratos heredados.

17. **Contratos = 2 salidas de la misma data**: PDF Vortex (`lib/pdf/ContratoDoc.tsx` con bloques tipados en `templates/contrato-*-blocks.ts`, auto-generados del DOCX por `scripts/extract-contrato-blocks.mjs`) y Word fiel (`docxtemplater` sobre `lib/contratos/templates/contrato-*.docx`). Las 19 llaves `{{LLAVE}}` se mapean en el endpoint.

18. **El descanso semanal en pase de lista se SUGIERE, no se auto-marca**. Antes un `useEffect` metía `DS` en `pendientes` y se guardaba solo. Ahora `isSugerido(id)` = `descansoHoy.has(id) && !pendientes[id]`: se pinta en verde punteado ("toca para colocar") y solo entra a `pendientes`/se guarda cuando el supervisor lo confirma con un toque. `pendientesComoA` y stats respetan el estado sugerido (no lo pisan, cuenta como pendiente).

19. **NUNCA uses identificadores con ñ/acentos en SQL**. `tamaño_bytes` en v14 se guardó como `tamaÃ±o_bytes` (mojibake) al pegar en Studio → el INSERT del código nunca coincidió → 0 documentos de incapacidades subidos jamás. v29 renombra a `tamano_bytes` (ASCII). Regla: nombres de columnas/funciones SIEMPRE en ASCII. Diagnóstico rápido del DB real de Vortex vía service role: `node scripts/diag-incapacidades.mjs`.

20. **Server Actions de Next tienen límite de body de 1MB por defecto**. Subir fotos/PDF (ST7, 2-6MB) por Server Action fallaba silenciosamente antes de entrar a la action. Se sube en `next.config.ts` con `experimental.serverActions.bodySizeLimit`. Cualquier upload por action necesita esto.

14. **Correlated subqueries con columnas del mismo nombre causan "ambiguous"**: si tienes `from usuarios u` outer y dentro un subquery sobre `push_subscriptions` que también tiene `activo`, calificar SIEMPRE como `ps.activo`. Pasó con v23.

15. **El trigger `_tg_sync_acceso_facturacion`** auto-activa el flag cuando rol=FACTURACION. No necesitas setearlo manualmente al cambiar el rol.

16. **En import xlsx, NO sobrescribir con NULL** si la columna no viene en el archivo. Solo update campos que el xlsx trae con valor. Crítico para preservar datos previos cuando subes parciales.

17. **Match por nombre normalizado**: para imports legacy donde los `numero_empleado` no coinciden, normalizar nombres con tokens ordenados (uppercase + sin acentos + sorted tokens). Permite que "JUAN PEREZ GARCIA" matchee con "PEREZ GARCIA JUAN".

---

## Workflow típico de desarrollo

1. **Hacer cambio en código** + types pasan: `pnpm --filter @vertice/web typecheck`
2. **Commit semántico**: `feat:`, `fix:`, `refactor:`, etc. con footer `Co-Authored-By: Claude...`
3. **Push a main** (no usamos branches por velocidad — proyecto en early stage)
4. **Deploy**: `vercel deploy --prod --yes` (desde raíz del repo)
5. **Si hay SQL nuevo**: copiar al portapapeles con PowerShell `Get-Content ... | Set-Clipboard`, decir al usuario "pégalo en Supabase Studio → Run"

**Convenciones**:
- Iconos: usar componente `<Icon name="..." size={N} />` (set inline SVG, sin emojis en chrome). Set actual: lock, send, check, x, arrows, file-text, upload, users, settings, edit, trash, plus, search, building, clock, refresh, **receipt, shopping-cart, dollar, package**.
- Permisos: `requireUser()`, `requireAdminLike()`, `requireAccesoFacturacion()`, o check específico de rol en server actions
- Server actions con tipo `Promise<{ ok: true; ... } | { ok: false; error: string }>`
- Push fire-and-forget: `void sendPush(...).catch(console.error)` para no bloquear la response
- IDs UUIDs no se generan en cliente, siempre `default gen_random_uuid()` en DB
- Bumpear SW si cambias el handler `push` o el cache

---

## Próximos pasos / TODO

### Inmediato
- **Integración de correos inbound** (Postmark/SendGrid/Mailgun) para que cotizaciones y órdenes de compra que lleguen por email se archiven en Vortex. Requiere decidir provider + dominio + webhook.

### Sugeridos en algún punto
- **OCR del ST-7 con Claude Vision** — extraer folio, NSS, diagnóstico de la foto que sube el supervisor
- **Reporte consolidado quincenal** — un solo PDF con todas las sedes, índice, totales agregados
- **Aguinaldo / vacaciones / antigüedad** — calculadora legal LFT (aplica para diciembre)
- **Geolocalización al capturar** — validar que el supervisor está físicamente en la sede
- **Búsqueda global Ctrl+K** — Spotlight de Vortex (saltar a cualquier empleado/sede/ticket sin navegar)
- **Audit log completo** — defensa legal, quién hizo qué y cuándo
- **Send emails desde Vortex** — mandar cotizaciones a clientes con un click (requiere SPF/DKIM)
- **App móvil Expo** — comenzar `apps/mobile/` con notificaciones nativas

### Conocidos pero menores
- Reset password genera 10 chars random — funcional, podría agregarse email automático con la pwd
- Las notas internas viven en `usuarios.notas` y `empleados.notas` pero no en un timeline tipo Slack
- `ultimo_acceso` se llena vía heartbeat cada 5 min — fine para ahora
- iOS aún a veces tiene problemas con push si no está instalada como PWA — informativo, no bloqueante

---

## Cómo retomar este proyecto desde una sesión nueva

1. Lee este archivo entero.
2. Verifica el estado actual con:
   ```bash
   git log --oneline -20
   ls supabase/migrations/
   ```
3. Si el usuario pide algo, **busca primero en módulos existentes** antes de crear nuevos.
4. Si tocas SQL, **siempre** añade `notify pgrst, 'reload schema';` al final.
5. Si bumpas el SW, mover CACHE_VERSION (último: v9 → próximo v10). Recuerda que desde v9 el SW NO cachea navegación.
6. Si agregas push event, registralo en `lib/sounds.ts` también para el sonido custom.
7. Si creas nueva ruta `/algo`, verifica que esté incluida en `adminOnly` Set del dashboard si aplica.
8. **Nunca** uses `notFound()` ciegamente; muestra mensaje útil al usuario.
9. **Commit messages** con `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` al final.
10. **Para imports xlsx masivos** que no son one-off → integrar via UI `/rh-pro/empleados/importar`. Para one-off → script en `scripts/`.
11. **Si el usuario pide algo del módulo de facturación**: verificar que tenga `acceso_facturacion=true` o sea admin-like o rol FACTURACION. El gate vive en `lib/facturacion-gate.ts`.

---

## Contactos / contexto humano

- **Edy (tú)**: SOPORTE/IT. Diseña, integra, dice qué falta. Pragmático, valora velocidad de iteración.
- **Brenda**: SUPERADMIN, finanzas/facturación. Necesita reportes claros y exportables.
- **Diego Orlando**: SUPERADMIN, facturación.
- **Alejandra**: SUPERADMIN, facturación.
- **Pedro**: SUPERADMIN (recién creado).
- **Iván (supervisor estrella)**: tiene 16 asignaciones, ~203 empleados visibles. Si rompe, hay que checar RLS multi-sede.
- **Alex**: USER + acceso_facturacion. 3 sedes MAT (SHO, SLE2, SJS) + módulo de compras.

**Cultura del proyecto**:
- Velocidad sobre perfección
- Push de cada cambio que pase typecheck
- Migraciones SQL siempre idempotentes (`if not exists`, `create or replace`, `drop if exists`)
- Mensajes en español para usuarios finales, código y commits en español+inglés mezclado
- Tono cercano sin perder rigor técnico
- **El módulo de facturación es independiente del de asistencias**. Un usuario con rol FACTURACION no debe ver nada de RH ni pase de lista.

---

**¡Bienvenido al proyecto, futuro Claude!** Si algo no está claro acá, búscalo en el historial de git: cada commit tiene un mensaje explicando el porqué. Y este archivo se actualiza conforme avanza el proyecto.
