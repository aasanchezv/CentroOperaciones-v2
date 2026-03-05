# AGENTS.md — Centro de Operaciones Murguía

Este archivo define las reglas operativas para todos los agentes que trabajan en este repositorio.
**Leer antes de escribir una sola línea de código.**

---

## Roles de los agentes

### Claude (Arquitecto / QA)
- Define estándares y convenciones
- Diseña schemas de DB y revisa migraciones
- Revisa PRs antes de aprobarlos
- Decide cuándo una decisión técnica nueva merece un ADR en `docs/DECISIONS.md`
- No ejecuta comandos destructivos sin confirmación explícita del usuario

### Codex (Ejecutor)
- Implementa features según las instrucciones de Claude
- Corre tests y builds antes de cada PR
- Abre PRs con descripción clara de qué cambia y por qué
- Si hay ambigüedad, pregunta antes de implementar

---

## Stack

| Capa | Tecnología |
|------|------------|
| Framework | Next.js 14+ (App Router) |
| Lenguaje | TypeScript (strict mode) |
| Estilos | Tailwind CSS v4 |
| Componentes UI | shadcn/ui |
| Base de datos | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Despliegue | Vercel |
| Package manager | pnpm |

---

## Reglas de código

### TypeScript
- **Siempre strict mode.** No `any`, nunca. Usar `unknown` + type guards si es necesario.
- Tipos de DB: usar los tipos de `src/types/database.types.ts`. Regenerar con CLI de Supabase al cambiar el schema.
- Imports: usar alias `@/*` (ej. `import { createClient } from '@/lib/supabase/client'`).

### Componentes
- Componentes de `shadcn/ui` viven en `src/components/ui/` (auto-generados, no editar manualmente).
- Componentes propios reutilizables van en `src/components/shared/`.
- Componentes específicos de una página van en la carpeta de esa página.

### Base de datos
- **Toda tabla nueva debe tener RLS habilitado + política(s) antes de hacer PR.** Sin excepciones.
- Toda migración va en `supabase/migrations/` con nombre `NNN_descripcion.sql` (ej. `002_accounts.sql`).
- Nunca modificar migraciones ya aplicadas. Crear una nueva migración para cambios.

### Auditoría
- **Toda acción que modifica datos debe insertar un `audit_event`.**
- Hacerlo desde el servidor (Server Action o Route Handler), nunca desde el cliente.
- Formato de `action`: `entidad.verbo` en inglés (ej. `user.invited`, `account.created`, `role.changed`).

### Seguridad
- Variables de entorno secretas (`SUPABASE_SERVICE_ROLE_KEY`) solo en el servidor. Nunca en componentes cliente.
- `service_role` solo para operaciones de admin (invitaciones, operaciones privilegiadas).
- Validar rol del usuario en cada Route Handler y Server Action protegida.

### Git y PRs
- Commits en inglés, formato convencional: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
- Cada PR debe incluir: qué cambia, por qué, cómo probar.
- No hacer commit de `.env.local`. El archivo `.env.example` sí va al repo.

---

## Estructura de carpetas

```
src/
├── app/
│   ├── (auth)/          ← rutas públicas: login, invite
│   └── (app)/           ← rutas protegidas (requieren sesión)
│       └── admin/       ← solo rol 'admin'
├── components/
│   ├── ui/              ← shadcn/ui (no editar manualmente)
│   └── shared/          ← componentes propios reutilizables
├── lib/
│   └── supabase/
│       ├── client.ts    ← cliente browser
│       └── server.ts    ← cliente server-side
├── types/
│   └── database.types.ts
└── middleware.ts         ← protección de rutas
```

---

## Comandos útiles

```bash
# Desarrollo local
pnpm dev

# Build de producción (correr antes de cada PR)
pnpm build

# Agregar componente de shadcn
pnpm dlx shadcn@latest add <nombre-componente>

# Regenerar tipos de Supabase (después de cada migración)
pnpm dlx supabase gen types typescript --project-id <PROJECT_ID> > src/types/database.types.ts
```

---

## Orden de construcción

1. **Admin Console** (primer módulo): `/admin/users`, `/admin/teams`, `/admin/roles`
2. **Módulo Clientes**: Accounts + Contacts
3. **Módulos adicionales**: según prioridad operativa

---

Ver decisiones técnicas detalladas en [docs/DECISIONS.md](./docs/DECISIONS.md).
