# Vortex — Snapshot de contexto para Claude

> **Este archivo es para que cualquier sesión futura de Claude tome el hilo sin re-descubrir el proyecto.** Léelo completo antes de hacer cambios. Última actualización: 2026-05-25.

---

## TL;DR

**Vortex** es el sistema de **asistencia + RH multi-sede** de MHS Integradora (limpieza y servicios, Yucatán). Reemplaza un Google Sheet + Apps Script legacy de ~6000 líneas. Está en producción usado por ~10-15 supervisores + admin. URL: https://vertice-rosy.vercel.app

**Stack**: Next.js 15 App Router + Supabase (Auth + Postgres + Storage) + Vercel + pnpm workspaces. PWA instalable con push notifications + modo offline real (IndexedDB).

**Cliente principal**: tú eres Edy (SOPORTE). Tus colegas: Brenda (SUPERADMIN, facturación), Diego Orlando (SUPERADMIN), Alejandra Mejía (SUPERADMIN).

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
- `supabase/migrations/` — SQL versionado v1..v21
- `scripts/` — scripts node mjs para sync, import, helpers admin

**Comandos esenciales** (desde la raíz):
```bash
# Typecheck del frontend
pnpm --filter @vertice/web typecheck

# Deploy a prod (desde raíz del repo; .vercel/project.json apunta al proyecto correcto)
vercel deploy --prod --yes

# PowerShell add env var a Vercel (cuidado con \r\n trailing — siempre revisa)
"valor" | vercel env add NAME production
```

**No instales nada en `vercel.json` que diga rootDirectory** — está configurado vía Management API a `apps/web`.

---

## Roles y usuarios actuales

Roles en `usuarios.rol`:
- `USER` — supervisor de campo (captura pase de lista)
- `ADMIN` — RH operativo
- `SUPERADMIN` — full access
- `CEO` — full access, gestión ejecutiva
- `SOPORTE` — IT/soporte, ve casi todo (igual que admin para tickets/empleados/asistencias/incap)

Función SQL `es_admin()` → ADMIN/CEO/SUPERADMIN. `es_soporte_o_admin()` → los 4 admin-like (incluye SOPORTE).

**Cuentas de admin actuales**:
| Usuario | Email | Rol | Notas |
|---|---|---|---|
| Edy | `edy` | SOPORTE | tú |
| Brenda Presta | `brendaisla88@gmail.com` | SUPERADMIN | facturación |
| Diego Orlando | `dieorlando.dc@gmail.com` | SUPERADMIN | facturación |
| Alejandra Mejía | `alemejia14@hotmail.com` | SUPERADMIN | facturación |
| Alejandro Pasos | `alex@vertice.mhs.local` | USER | supervisor, 3 sedes MAT |

Passwords están en el historial del chat / scripts pero no se guardan en repo. Si necesitas resetear: `/rh-pro/supervisores/[id]` → botón **"Generar password temporal"**.

---

## Datos en producción (al 2026-05-25)

- **352 empleados** (273 activos, 79 dados de baja) importados de `Asistencias V4` Google Sheet pestaña `CONTRATOS_2026`
- **26 sedes activas** (mayormente sector salud Yucatán: SHO, SHM, SVAL, SCSM, SCSSJ, UTM, UPY, etc.)
- **~8800 asistencias** históricas importadas (1 abril → 21 mayo 2026)
- **Asignaciones supervisor**: Ivan 16, Fernando 10, Alex 3 (combinadas sede × jornada)
- **Numero_empleado**: 1-354 son legacy del sheet. Vortex auto-asigna **400+** para nuevas altas para no chocar.

---

## Tech stack

### Frontend
- Next.js **15.x** App Router, **Server Components** por default
- React 19 + `useTransition` para pending states
- TypeScript con `exactOptionalPropertyTypes: true` (cuidado, marca undefined explícitamente)
- TailwindCSS con custom utilities en `globals.css` (paleta navy/blue/gold)
- Fonts: Syne (display) + DM Sans (body)
- `@react-pdf/renderer` para PDFs server-side
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
- Service Worker en `/sw.js` con CACHE_VERSION bumpeable
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
- `/rh-pro/empleados` — captura rápida (calendario mes × empleado)
- `/rh-pro/contratos` — lista + edit + regenerar PDF
- `/rh-pro/sedes` — gestión sedes (activar/desactivar, notas)
- `/rh-pro/consulta` + `/[id]` — buscar empleado, ver histórico + notas internas
- `/rh-pro/supervisores` + `/[id]` — **Centro de Supervisores**: lista cards, cobertura hoy, mensaje custom, notas, bitácora últimas 20, vacaciones, reset password
- `/rh-pro/liberacion-global` — toggle "abrir todas las fechas" con expira opcional (SUPERADMIN/SOPORTE)
- `/rh-pro/cambio-sede` — reasignación masiva de empleados entre sedes (SUPERADMIN/SOPORTE)
- `/rh-pro/descansos-semanales` — auto-llena DS según `dia_descanso` del empleado

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
- Cron recordatorios cada día 9am/3pm Mérida para casos atorados (>24h en RH_VALIDA, >7d en MEDICINA_TRABAJO, etc)

### `/soporte` — tickets
- 4 tipos: DESBLOQUEO, URGENCIA, DUDA, SUGERENCIA
- Thread con mensajes (supervisor + RH anonimizado como "Recursos Humanos")
- Botón "Liberar fecha 6h" desde el ticket
- Botón "Ir a capturar →" directo al pase con fecha+sede+jornada precargadas
- Estados: PENDIENTE / RESPONDIDO / CERRADO
- Push integrado en todo el flujo (nuevo / respuesta / cierre)
- **Panel `AnnouncementPanel`**: anuncios push manuales con targeting (broadcast o usuarios específicos) + test broadcast + log de actividad reciente

### `/sonidos` — preferencias de sonido personalizadas
- 9 presets sintetizados via Web Audio API (sin descargas)
- 8 tipos de evento con sonido configurable
- localStorage por dispositivo
- SW broadcast a clients abiertos via postMessage `vortex-push`

### `/reportes` — generación PDF
- `/api/reportes/asistencias` — matriz mes × empleado con códigos
- `/api/reportes/nomina` — cálculo de pago estimado con tarifas (315.04/día, 78.76/dom, 393.80/falta)
- **Ambos usan snapshot histórico** (v21): si Juanita se cambió de sede a mitad de quincena, aparece en cada sede con sus días respectivos + leyenda "⚑ Se cambió de sede · 9d aquí"

---

## Push notifications

VAPID setup completo. `lib/push.ts` con:
- `sendPush(payload, usuarioIds?, tipo)` — manda a usuarios específicos o broadcast
- `notifyAdminLike(payload, tipo, excluirUserId?)` — manda a todos los admin-like

SW (`/sw.js` v5):
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

---

## Modo offline (pase-lista)

`apps/web/src/lib/offline-store.ts` + `offline-sync.ts`:
- IndexedDB DB `vortex-offline` v1, store `pending_saves`
- Schema: { id, fecha, sedeId, jornada, marcas[], createdAt, status, attempts, errorMsg }
- Status: pending / syncing / synced / error
- Auto-sync al volver online (event listener `online`) con delay 1.5s
- Polling cada 30s reintenta pending mientras online
- Max 5 reintentos antes de marcar error

Componente global `<OfflineBadge />` en root layout:
- Pill flotante abajo-derecha
- Solo aparece si hay actividad (offline / pendientes / errores)
- Color: rojo (offline) / ámbar (pendientes) / verde (todo OK)
- Click abre panel con lista de batches + acciones (sync ahora, descartar, limpiar synced)

`PaseListaClient.commitGuardar()` usa `useOfflineSync().guardar()` que cae a IndexedDB si no hay red.

---

## Migraciones SQL aplicadas (v1..v21)

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

**Cómo verificar si una migración está aplicada**:
```sql
-- Lista de funciones definidas:
select proname from pg_proc where proname like 'supervisor%' or proname like 'cobertura%';

-- Cron jobs:
select jobname, schedule from cron.job;
```

---

## Scripts útiles (`scripts/`)

- `create-user.mjs <email> <password> <rol> <nombre> [username]` — crea auth user + fila en usuarios
- `full-sync.mjs` — sync completo desde `Asistencias_LATEST.xlsx` (sedes + empleados + asignaciones)
- `import-contratos-2026.mjs` — sync de CONTRATOS_2026 con bajas + ultimo_folio
- `import-pase-lista-v2.mjs` — histórico de asistencias del sheet
- `diagnostico-sync.mjs` — compara sheet vs DB

---

## Gotchas / lecciones aprendidas

1. **PostgreSQL no permite cambiar return type con `OR REPLACE`**: usar `DROP FUNCTION` primero. Pasó con v20 (supervisor_resumen 21→25 cols).

2. **`now()` no es IMMUTABLE**: no usar en predicates de índices parciales. Pasó con v12.

3. **VAPID env vars contaminados con `\r\n`** al setearlos via PowerShell pipe. Saneamos en código con `.replace(/[\r\n\s]+/g, "")`.

4. **`PostgrestFilterBuilder` no es Promise**: no se puede hacer `.catch()` directo. Hacer await y revisar `.error`.

5. **`exactOptionalPropertyTypes: true`**: hay que declarar `field?: string | undefined`, no solo `field?: string`. TS estricto.

6. **Service Worker requiere bump de CACHE_VERSION** para que clients invaliden. Actualmente `vortex-v5`.

7. **`pushManager.subscribe(applicationServerKey)`** exige bytes válidos. Sanitizar VAPID key removiendo cualquier non-base64url char.

8. **iOS Safari + `Notification.requestPermission()`** exige llamarlo SINCRÓNICAMENTE desde el user gesture. No envolver en `useTransition`.

9. **iOS PWA + push**: solo funciona si la app está **instalada como PWA standalone**, no en Safari directo. Detectar con `navigator.standalone` o `display-mode: standalone`.

10. **Supabase RLS + SECURITY DEFINER**: las funciones SQL que leen tablas restringidas deben ser `SECURITY DEFINER` para que bypass de RLS. Ej. `fecha_liberada_para_usuario`, `sede_efectiva`.

11. **`fetchPeriodData.fetchEmpleadosPorSedePeriodo`** tiene fallback a `fetchEmpleadosActivos` si v21 RPC no existe. Importante para resilencia.

12. **El cron `vortex_notify_pendientes` se setteó con `'0 */3 * * *'`** que es cada 3h en UTC, pero el endpoint hace su propio quiet-hours check Mérida (9-17). Si quieres ajustar, ojo con el TZ.

---

## Workflow típico de desarrollo

1. **Hacer cambio en código** + types pasan: `pnpm --filter @vertice/web typecheck`
2. **Commit semántico**: `feat:`, `fix:`, `refactor:`, etc. con footer `Co-Authored-By: Claude...`
3. **Push a main** (no usamos branches por velocidad — proyecto en early stage)
4. **Deploy**: `vercel deploy --prod --yes` (desde raíz del repo)
5. **Si hay SQL nuevo**: copiar al portapapeles con PowerShell `Get-Content ... | Set-Clipboard`, decir al usuario "pégalo en Supabase Studio → Run"

**Convenciones**:
- Iconos: usar componente `<Icon name="..." size={N} />` (set inline SVG, sin emojis en chrome)
- Permisos: `requireUser()`, `requireAdminLike()`, o check específico de rol en server actions
- Server actions con tipo `Promise<{ ok: true; ... } | { ok: false; error: string }>`
- Push fire-and-forget: `void sendPush(...).catch(console.error)` para no bloquear la response
- IDs UUIDs no se generan en cliente, siempre `default gen_random_uuid()` en DB
- Bumpear SW si cambias el handler `push` o el cache

---

## Próximos pasos / TODO

### Inmediato (lo que sigue ahora mismo)
- **Módulo de Facturación + Cotizaciones** (nuevo rol FACTURACION, catálogo de productos, cotizaciones con plantilla "MHS Integradora by VORTEX", solicitudes de compra con push a supervisor)

### Sugeridos en algún punto
- **OCR del ST-7 con Claude Vision** — extraer folio, NSS, diagnóstico de la foto que sube el supervisor
- **Reporte consolidado quincenal** — un solo PDF con todas las sedes, índice, totales agregados
- **Aguinaldo / vacaciones / antigüedad** — calculadora legal LFT (aplica para diciembre)
- **Geolocalización al capturar** — validar que el supervisor está físicamente en la sede
- **Bulk import xlsx de empleados** — alta masiva
- **Auditoría completa (audit_log)** — para defensa legal
- **Búsqueda global Ctrl+K** — Spotlight de Vortex
- **Cache mejorado en SW** para que offline no de 404 al navegar dynamic routes (precarga rutas críticas)
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
5. Si bumpas el SW, mover CACHE_VERSION a v6 (último: v5).
6. Si agregas push event, registralo en `lib/sounds.ts` también para el sonido custom.
7. Si creas nueva ruta `/algo`, verifica que esté incluida en `adminOnly` Set del dashboard si aplica.
8. **Nunca** uses `notFound()` ciegamente; muestra mensaje útil al usuario.
9. **Commit messages** con `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` al final.

---

## Contactos / contexto humano

- **Edy (tú)**: SOPORTE/IT. Diseña, integra, dice qué falta. Pragmático, valora velocidad de iteración.
- **Brenda**: SUPERADMIN, finanzas/facturación. Necesita reportes claros y exportables.
- **Diego Orlando**: SUPERADMIN, facturación.
- **Alejandra**: SUPERADMIN, facturación.
- **Iván (supervisor estrella)**: tiene 16 asignaciones, ~203 empleados visibles. Si rompe, hay que checar RLS multi-sede.
- **Alex**: supervisor 3 sedes MAT (SHO, SLE2, SJS).

**Cultura del proyecto**:
- Velocidad sobre perfección
- Push de cada cambio que pase typecheck
- Migraciones SQL siempre idempotentes (`if not exists`, `create or replace`, `drop if exists`)
- Mensajes en español para usuarios finales, código y commits en español+inglés mezclado
- Tono cercano sin perder rigor técnico

---

**¡Bienvenido al proyecto, futuro Claude!** Si algo no está claro acá, búscalo en el historial de git: cada commit tiene un mensaje explicando el porqué. Y este archivo se actualiza conforme avanza el proyecto.
