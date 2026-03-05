/**
 * agent-tools.ts — Tool definitions + implementations para el Copiloto IA
 * Los AGENT_TOOLS son los schemas que se pasan a la API de Claude.
 * Las funciones tool* son implementaciones llamadas desde el route handler.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, EMAIL_FROM } from '@/lib/resend'
import { sendWhatsApp }      from '@/lib/kapso'
import { getEmailCcList }    from '@/lib/email-cc'
import {
  renderTemplate,
  formatMXN,
  formatDate,
  type CollectionVars,
} from '@/lib/collection-vars'
import type { CobranzaStage } from '@/types/database.types'

// ─── Tool Definitions (schema para Claude) ────────────────────────────────────

export const AGENT_TOOLS = [
  // ── READ tools ────────────────────────────────────────────
  {
    name: 'get_renewals',
    description: 'Consulta las renovaciones de pólizas. Filtra por período, estado y si son propias del usuario.',
    input_schema: {
      type: 'object',
      properties: {
        periodo: {
          type: 'string',
          enum: ['esta_semana', 'este_mes', 'todas'],
          description: 'Período de filtro por fecha de vencimiento de la póliza',
        },
        status: {
          type: 'string',
          enum: ['in_progress', 'changes_requested', 'renewed_pending_payment', 'renewed_paid', 'cancelled'],
          description: 'Estado de la renovación',
        },
        solo_mias: {
          type: 'boolean',
          description: 'Si true, solo muestra renovaciones asignadas al usuario actual',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_policies_expiring',
    description: 'Lista las pólizas activas próximas a vencer en los próximos N días.',
    input_schema: {
      type: 'object',
      properties: {
        dias: {
          type: 'number',
          description: 'Número de días a futuro para buscar vencimientos (default: 60)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_tasks',
    description: 'Consulta las tareas del usuario. Puede filtrar por estado, fecha límite y si son propias.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'done', 'todas'],
          description: 'Estado de las tareas',
        },
        solo_mias: {
          type: 'boolean',
          description: 'Si true, solo muestra tareas asignadas al usuario actual (default: true)',
        },
        fecha_limite: {
          type: 'string',
          description: 'Fecha máxima de vencimiento en formato ISO (ej: 2026-03-15)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_collection_summary',
    description: 'Consulta el historial de cobros/recordatorios enviados.',
    input_schema: {
      type: 'object',
      properties: {
        aseguradora: {
          type: 'string',
          description: 'Filtro por nombre de aseguradora (búsqueda parcial)',
        },
        cuenta: {
          type: 'string',
          description: 'Filtro por nombre de cuenta/cliente (búsqueda parcial)',
        },
        periodo: {
          type: 'string',
          enum: ['esta_semana', 'este_mes', 'todas'],
          description: 'Período de los envíos',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_accounts',
    description: 'Busca cuentas/clientes por nombre, tipo o estado.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: {
          type: 'string',
          description: 'Nombre del cliente o empresa (búsqueda parcial)',
        },
        tipo: {
          type: 'string',
          enum: ['empresa', 'persona_fisica'],
          description: 'Tipo de cuenta',
        },
        estado: {
          type: 'string',
          enum: ['prospect', 'active', 'inactive'],
          description: 'Estado de la cuenta',
        },
      },
      required: [],
    },
  },
  {
    name: 'create_task',
    description: 'Crea una nueva tarea asignada al usuario actual.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: {
          type: 'string',
          description: 'Título de la tarea (requerido)',
        },
        descripcion: {
          type: 'string',
          description: 'Descripción opcional de la tarea',
        },
        fecha_limite: {
          type: 'string',
          description: 'Fecha límite en formato ISO (ej: 2026-03-15)',
        },
        cuenta_id: {
          type: 'string',
          description: 'ID UUID de la cuenta asociada (opcional)',
        },
      },
      required: ['titulo'],
    },
  },
  // ── READ tool: recibos pendientes detallados ───────────────
  {
    name: 'get_pending_receipts',
    description: 'Obtiene recibos de cobranza pendientes o vencidos con detalle de urgencia. Clasificados por urgencia: "vencido" (ya pasó), "urgente" (≤2 días), "semana" (≤7 días), "mes" (≤30 días). SIEMPRE usar ANTES de send_collection_reminders para mostrar al usuario qué se va a enviar.',
    input_schema: {
      type: 'object',
      properties: {
        urgencia: {
          type: 'string',
          enum: ['urgentes', 'esta_semana', 'este_mes', 'todos'],
          description: 'Filtro por nivel de urgencia',
        },
        limit: {
          type: 'number',
          description: 'Máximo de resultados (default: 20, máx: 50)',
        },
      },
      required: [],
    },
  },
  // ── EXECUTE tools ─────────────────────────────────────────
  {
    name: 'send_collection_reminders',
    description: 'ACCIÓN DE EJECUCIÓN: Envía recordatorios de cobranza a los recibos especificados, avanzando su etapa. SIEMPRE llamar DESPUÉS de get_pending_receipts y DESPUÉS de confirmación explícita del usuario. Registra los envíos en el historial.',
    input_schema: {
      type: 'object',
      properties: {
        receipt_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array de IDs UUID de recibos a notificar (obtenidos de get_pending_receipts)',
        },
      },
      required: ['receipt_ids'],
    },
  },
  {
    name: 'send_renewal_reminder',
    description: 'ACCIÓN DE EJECUCIÓN: Envía un recordatorio de renovación para la renovación especificada vía email, WhatsApp o ambos. SIEMPRE pedir confirmación al usuario antes de ejecutar.',
    input_schema: {
      type: 'object',
      properties: {
        renewal_id: {
          type: 'string',
          description: 'ID UUID de la renovación a notificar',
        },
        channel: {
          type: 'string',
          enum: ['email', 'whatsapp', 'both'],
          description: 'Canal de envío del recordatorio',
        },
      },
      required: ['renewal_id', 'channel'],
    },
  },
  {
    name: 'update_task_status',
    description: 'ACCIÓN DE EJECUCIÓN: Actualiza el estado de una tarea. SIEMPRE confirmar con el usuario el ID y nuevo estado antes de ejecutar.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'ID UUID de la tarea a actualizar',
        },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'done'],
          description: 'Nuevo estado de la tarea',
        },
      },
      required: ['task_id', 'status'],
    },
  },
  {
    name: 'start_renewal',
    description: 'ACCIÓN DE EJECUCIÓN: Inicia el proceso de renovación para una póliza activa. Solo usar si la póliza no tiene renovación activa. SIEMPRE confirmar con el usuario antes de ejecutar.',
    input_schema: {
      type: 'object',
      properties: {
        policy_id: {
          type: 'string',
          description: 'ID UUID de la póliza a renovar',
        },
      },
      required: ['policy_id'],
    },
  },
] as const

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RenewalResult {
  id:        string
  account:   string
  insurer:   string | null
  branch:    string | null
  end_date:  string | null
  status:    string
  stage:     string | null
  assigned:  string | null
}

export interface PolicyResult {
  id:          string
  account:     string
  insurer:     string
  branch:      string | null
  end_date:    string | null
  premium:     number | null
  days_left:   number
}

export interface TaskResult {
  id:          string
  title:       string
  status:      string
  due_date:    string | null
  source_type: string
  account:     string | null
  insurer:     string | null
}

export interface CollectionResult {
  insurer:        string | null
  account:        string | null
  policy_number:  string | null
  template:       string | null
  channel:        string | null
  sent_at:        string
  sent_by:        string | null
}

export interface AccountResult {
  id:     string
  name:   string
  code:   string | null
  status: string
  type:   string
  email:  string | null
  phone:  string | null
}

export interface CreatedTask {
  id:    string
  title: string
}

export interface PendingReceiptResult {
  id:             string
  account_name:   string
  policy_number:  string | null
  insurer:        string | null
  amount:         number | null
  due_date:       string
  days_until_due: number
  urgencia:       'vencido' | 'urgente' | 'semana' | 'mes'
  stage_name:     string | null
}

export interface SendCollectionResult {
  sent:    number
  errors:  string[]
  details: { receipt_id: string; account: string; channels: string[] }[]
}

// ─── READ Tool Implementations ────────────────────────────────────────────────

export async function toolGetRenewals(
  userId:     string,
  userRole:   string,
  userTeamId: string | null,
  params: {
    periodo?:  'esta_semana' | 'este_mes' | 'todas'
    status?:   string
    solo_mias?: boolean
  },
): Promise<RenewalResult[]> {
  const admin  = createAdminClient()
  const today  = new Date()
  const todayStr = today.toISOString().split('T')[0]

  let query = admin
    .from('renewals')
    .select('id, status, assigned_to, policies!policy_id(insurer, branch, end_date), accounts!account_id(name), renewal_stages!current_stage_id(name), assigned:profiles!assigned_to(full_name)')
    .order('created_at', { ascending: false })
    .limit(20)

  if (params.status) query = query.eq('status', params.status)
  if (params.solo_mias) query = query.eq('assigned_to', userId)

  if (params.periodo === 'esta_semana') {
    const end = new Date(today)
    end.setDate(end.getDate() + 7)
    query = query.lte('policies.end_date', end.toISOString().split('T')[0])
  } else if (params.periodo === 'este_mes') {
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    query = query.lte('policies.end_date', end.toISOString().split('T')[0])
  }

  // Filter by team for non-admin/ops
  if (!['admin', 'ops'].includes(userRole)) {
    if (userRole === 'manager' && userTeamId) {
      const { data: accounts } = await admin.from('accounts').select('id').eq('team_id', userTeamId)
      const ids = (accounts ?? []).map((a: { id: string }) => a.id)
      if (ids.length > 0) query = query.in('account_id', ids)
      else return []
    } else {
      query = query.eq('assigned_to', userId)
    }
  }

  const { data } = await query
  return (data ?? []).map((r: Record<string, unknown>) => {
    const policy  = (Array.isArray(r.policies) ? (r.policies as Record<string, unknown>[])[0] : r.policies) as Record<string, unknown> | null
    const account = (Array.isArray(r.accounts) ? (r.accounts as Record<string, unknown>[])[0] : r.accounts) as Record<string, unknown> | null
    const stage   = (Array.isArray(r.renewal_stages) ? (r.renewal_stages as Record<string, unknown>[])[0] : r.renewal_stages) as Record<string, unknown> | null
    const assigned = (Array.isArray(r.assigned) ? (r.assigned as Record<string, unknown>[])[0] : r.assigned) as Record<string, unknown> | null
    return {
      id:       r.id as string,
      account:  (account?.name as string) ?? '—',
      insurer:  (policy?.insurer as string | null) ?? null,
      branch:   (policy?.branch as string | null) ?? null,
      end_date: (policy?.end_date as string | null) ?? null,
      status:   r.status as string,
      stage:    (stage?.name as string | null) ?? null,
      assigned: (assigned?.full_name as string | null) ?? null,
    }
  })
}

export async function toolGetPoliciesExpiring(
  userId:     string,
  userRole:   string,
  userTeamId: string | null,
  params: { dias?: number },
): Promise<PolicyResult[]> {
  const admin   = createAdminClient()
  const today   = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const dias    = params.dias ?? 60
  const cutoff  = new Date(today)
  cutoff.setDate(cutoff.getDate() + dias)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  let accountIds: string[] | null = null
  if (!['admin', 'ops'].includes(userRole)) {
    let q = admin.from('accounts').select('id')
    if (userRole === 'manager' && userTeamId) q = q.eq('team_id', userTeamId)
    else q = q.eq('assigned_to', userId)
    const { data: accounts } = await q
    accountIds = (accounts ?? []).map((a: { id: string }) => a.id)
    if (accountIds.length === 0) return []
  }

  let query = admin
    .from('policies')
    .select('id, insurer, branch, end_date, premium, accounts!account_id(name)')
    .eq('status', 'active')
    .gte('end_date', todayStr)
    .lte('end_date', cutoffStr)
    .order('end_date')
    .limit(20)

  if (accountIds) query = query.in('account_id', accountIds)

  const { data } = await query
  return (data ?? []).map((p: Record<string, unknown>) => {
    const account = (Array.isArray(p.accounts) ? (p.accounts as Record<string, unknown>[])[0] : p.accounts) as Record<string, unknown> | null
    const endDate = new Date((p.end_date as string) + 'T12:00:00')
    const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / 86400000)
    return {
      id:        p.id as string,
      account:   (account?.name as string) ?? '—',
      insurer:   (p.insurer as string) ?? '—',
      branch:    (p.branch as string | null) ?? null,
      end_date:  (p.end_date as string | null) ?? null,
      premium:   (p.premium as number | null) ?? null,
      days_left: daysLeft,
    }
  })
}

export async function toolGetTasks(
  userId:     string,
  userRole:   string,
  userTeamId: string | null,
  params: {
    status?:       'pending' | 'in_progress' | 'done' | 'todas'
    solo_mias?:    boolean
    fecha_limite?: string
  },
): Promise<TaskResult[]> {
  const admin = createAdminClient()
  let query = admin
    .from('tasks')
    .select('id, title, status, due_date, source_type, account_id, accounts!account_id(name), insurer')
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(30)

  if (params.status && params.status !== 'todas') query = query.eq('status', params.status)
  else if (!params.status) query = query.in('status', ['pending', 'in_progress'])

  if (params.fecha_limite) query = query.lte('due_date', params.fecha_limite)

  // Default: solo las del usuario actual
  if (params.solo_mias !== false) query = query.eq('assigned_to', userId)

  const { data } = await query
  return (data ?? []).map((t: Record<string, unknown>) => {
    const account = (Array.isArray(t.accounts) ? (t.accounts as Record<string, unknown>[])[0] : t.accounts) as Record<string, unknown> | null
    return {
      id:          t.id as string,
      title:       t.title as string,
      status:      t.status as string,
      due_date:    (t.due_date as string | null) ?? null,
      source_type: (t.source_type as string) ?? 'manual',
      account:     (account?.name as string | null) ?? null,
      insurer:     (t.insurer as string | null) ?? null,
    }
  })
}

export async function toolGetCollectionSummary(
  userId:     string,
  userRole:   string,
  userTeamId: string | null,
  params: {
    aseguradora?: string
    cuenta?:      string
    periodo?:     'esta_semana' | 'este_mes' | 'todas'
  },
): Promise<CollectionResult[]> {
  const admin = createAdminClient()
  const today = new Date()

  let query = admin
    .from('collection_sends')
    .select('template_name, channel, sent_at, policies!policy_id(policy_number, insurer), accounts!account_id(name), sender:profiles!sent_by(full_name)')
    .order('sent_at', { ascending: false })
    .limit(30)

  if (!['admin', 'ops'].includes(userRole)) {
    query = query.eq('sent_by', userId)
  }

  if (params.aseguradora) {
    query = query.ilike('policies.insurer', `%${params.aseguradora}%`)
  }
  if (params.cuenta) {
    query = query.ilike('accounts.name', `%${params.cuenta}%`)
  }
  if (params.periodo === 'esta_semana') {
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)
    query = query.gte('sent_at', weekAgo.toISOString())
  } else if (params.periodo === 'este_mes') {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    query = query.gte('sent_at', monthStart.toISOString())
  }

  const { data } = await query
  return (data ?? []).map((c: Record<string, unknown>) => {
    const policy  = (Array.isArray(c.policies) ? (c.policies as Record<string, unknown>[])[0] : c.policies) as Record<string, unknown> | null
    const account = (Array.isArray(c.accounts) ? (c.accounts as Record<string, unknown>[])[0] : c.accounts) as Record<string, unknown> | null
    const sender  = (Array.isArray(c.sender) ? (c.sender as Record<string, unknown>[])[0] : c.sender) as Record<string, unknown> | null
    return {
      insurer:       (policy?.insurer as string | null) ?? null,
      account:       (account?.name as string | null) ?? null,
      policy_number: (policy?.policy_number as string | null) ?? null,
      template:      (c.template_name as string | null) ?? null,
      channel:       (c.channel as string | null) ?? null,
      sent_at:       c.sent_at as string,
      sent_by:       (sender?.full_name as string | null) ?? null,
    }
  })
}

export async function toolGetAccounts(
  userId:     string,
  userRole:   string,
  userTeamId: string | null,
  params: {
    nombre?: string
    tipo?:   'empresa' | 'persona_fisica'
    estado?: 'prospect' | 'active' | 'inactive'
  },
): Promise<AccountResult[]> {
  const admin = createAdminClient()
  let query = admin
    .from('accounts')
    .select('id, name, account_code, status, type, email, phone')
    .order('name')
    .limit(20)

  if (params.nombre) query = query.ilike('name', `%${params.nombre}%`)
  if (params.tipo)   query = query.eq('type', params.tipo)
  if (params.estado) query = query.eq('status', params.estado)

  if (!['admin', 'ops'].includes(userRole)) {
    if (userRole === 'manager' && userTeamId) query = query.eq('team_id', userTeamId)
    else query = query.eq('assigned_to', userId)
  }

  const { data } = await query
  return (data ?? []).map((a: Record<string, unknown>) => ({
    id:     a.id as string,
    name:   a.name as string,
    code:   (a.account_code as string | null) ?? null,
    status: (a.status as string) ?? 'prospect',
    type:   (a.type as string) ?? 'empresa',
    email:  (a.email as string | null) ?? null,
    phone:  (a.phone as string | null) ?? null,
  }))
}

export async function toolCreateTask(
  userId: string,
  params: {
    titulo:        string
    descripcion?:  string
    fecha_limite?: string
    cuenta_id?:    string
  },
): Promise<CreatedTask> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tasks')
    .insert({
      title:       params.titulo.trim(),
      description: params.descripcion?.trim() || null,
      due_date:    params.fecha_limite || null,
      account_id:  params.cuenta_id || null,
      status:      'pending',
      source_type: 'manual',
      assigned_to: userId,
      created_by:  userId,
    })
    .select('id, title')
    .single()

  if (error) throw new Error(error.message)

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'task.created',
    entity_type: 'task',
    entity_id:   data.id,
    payload:     { title: params.titulo, source: 'copiloto_ia' },
  })

  return { id: data.id, title: data.title }
}

// ─── get_pending_receipts ─────────────────────────────────────────────────────

export async function toolGetPendingReceipts(
  userId:     string,
  userRole:   string,
  userTeamId: string | null,
  params: {
    urgencia?: 'urgentes' | 'esta_semana' | 'este_mes' | 'todos'
    limit?:    number
  },
): Promise<PendingReceiptResult[]> {
  const admin    = createAdminClient()
  const today    = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const lim      = Math.min(params.limit ?? 20, 50)

  let accountIds: string[] | null = null
  if (!['admin', 'ops'].includes(userRole)) {
    let q = admin.from('accounts').select('id')
    if (userRole === 'manager' && userTeamId) q = q.eq('team_id', userTeamId)
    else q = q.eq('assigned_to', userId)
    const { data: accounts } = await q
    accountIds = (accounts ?? []).map((a: { id: string }) => a.id)
    if (accountIds.length === 0) return []
  }

  let dueDateTo: string | undefined
  if (params.urgencia === 'urgentes') {
    const d = new Date(today)
    d.setDate(d.getDate() + 2)
    dueDateTo = d.toISOString().split('T')[0]
  } else if (params.urgencia === 'esta_semana') {
    const d = new Date(today)
    d.setDate(d.getDate() + 7)
    dueDateTo = d.toISOString().split('T')[0]
  } else if (params.urgencia === 'este_mes') {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    dueDateTo = d.toISOString().split('T')[0]
  }

  let query = admin
    .from('policy_receipts')
    .select(`
      id, due_date, amount, status,
      policies!policy_id (policy_number, insurer),
      accounts!account_id (name),
      cobranza_stages!current_stage_id (name)
    `)
    .in('status', ['pending', 'overdue'])
    .order('due_date')
    .limit(lim)

  if (accountIds) query = query.in('account_id', accountIds)
  if (dueDateTo)  query = query.lte('due_date', dueDateTo)

  const { data } = await query

  return (data ?? []).map((r: Record<string, unknown>) => {
    const policy  = (Array.isArray(r.policies) ? (r.policies as Record<string, unknown>[])[0] : r.policies) as Record<string, unknown> | null
    const account = (Array.isArray(r.accounts) ? (r.accounts as Record<string, unknown>[])[0] : r.accounts) as Record<string, unknown> | null
    const stage   = (Array.isArray(r.cobranza_stages) ? (r.cobranza_stages as Record<string, unknown>[])[0] : r.cobranza_stages) as Record<string, unknown> | null
    const dueDate = new Date((r.due_date as string) + 'T12:00:00')
    const diffMs  = dueDate.getTime() - today.getTime()
    const daysDiff = Math.ceil(diffMs / 86400000)
    const urgencia: PendingReceiptResult['urgencia'] =
      daysDiff < 0  ? 'vencido' :
      daysDiff <= 2 ? 'urgente' :
      daysDiff <= 7 ? 'semana'  : 'mes'
    return {
      id:             r.id as string,
      account_name:   (account?.name as string) ?? '—',
      policy_number:  (policy?.policy_number as string | null) ?? null,
      insurer:        (policy?.insurer as string | null) ?? null,
      amount:         (r.amount as number | null) ?? null,
      due_date:       r.due_date as string,
      days_until_due: daysDiff,
      urgencia,
      stage_name:     (stage?.name as string | null) ?? null,
    }
  })
}

// ─── send_collection_reminders ───────────────────────────────────────────────

export async function toolSendCollectionReminders(
  userId:      string,
  userProfile: { role: string; full_name: string | null; team_id: string | null },
  params: { receipt_ids: string[] },
): Promise<SendCollectionResult> {
  const admin  = createAdminClient()
  let sent     = 0
  const errors: string[] = []
  const details: SendCollectionResult['details'] = []

  const { data: allStages } = await admin
    .from('cobranza_stages')
    .select('id, name, sort_order, send_email, send_whatsapp, email_template_id, whatsapp_template_id, is_active')
    .eq('is_active', true)
    .order('sort_order')

  const stages = (allStages ?? []) as CobranzaStage[]

  for (const receiptId of params.receipt_ids) {
    try {
      const { data: receipt } = await admin
        .from('policy_receipts')
        .select(`
          id, policy_id, account_id, amount, current_stage_id, due_date,
          policies!policy_id (
            id, policy_number, insurer, premium, end_date,
            contacts!tomador_id (id, full_name, email, phone)
          ),
          accounts!account_id (name, team_id)
        `)
        .eq('id', receiptId)
        .single()

      if (!receipt) { errors.push(`Recibo ${receiptId} no encontrado`); continue }

      const policy  = (Array.isArray(receipt.policies) ? (receipt.policies as Record<string, unknown>[])[0] : receipt.policies) as Record<string, unknown> | null
      const account = (Array.isArray(receipt.accounts) ? (receipt.accounts as Record<string, unknown>[])[0] : receipt.accounts) as Record<string, unknown> | null
      const tomador = policy
        ? ((Array.isArray(policy.contacts) ? (policy.contacts as Record<string, unknown>[])[0] : policy.contacts) as { id: string; full_name: string; email: string | null; phone: string | null } | null)
        : null

      const currentStage = stages.find(s => s.id === receipt.current_stage_id) ?? stages[0]
      if (!currentStage) { errors.push('Sin etapas de cobranza configuradas'); continue }

      const nextStage  = stages.find(s => s.sort_order > currentStage.sort_order) ?? null
      const isLastStage = !nextStage

      const vars: CollectionVars = {
        nombre:        tomador?.full_name ?? 'Cliente',
        monto:         formatMXN((receipt.amount as number | null) ?? (policy?.premium as number | null)),
        numero_poliza: (policy?.policy_number as string | null) ?? 'S/N',
        aseguradora:   (policy?.insurer as string) ?? '—',
        vencimiento:   formatDate((receipt.due_date as string)),
        cuenta:        (account?.name as string) ?? '—',
        ejecutivo:     userProfile.full_name ?? 'Ejecutivo',
        fecha_hoy:     formatDate(new Date().toISOString()),
      }

      const channelsSent: string[] = []

      if (currentStage.send_email && currentStage.email_template_id && tomador?.email) {
        const { data: tmpl } = await admin
          .from('collection_templates')
          .select('subject_email, body_email')
          .eq('id', currentStage.email_template_id)
          .single()
        if (tmpl?.body_email) {
          try {
            const cc = await getEmailCcList(false, (account?.team_id as string | null) ?? undefined)
            await resend.emails.send({
              from:    EMAIL_FROM,
              to:      tomador.email,
              subject: tmpl.subject_email
                ? renderTemplate(tmpl.subject_email, vars)
                : `Aviso de cobranza — ${vars.numero_poliza}`,
              text: renderTemplate(tmpl.body_email, vars),
              ...(cc.length ? { cc } : {}),
            })
            channelsSent.push('email')
          } catch { /* non-blocking */ }
        }
      }

      if (currentStage.send_whatsapp && currentStage.whatsapp_template_id && tomador?.phone) {
        const { data: tmpl } = await admin
          .from('collection_templates')
          .select('body_whatsapp')
          .eq('id', currentStage.whatsapp_template_id)
          .single()
        if (tmpl?.body_whatsapp) {
          const ok = await sendWhatsApp(tomador.phone, renderTemplate(tmpl.body_whatsapp, vars))
          if (ok) channelsSent.push('whatsapp')
        }
      }

      if (channelsSent.length > 0) {
        await admin.from('collection_sends').insert({
          policy_id:     receipt.policy_id,
          account_id:    receipt.account_id,
          template_id:   channelsSent.includes('email') ? currentStage.email_template_id : currentStage.whatsapp_template_id,
          template_name: currentStage.name,
          channel:       channelsSent.join('+'),
          sent_to_email: channelsSent.includes('email') ? tomador?.email ?? null : null,
          sent_to_phone: channelsSent.includes('whatsapp') ? tomador?.phone ?? null : null,
          sent_by:       userId,
          receipt_id:    receiptId,
        })
      }

      await admin.from('receipt_events').insert({
        receipt_id: receiptId,
        action:     'notice_sent',
        stage_id:   currentStage.id,
        actor_id:   userId,
        metadata:   { channels: channelsSent, stage_name: currentStage.name, via: 'copiloto_ia' },
      })

      if (isLastStage) {
        await admin.from('policy_receipts')
          .update({ status: 'paid', paid_at: new Date().toISOString(), collected_by: userId, current_stage_id: currentStage.id })
          .eq('id', receiptId)
      } else {
        await admin.from('policy_receipts')
          .update({ current_stage_id: nextStage!.id })
          .eq('id', receiptId)
      }

      details.push({
        receipt_id: receiptId,
        account:    (account?.name as string) ?? '—',
        channels:   channelsSent,
      })
      sent++
    } catch (e) {
      errors.push(`Recibo ${receiptId}: ${(e as Error).message}`)
    }
  }

  return { sent, errors, details }
}

// ─── send_renewal_reminder ────────────────────────────────────────────────────

export async function toolSendRenewalReminder(
  renewalId:    string,
  channel:      'email' | 'whatsapp' | 'both',
  cookieHeader: string,
  baseUrl:      string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${baseUrl}/api/renewals/${renewalId}/notify`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie':       cookieHeader,
      },
      body: JSON.stringify({ channel }),
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, message: `Error ${res.status}: ${text}` }
    }
    return { ok: true, message: `Recordatorio enviado vía ${channel}` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

// ─── update_task_status ───────────────────────────────────────────────────────

export async function toolUpdateTaskStatus(
  userId:  string,
  params:  { task_id: string; status: 'pending' | 'in_progress' | 'done' },
): Promise<{ ok: boolean; title: string }> {
  const admin = createAdminClient()

  // Verify task belongs to user (agents can only update their own tasks)
  const { data: task } = await admin
    .from('tasks')
    .select('id, title, assigned_to')
    .eq('id', params.task_id)
    .single()

  if (!task) throw new Error('Tarea no encontrada')

  const { error } = await admin
    .from('tasks')
    .update({ status: params.status })
    .eq('id', params.task_id)

  if (error) throw new Error(error.message)

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'task.status_changed',
    entity_type: 'task',
    entity_id:   params.task_id,
    payload:     { status: params.status, via: 'copiloto_ia' },
  })

  return { ok: true, title: task.title as string }
}

// ─── start_renewal ────────────────────────────────────────────────────────────

export async function toolStartRenewal(
  userId:   string,
  policyId: string,
): Promise<{ ok: boolean; renewal_id?: string; error?: string }> {
  const admin = createAdminClient()

  const { data: policy } = await admin
    .from('policies')
    .select('id, account_id, insurer')
    .eq('id', policyId)
    .single()

  if (!policy) return { ok: false, error: 'Póliza no encontrada' }

  const { data: existing } = await admin
    .from('renewals')
    .select('id')
    .eq('policy_id', policyId)
    .eq('status', 'in_progress')
    .maybeSingle()

  if (existing) return { ok: false, error: 'Ya existe una renovación activa para esta póliza' }

  const { data: firstStage } = await admin
    .from('renewal_stages')
    .select('id')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: renewal, error } = await admin
    .from('renewals')
    .insert({
      policy_id:        policyId,
      account_id:       policy.account_id,
      assigned_to:      userId,
      current_stage_id: firstStage?.id ?? null,
      status:           'in_progress',
      created_by:       userId,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'renewal.started',
    entity_type: 'renewal',
    entity_id:   renewal.id,
    payload:     { policy_id: policyId, via: 'copiloto_ia' },
  })

  return { ok: true, renewal_id: renewal.id }
}
