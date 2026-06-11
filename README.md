<h1 align="center">Vortex</h1>

<p align="center">
  <strong>Sistema de asistencia + RH multi-sede + facturación + contratos</strong><br>
  para MHS Integradora (servicios de limpieza y seguridad, Yucatán, México)
</p>

<p align="center">
  <a href="https://vertice-rosy.vercel.app">vertice-rosy.vercel.app</a> ·
  Next.js 15 · Supabase · Vercel · PWA con push y modo offline
</p>

---

Vortex reemplaza un Google Sheet + Apps Script legacy de ~6,000 líneas. Está en producción usado a diario por ~15 supervisores de campo, RH y facturación. Este README también sirve como **plantilla de arquitectura**: las decisiones y patrones aquí descritos son reaprovechables para construir un SaaS interno similar (bajo costo, sin infra que mantener, una sola persona puede operarlo).

## TL;DR — por qué este stack

| Necesidad | Solución | Por qué |
|---|---|---|
| Web app rápida y con SSR | **Next.js 15 (App Router)** | Server Components + Server Actions, sin API REST boilerplate |
| BD + Auth + Storage + Cron | **Supabase** | Una sola plataforma. Postgres real, RLS nativo, `pg_cron`, buckets |
| Hosting | **Vercel** | Deploy en 30–90 s, gratis para empezar, edge runtime |
| Notificaciones push | **VAPID + Web Push nativo** | Sin Firebase/OneSignal. Gratis, control total |
| Cron jobs | **pg_cron + pg_net** | Sin servidor de jobs aparte; viven en Postgres |
| Offline | **IndexedDB nativo + Service Worker** | Sin Workbox. Captura sin red, sincroniza al volver |
| PDFs | **@react-pdf/renderer** | Render server-side, sin headless browser |
| Excel | **exceljs** | Lectura/escritura .xlsx con estilos y fórmulas |
| Contratos Word | **docxtemplater + pizzip** | Llena plantillas .docx reales, fidelidad 100% |

**Costo operativo: ~$0/mes** en tiers gratuitos (Vercel Hobby + Supabase Free). Escala a ~$25/mes con planes Pro.

## Stack detallado

- **Frontend**: Next.js 15.x App Router · React 19 (`useTransition` para pending) · TypeScript con `exactOptionalPropertyTypes: true` · Tailwind CSS con utilidades custom (paleta navy/blue/gold) · fonts Syne (display) + DM Sans (body)
- **Backend**: Supabase Postgres con RLS en todas las tablas · `pg_cron` + `pg_net` para crons · `web-push` para notificaciones
- **Generación de documentos**: `@react-pdf/renderer` (PDF) · `exceljs` (xlsx) · `docxtemplater` + `pizzip` (Word) · `iconv-lite` (reparación de encoding)
- **Deploy**: Vercel (`vertice-rosy.vercel.app`) · Service Worker propio en `/sw.js` · manifest PWA instalable

## Arquitectura — decisiones clave

### 1. Server Components + Server Actions, no API REST
Las páginas son async Server Components que consultan Supabase directo. Las mutaciones son **Server Actions** tipadas con `Promise<{ ok: true; … } | { ok: false; error: string }>`. Solo se usa `/api/*` para lo que es genuinamente un endpoint (descargas binarias de PDF/xlsx/docx, crons, ping de red).

### 2. RLS desde el día 1
Toda tabla tiene Row Level Security. Las funciones SQL que necesitan leer tablas restringidas son `SECURITY DEFINER`. El cliente del navegador usa la `anon key` (sujeta a RLS); el servidor usa `service_role` solo cuando necesita bypass (escrituras masivas, operaciones admin).

### 3. SQL versionado e idempotente
Cada cambio de schema es **un archivo nuevo** `vN_descripcion.sql` en `supabase/migrations/` (28 a la fecha). Nunca se edita una migración aplicada. Todas son idempotentes (`if not exists`, `create or replace`, `drop … if exists`) y terminan con `notify pgrst, 'reload schema';`. Se aplican con paste-and-run en Supabase Studio.

### 4. PWA real, no maquillaje
- **Push**: VAPID propio. El SW recibe el evento `push`, muestra la notificación y hace broadcast a las pestañas abiertas para reproducir un sonido custom (Web Audio API, sin descargas).
- **Offline**: el pase de lista guarda en IndexedDB si no hay red y sincroniza al volver. El detector de red hace **ping real** al servidor (`/api/ping`), no confía en `navigator.onLine` (que miente en móviles 4G).
- **SW minimalista**: desde v9 el Service Worker **NO cachea navegación ni chunks JS** (eso causaba `ChunkLoadError` tras cada deploy). Solo maneja push. Next.js sirve `/_next/static` con cache HTTP inmutable.

### 5. Snapshots para datos que cambian en el tiempo
La nómina usa un snapshot histórico de sede por fecha (`sede_efectiva`): si un empleado se cambia de sede a mitad de quincena, aparece en cada sede con los días que le corresponden, no solo en la actual.

## Estructura del repo

```
vortex/
├── apps/
│   └── web/                          # Next.js 15 (la app)
│       ├── src/
│       │   ├── app/                  # Rutas (App Router)
│       │   │   ├── api/              # Endpoints: pdf, xlsx, docx, cron, ping
│       │   │   ├── pase-lista/       # Captura diaria de asistencia
│       │   │   ├── rh-pro/           # Hub de RH (alta, contratos, supervisores…)
│       │   │   ├── facturacion/      # Cotizaciones, productos, compras, bancos
│       │   │   ├── incapacidades/    # Flujo IMSS
│       │   │   ├── incidencias/      # Códigos formales del mes
│       │   │   ├── live/             # Dashboard ejecutivo en vivo
│       │   │   ├── soporte/          # Tickets RH ↔ supervisor
│       │   │   └── sonidos/          # Preferencias de sonido push
│       │   ├── components/           # Topbar, Icon, OfflineBadge, PushControls…
│       │   └── lib/                  # Supabase clients, push, pdf/, xlsx/, gates
│       └── public/                   # sw.js, manifest.webmanifest, icons, reset-sw.html
├── packages/
│   └── shared/                       # Códigos de asistencia + cálculo de nómina
├── supabase/migrations/              # SQL versionado v1..v28
├── scripts/                          # Node .mjs: imports, sync, fixes, helpers
└── CLAUDE.md                         # Snapshot de contexto para sesiones de IA
```

**Monorepo pnpm workspaces**: `apps/web` (app), `apps/mobile` (Expo, futuro), `packages/shared` (lógica compartida).

## Módulos (qué hace cada uno)

| Ruta | Módulo | Resumen |
|---|---|---|
| `/pase-lista` | Captura de asistencia | Por sede × jornada, con modo offline IndexedDB, auto-DS por día de descanso |
| `/rh-pro` | Hub de RH | Alta/baja, contratos (PDF Vortex + Word fiel), supervisores (CRUD), cambio de sede/descanso, import masivo xlsx, datos bancarios |
| `/facturacion` | Comercial | Cotizaciones (PDF "MHS by Vortex"), productos, clientes, solicitudes de compra, export bancario SPEI |
| `/incapacidades` | Flujo IMSS | 4 tipos, workflow de 9 estados, upload de ST-7/ST-2, push en cada transición |
| `/incidencias` | Incidencias | Calendario de códigos formales del mes |
| `/live` | Dashboard CEO | Auto-refresh 30s, KPIs, alertas, cobertura por supervisor |
| `/soporte` | Tickets | RH ↔ supervisor (RH anonimizado como "Recursos Humanos"), push integrado |
| `/reportes` | Exportes | Nómina y asistencias en PDF + Excel, con snapshot histórico de sede |

### Sistema de códigos de asistencia
En `packages/shared/src/codes.ts`. Cada código declara `dia_laborado`, `genera_prima_dominical`, `descuento`, `diasExtra` (días extra de salario) y `color`. El cálculo de nómina (`calcularNominaPeriodo`) es la única fuente de verdad. Ejemplos:
- `A` asistencia (1×) · `DS` descanso semanal (1×, no trabajó) · `DL` descanso laborado (**3×**, trabajó su descanso) · `DT` doble turno (2×) · `F` falta (descuento)

### Roles
`USER` (supervisor de campo) · `ADMIN` (RH) · `SUPERADMIN` · `CEO` · `SOPORTE` (IT) · `FACTURACION` (exclusivo del módulo de facturación, redirige ahí al entrar). El flag `acceso_facturacion` da acceso al módulo sin cambiar el rol base (para supervisores que ven compras).

### Contratos
Dos salidas desde la misma data: **PDF con branding Vortex** (`@react-pdf/renderer`, bloques tipados extraídos del DOCX oficial) y **Word fiel** (`docxtemplater` sobre las plantillas `.docx` reales HOMBRE/MUJER). Folio por sede `MHS/<ABREV><NNN>/<año>`.

## Patrones de código (la parte reaprovechable)

**Página RH típica** (Server Component):
```tsx
export default async function MiPagina() {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);                 // gate de permiso → redirect
  const supabase = await createSupabaseServerClient();
  const [{ data: a }, { data: b }] = await Promise.all([ /* queries */ ]);
  return <main><Topbar user={profile} /> … <MiFormCliente datos={a} /></main>;
}
```

**Server Action típica**:
```ts
"use server";
export async function miAccion(input: {/* … */}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdminLike();
  if (!auth.sb) return { ok: false, error: auth.error ?? "Sin permisos" };
  // … validar, mutar con supabaseAdmin() si requiere bypass RLS
  void sendPush(payload, userIds, "evento").catch(console.error);  // fire-and-forget
  revalidatePath("/ruta");
  return { ok: true };
}
```

**Convenciones**:
- Constantes/objetos **nunca** se exportan desde un archivo `"use server"` (Next.js solo permite funciones async ahí) — van en un `constants.ts` aparte.
- Iconos: componente `<Icon name="…" size={N} />` (SVG inline, sin emojis en el chrome).
- Push: `void sendPush(...).catch(...)` para no bloquear la respuesta.
- IDs UUID se generan en la BD (`default gen_random_uuid()`), nunca en cliente.
- Bumpear `CACHE_VERSION` del SW al tocar el handler `push`.

## Setup local

**Requisitos**: Node 20+, pnpm, una cuenta de Supabase y otra de Vercel.

```bash
git clone https://github.com/HiImKiira/vertice.git
cd vertice
pnpm install
```

Crea `apps/web/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...        # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:hr@tu-dominio.com
CRON_SECRET=...                         # protege los endpoints /api/cron/*
```

Aplica las migraciones SQL (en orden) en Supabase Studio → SQL Editor, luego:
```bash
pnpm --filter @vertice/web dev          # http://localhost:3000
```

## Comandos

```bash
pnpm --filter @vertice/web typecheck    # TypeScript estricto (correr antes de commit)
pnpm --filter @vertice/web build        # build de producción
vercel deploy --prod --yes              # deploy (desde la raíz del repo)

# Scripts de mantenimiento (Node)
node scripts/create-user.mjs <email> <pass> <rol> <nombre> [username]
node scripts/import-clabe-rfc.mjs <ruta.xlsx> [--dry-run]   # match por nombre normalizado
node scripts/fix-mojibake-contratos.mjs [--apply]           # repara encoding heredado
```

## Workflow de desarrollo

1. Cambio en código → `pnpm typecheck` pasa.
2. Commit semántico (`feat:`, `fix:`, `chore:`) con footer `Co-Authored-By:`.
3. Push a `main` (sin branches — proyecto en iteración rápida).
4. `vercel deploy --prod --yes`.
5. Si hay SQL nuevo: copiar al portapapeles y pegar en Supabase Studio.

## Lecciones aprendidas (gotchas)

1. `ALTER TYPE … ADD VALUE` no puede ir en una transacción con usos del nuevo valor — correr solo.
2. PostgreSQL no permite cambiar el return type con `OR REPLACE` — usar `DROP FUNCTION` primero.
3. `exactOptionalPropertyTypes: true`: declarar `campo?: T | undefined`, no solo `campo?: T`.
4. `navigator.onLine` miente en 4G/5G — verificar con ping real al servidor.
5. Un `"use server"` solo exporta funciones async; exportar consts rompe en runtime (`c.map is not a function`).
6. El SW no debe cachear `/_next/` cache-first — causa `ChunkLoadError` tras cada deploy.
7. iOS push solo funciona con la PWA instalada como standalone; `Notification.requestPermission()` debe llamarse síncronamente desde un user gesture.
8. Imports legacy pueden traer mojibake (UTF-8 leído como CP850) — reparable con `iconv-lite`.

## Documentación adicional

- **`CLAUDE.md`** — snapshot completo de contexto para retomar el proyecto en una sesión nueva (módulos, migraciones, cuentas, decisiones). Léelo antes de tocar código.

---

<p align="center">
  Construido con <a href="https://claude.com/claude-code">Claude Code</a> · MHS Integradora © 2026
</p>
