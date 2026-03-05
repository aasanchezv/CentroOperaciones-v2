# CLAUDE.md — Centro de Operaciones Murguía

Este archivo es leído automáticamente por Claude Code al inicio de cada sesión.
Contiene todo lo necesario para operar el proyecto de forma autónoma.

---

## Proyecto

**Nombre:** Centro de Operaciones Murguía
**Tipo:** Sistema de operaciones para bróker de seguros (single-tenant, interno)
**Stack:** Next.js 16 · TypeScript · Tailwind v4 · shadcn/ui · Supabase · Vercel
**Repo local:** `/Users/carlosmireles/Desktop/MC2/murguia-ops`

---

## Entorno — Configuración crítica

### pnpm (package manager)
pnpm NO está en el PATH del sistema. Usar siempre uno de estos métodos:

```bash
# Opción A: exportar PATH al inicio del comando
export PATH="$HOME/bin:$HOME/Library/pnpm:$PATH" && pnpm <comando>

# Opción B: usar el binario directamente
PNPM="/Users/carlosmireles/Library/pnpm/.tools/pnpm-exe/10.30.0/pnpm"
"$PNPM" <comando>
```

### CLIs instalados en ~/bin
```bash
export PATH="$HOME/bin:$HOME/Library/pnpm:$PATH"
gh --version        # GitHub CLI 2.87.0
supabase --version  # Supabase CLI 2.75.0
pnpm --version      # 10.30.0
```

### Next.js 16 — diferencias importantes
- El archivo de middleware se llama `src/proxy.ts` (antes era `middleware.ts`)
- La función debe exportarse como `export async function proxy(...)`, NO `middleware`
- El `export const config` con el `matcher` sigue igual

---

## Comandos de uso frecuente

```bash
# Prefijo necesario para todos los comandos del proyecto:
export PATH="$HOME/bin:$HOME/Library/pnpm:$PATH"
cd /Users/carlosmireles/Desktop/MC2/murguia-ops

# Desarrollo
pnpm dev                    # servidor local en localhost:3000

# Build (correr antes de cada PR)
pnpm build

# Agregar componente shadcn
pnpm dlx shadcn@latest add <nombre>

# Regenerar tipos de Supabase (después de migraciones)
supabase gen types typescript --project-id <PROJECT_ID> > src/types/database.types.ts

# GitHub — crear PR
gh pr create --title "..." --body "..."

# GitHub — ver PRs
gh pr list

# GitHub — ver status del repo
gh repo view
```

---

## Flujo de trabajo

### Para cada nueva feature:
1. Crear rama: `git checkout -b feat/nombre-feature`
2. Implementar (ver reglas en AGENTS.md)
3. Correr `pnpm build` — debe pasar sin errores
4. Commit: `git commit -m "feat: descripción"`
5. Push: `git push -u origin feat/nombre-feature`
6. PR: `gh pr create ...`

### Para migraciones de DB:
1. Crear archivo `supabase/migrations/NNN_descripcion.sql`
2. Correr en Supabase Dashboard → SQL Editor
3. Regenerar tipos TypeScript (comando arriba)
4. Commitear el archivo de migración

### Para agregar componentes UI:
```bash
export PATH="$HOME/bin:$HOME/Library/pnpm:$PATH"
pnpm dlx shadcn@latest add button card table dialog form input
```

---

## Estructura del proyecto

```
src/
├── app/
│   ├── (auth)/          ← login, invite (rutas públicas)
│   └── (app)/           ← rutas protegidas
│       └── admin/       ← solo rol 'admin'
│           ├── users/
│           ├── teams/
│           └── roles/
├── components/
│   ├── ui/              ← shadcn (no editar)
│   └── shared/          ← componentes propios
├── lib/supabase/
│   ├── client.ts        ← browser client
│   └── server.ts        ← SSR client
├── types/
│   └── database.types.ts
└── proxy.ts             ← protección de rutas (era middleware.ts)
docs/
├── DECISIONS.md         ← ADRs del proyecto
└── AGENTS.md            ← convenciones de código
supabase/
└── migrations/          ← SQL versionado
```

---

## Reglas no negociables

1. **RLS en toda tabla nueva** — sin excepción
2. **`audit_event` en toda acción que modifica datos** — desde el servidor
3. **No `any` en TypeScript** — usar `unknown` + type guards
4. **`pnpm build` debe pasar** antes de hacer PR
5. **Commits en inglés**, formato: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`
6. **Migraciones nunca se editan** — siempre crear una nueva

---

## Estado del proyecto

- [x] Setup inicial (Next.js 16, Supabase, shadcn, pnpm)
- [x] Schema SQL: teams, profiles, audit_events con RLS
- [x] proxy.ts (protección de rutas)
- [x] Tipos TypeScript base
- [x] AGENTS.md + DECISIONS.md
- [x] Repo en GitHub: https://github.com/cmireles-a11y/mc2core (gh autenticado)
- [x] .env.local configurado con claves de Supabase
- [x] Migration 001 — tablas: profiles, teams, audit_events + RLS + triggers
- [x] Vercel: https://mc2core.vercel.app
- [x] Supabase Auth URL: Site URL + Redirect URL configurados
- [x] Admin Console v1: login + sidebar + lista de usuarios
- [x] Admin Console v2 (PR #2 mergeado): invite dialog, role actions, teams page, dashboard stats
- [x] Módulo Cuentas + Contactos (PR #3): /accounts, /accounts/[id], /contacts
- [x] Polish sprint (PR #4): editar cuenta, búsqueda, asignar equipo, dashboard activity feed
- [x] Pólizas + dos vistas (PR #5): policies por cuenta con ramo/tomador, tabs Corporativas/Individuales
- [x] Importación masiva Excel (PR #6): /admin/imports con SheetJS, preview + validación
- [x] Módulo Renovaciones (PR #7 — pendiente merge): pipeline configurable, email Resend + WhatsApp Kapso

## TODO — Go-live checklist
- [ ] **Email institucional**: verificar `murguia.com` en Resend Dashboard → Domains, luego cambiar
  `EMAIL_FROM` en `src/lib/resend.ts` de `onboarding@resend.dev` a `renovaciones@murguia.com`
- [ ] Webhook Kapso ya configurado: `https://mc2core.vercel.app/api/webhooks/kapso`

---

## Sprint actual

PR #7 feat/renovaciones abierto — pendiente de: (1) merge PR #6, (2) correr migration 004, (3) merge PR #7

**Migrations aplicadas:** 001 · 002 · 003
**Migration pendiente:** 004 (feat/renovaciones — renewals, renewal_stages, renewal_events, tasks)

**Siguientes módulos por diseñar (plan mode antes de código):**
- Cobranza
- Siniestros
- Pendientes Aseguradora
- Mis tareas
- Mi dashboard (ejecutivo)

---

## Metodología — Ahorro de tokens

**El objetivo es que Claude nunca tenga que re-descubrir contexto ya conocido.**

### Reglas para Claude:
1. **Leer CLAUDE.md al iniciar sesión** — no hacer preguntas que ya están respondidas aquí
2. **Usar Grep/Glob antes de Read** — buscar símbolo específico antes de leer el archivo completo
3. **No leer archivos de shadcn/ui** (`src/components/ui/*`) — son auto-generados y estables
4. **No leer archivos ya documentados aquí** sin una razón específica (e.g. si va a editarlos)
5. **Actualizar "Sprint actual" y "Estado del proyecto"** al final de cada sesión (no al inicio)
6. **Un PR por sprint** — scope acotado, build limpio, merge antes de empezar el siguiente
7. **Migraciones SQL primero** — si el sprint requiere DB, crear y documentar la migration antes de escribir código UI

### Reglas para el usuario:
- Usar `/compact` cuando la sesión se vuelve larga (Claude lo hará también si detecta contexto alto)
- Si Claude pregunta algo que ya está en CLAUDE.md, señalarlo: "está en CLAUDE.md"
- Al pedir features nuevas, especificar: nombre de la ruta, qué datos muestra, qué acciones tiene

---

Ver reglas completas en [AGENTS.md](./AGENTS.md) y decisiones técnicas en [docs/DECISIONS.md](./docs/DECISIONS.md).
