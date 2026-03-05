# Architectural Decision Records — Centro de Operaciones Murguía

Registro de decisiones técnicas y de producto tomadas para este sistema. Cada decisión incluye el contexto, la opción elegida y el motivo.

---

## ADR-001 · Plataforma de despliegue: Vercel

**Estado:** Aceptada
**Fecha:** 2026-02

**Contexto:** Necesitamos desplegar una app web con previews por PR para revisar cambios antes de publicar.

**Decisión:** Vercel.

**Motivo:** Integración nativa con Next.js, preview automático por PR, zero-config para este stack, CDN global incluido.

---

## ADR-002 · Framework: Next.js (App Router)

**Estado:** Aceptada
**Fecha:** 2026-02

**Contexto:** Necesitamos frontend + backend en un solo proyecto para movernos rápido.

**Decisión:** Next.js 14+ con App Router (directorio `src/app/`).

**Motivo:** Full-stack en un repo, Server Components reducen JS en el cliente, integración perfecta con Vercel.

**Consecuencias:** No usar Pages Router. Toda lógica de servidor va en Server Components o Route Handlers.

---

## ADR-003 · Base de datos y autenticación: Supabase

**Estado:** Aceptada
**Fecha:** 2026-02

**Contexto:** Necesitamos DB PostgreSQL con auth lista y RLS para controlar acceso por fila.

**Decisión:** Supabase (PostgreSQL + Auth + Storage).

**Motivo:** RLS nativo, auth con email/password lista en minutos, SDK oficial para Next.js, generación de tipos TypeScript.

---

## ADR-004 · Auth v1: Email + Password

**Estado:** Aceptada
**Fecha:** 2026-02

**Contexto:** Queremos movernos rápido en la primera versión.

**Decisión:** Email + password como método de autenticación inicial.

**Decisión futura:** Migrar a Microsoft SSO (Entra ID / Azure AD) cuando la operación lo requiera. Supabase lo soporta sin cambiar el resto del sistema.

---

## ADR-005 · Alta de usuarios: Invite-only

**Estado:** Aceptada
**Fecha:** 2026-02

**Contexto:** El sistema es interno. No queremos registro público.

**Decisión:** Alta solo por invitación por email. Solo Admin puede invitar usuarios.

**Implementación:** Supabase `auth.admin.inviteUserByEmail()` desde una API Route protegida por rol Admin.

---

## ADR-006 · Seguridad: Row Level Security (RLS) desde el inicio

**Estado:** Aceptada
**Fecha:** 2026-02

**Contexto:** Los datos son sensibles (clientes de seguros). Necesitamos control de acceso a nivel de fila.

**Decisión:** RLS habilitado en todas las tablas desde el inicio. Ninguna tabla queda sin políticas.

**Regla:** Toda tabla nueva debe tener RLS habilitado + al menos una política antes de hacer cualquier PR.

---

## ADR-007 · Modelo de roles: 5 roles base

**Estado:** Aceptada
**Fecha:** 2026-02

**Decisión:** 5 roles: `admin`, `ops`, `manager`, `agent`, `readonly`.

| Rol | Acceso |
|-----|--------|
| admin | Todo el sistema, usuarios, roles, equipos |
| ops | Operaciones generales, todos los registros |
| manager | Ve su equipo completo |
| agent | Solo ve lo que tiene asignado |
| readonly | Solo lectura, sin acciones |

---

## ADR-008 · Modelo de acceso: basado en Equipos (Teams)

**Estado:** Aceptada
**Fecha:** 2026-02

**Decisión:** Los permisos de visibilidad se derivan del equipo al que pertenece el usuario, no de ACLs individuales.

**Motivo:** Más fácil de administrar. Cambiar el equipo de una persona cambia automáticamente lo que ve.

---

## ADR-009 · Tenancy: Single-tenant

**Estado:** Aceptada
**Fecha:** 2026-02

**Contexto:** Un solo cliente (el bróker) por ~2 años.

**Decisión:** Single-tenant. No se implementa lógica multi-tenant ahora.

**Nota:** Si en el futuro se necesita multi-tenant, se agrega columna `tenant_id` en las tablas principales. El schema actual lo permite sin breaking changes.

---

## ADR-010 · Admin Console: dentro de la misma app

**Estado:** Aceptada
**Fecha:** 2026-02

**Decisión:** La Admin Console vive en `/admin` dentro de la misma app Next.js, protegida por rol `admin`.

**Motivo:** Menos complejidad que una app separada. El middleware verifica el rol en cada request.

---

## ADR-011 · Auditoría: event-based desde el inicio

**Estado:** Aceptada
**Fecha:** 2026-02

**Decisión:** Tabla `audit_events` que registra toda acción relevante (invitación, cambio de rol, creación de cuenta, etc.).

**Formato:** `{ actor_id, action, entity_type, entity_id, payload, created_at }`.

**Regla:** Toda Server Action o Route Handler que modifique datos debe insertar un `audit_event`.

---

## ADR-012 · Objeto core del sistema: Accounts + Contacts

**Estado:** Aceptada
**Fecha:** 2026-02

**Decisión:** El modelo de datos empieza por Clientes (Accounts) y Contactos (Contacts), no por tareas.

**Modelo:**
- `accounts` — personas físicas o empresas clientes del bróker
- `contacts` — personas de contacto, pueden estar vinculadas a un account o ser independientes
- `account_code` — código visible para humanos (ej. CLI-0001), además del UUID interno

---

## ADR-013 · IDs: UUID + código humano

**Estado:** Aceptada
**Fecha:** 2026-02

**Decisión:** Llave primaria = UUID generado por PostgreSQL (`gen_random_uuid()`). Código visible = `account_code` autoincremental en formato legible.

**Motivo:** UUID para integraciones y seguridad; código humano para uso operativo y referencias externas.

---

## ADR-014 · Gestión de documentación: Notion

**Estado:** Aceptada
**Fecha:** 2026-02

**Decisión:** Notion como herramienta de gestión de tickets y documentación del proyecto.

---

## ADR-015 · División de responsabilidades: Claude + Codex

**Estado:** Aceptada
**Fecha:** 2026-02

**Decisión:**
- **Claude** = responsable de calidad, estándares, arquitectura, revisión de PRs, QA
- **Codex** = ejecutor: implementa código, corre tests/build, abre PRs

**Dónde viven las reglas:** en el repo (`AGENTS.md` en raíz y `docs/AGENTS.md`), para que Codex las lea en cada sesión.

---

## ADR-016 · Manejador de paquetes: pnpm

**Estado:** Aceptada
**Fecha:** 2026-02

**Decisión:** pnpm como package manager.

**Motivo:** Más rápido que npm/yarn, eficiente en disco con hard links, estándar moderno.
