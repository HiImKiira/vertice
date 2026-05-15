<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/logo-full-dark.svg">
    <img src="brand/logo-full-light.svg" alt="Vértice" width="520">
  </picture>
</p>

<p align="center">
  <strong>Sistema premium de asistencia, operación y datos para RH multi-sede.</strong><br>
  Una sola plataforma para captura diaria, incidencias, nómina quincenal y monitoreo en vivo.
</p>

<p align="center">
  <a href="#stack"><img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-0A0E1A?style=flat-square&logo=next.js"></a>
  <a href="#stack"><img alt="Expo" src="https://img.shields.io/badge/Expo-SDK%2052-0A0E1A?style=flat-square&logo=expo"></a>
  <a href="#stack"><img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres-0A0E1A?style=flat-square&logo=supabase"></a>
  <a href="#stack"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.6-0A0E1A?style=flat-square&logo=typescript"></a>
  <a href="./LICENSE"><img alt="License MIT" src="https://img.shields.io/badge/License-MIT-C9A961?style=flat-square"></a>
</p>

---

## ¿Qué es Vértice?

Vértice reemplaza hojas de cálculo dispersas, llamadas y WhatsApps por **un único sistema operativo de RH** que captura asistencia en tiempo real desde cualquier sede, registra incidencias formales, gestiona turnos eventuales y libera nómina quincenal con cálculo automático.

**Diseñado para cuatro roles:**

| Rol | Para quién | Misión |
|-----|-----------|--------|
| `USER` · Supervisor | Encargados de sede | Captura diaria, incidencias, soporte |
| `ADMIN` · RH | Equipo de Recursos Humanos | Nómina, gestión de personal, respuesta a tickets |
| `CEO` · Dirección | Dueños / dirección general | Dashboard ejecutivo, monitor en vivo |
| `SUPERADMIN` | Operación técnica | Control de períodos, configuración, IA |

Ver [`docs/SISTEMA.md`](docs/SISTEMA.md) para el detalle completo de módulos por rol.

## Stack

```
┌───────────────────────────────────────────────────────────────┐
│  apps/web         Next.js 15 · App Router · Tailwind · SSR    │
│  apps/mobile      Expo SDK 52 · React Native · expo-router    │
│  packages/shared  Tipos · códigos · reglas de negocio (TS)    │
│  supabase/        Postgres · RLS · migraciones · auth · realtime │
└───────────────────────────────────────────────────────────────┘
```

- **Frontend web**: Next.js 15 con App Router, Server Components, Tailwind, `shadcn/ui` (a montar).
- **Mobile**: Expo SDK 52, React Native 0.76 con New Architecture, `expo-router` para navegación tipada, `expo-secure-store` para tokens.
- **Backend**: Supabase (Postgres 15) con autenticación, Row Level Security, Realtime para el monitor en vivo y Storage para fotos de credencial.
- **Shared**: paquete `@vertice/shared` con códigos de asistencia, tipos, roles y reglas que compilan en ambos clientes.

## Estructura del repo

```
vertice/
├── apps/
│   ├── web/          Next.js 15 — paneles supervisor, RH, CEO, superadmin
│   └── mobile/       Expo — app supervisor en piso + CEO en movimiento
├── packages/
│   └── shared/       Tipos y reglas reutilizables (códigos, roles)
├── supabase/
│   ├── config.toml   Config local del CLI de Supabase
│   ├── migrations/   Migraciones SQL versionadas
│   └── seed.sql      Sedes y período de nómina de arranque
├── brand/            Logo, favicon, guía visual
└── docs/             Documentación funcional del sistema
```

## Quick start

### Requisitos

- Node.js **20+** (`nvm use` toma `.nvmrc`)
- pnpm **9+** (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- Supabase CLI (`brew install supabase/tap/supabase` o `scoop install supabase`)
- Para móvil: Xcode (iOS) o Android Studio (Android) o solo la app **Expo Go** en tu teléfono.

### 1. Instalar dependencias

```bash
pnpm install
```

### 2. Levantar Supabase local

```bash
pnpm supabase:start          # arranca Postgres + Studio en localhost:54321/54323
pnpm supabase:reset          # aplica migraciones + seed
pnpm supabase:gen-types      # genera tipos TS desde el esquema
```

Studio queda en <http://localhost:54323>. Copia `URL` y `anon key` que imprime el CLI a `.env.local` de cada app:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env.local
# editar ambos con los valores que dio supabase start
```

### 3. Levantar la app web

```bash
pnpm dev:web
# → http://localhost:3000
```

### 4. Levantar la app móvil

```bash
pnpm dev:mobile
# escanea el QR con la app Expo Go o presiona `i` / `a`
```

## Códigos de asistencia

Los códigos viven en [`packages/shared/src/codes.ts`](packages/shared/src/codes.ts) como única fuente de verdad. Resumen:

| Código | Nombre | Día laborado | Prima dominical | Notas |
|--------|--------|:---:|:---:|-------|
| `A`   | Asistencia        | ✅ | ✅ | Normal |
| `AF`  | Asistencia forzada| ✅ | ✅ | Capturada por admin |
| `DS`  | Descanso pagado   | ✅ | ❌ | Día de descanso programado |
| `DT`  | Doble turno       | ✅ | ✅ | Suma turno extra |
| `INH` | Inhábil           | ✅ | ❌ | Día inhábil oficial |
| `FER` | Feriado           | ✅ | ❌ | Feriado de calendario |
| `PCG` | Permiso c/goce    | ✅ | ❌ | Pagado |
| `PSG` | Permiso s/goce    | ❌ | ❌ | No paga |
| `I`   | Incapacidad       | ❌ | ❌ | Médica |
| `F`   | Falta             | ❌ | ❌ | Descuento $393.80 |
| `SN`  | Sin marcar        | ❌ | ❌ | Pendiente de captura |

Regla de prima dominical: solo `A`, `AF`, `DT` la generan; `DS` en domingo = descanso programado sin prima.

## Scripts

| Comando | Qué hace |
|---------|----------|
| `pnpm dev:web` | Next.js dev server con Turbopack |
| `pnpm dev:mobile` | Expo dev server |
| `pnpm build:web` | Build de producción de la web |
| `pnpm typecheck` | TypeScript en todos los workspaces en paralelo |
| `pnpm supabase:start` | Postgres + Studio + Inbucket locales |
| `pnpm supabase:reset` | Resetea DB local y reaplica migraciones + seed |
| `pnpm supabase:gen-types` | Regenera `packages/shared/src/database.types.ts` |

## Roadmap

- [x] Scaffold del monorepo + marca + esquema base + RLS
- [ ] Pase de lista (web) — captura por sede/jornada con ventana de gracia
- [ ] Incidencias formales — calendario visual + adjuntos
- [ ] CDTs (turnos eventuales) — UI de creación/cancelación
- [ ] Inbox de tickets de soporte con realtime
- [ ] Exportación quincenal a hoja de cálculo (XLSX) + PDF operativo
- [ ] Dashboard ejecutivo (CEO) — métricas, mapa de calor, monitor en vivo
- [ ] App móvil supervisor — pase de lista optimizado, bootstrap de un request
- [ ] App móvil CEO — dashboard adaptado y calendario individual
- [ ] Análisis con IA — foto de credencial → datos del empleado (Claude Vision)
- [ ] Geocodificación inversa para validar sede

## Marca

Ver [`brand/README.md`](brand/README.md) para paleta, tipografía y reglas de uso del logo.

## Licencia

[MIT](./LICENSE) — © 2026 HiImKiira.
