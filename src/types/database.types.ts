// Este archivo se genera automáticamente con:
// pnpm dlx supabase gen types typescript --project-id <tu-project-id> > src/types/database.types.ts
//
// Por ahora define los tipos mínimos manualmente hasta conectar el CLI de Supabase.

export type UserRole = 'admin' | 'ops' | 'manager' | 'agent' | 'readonly'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  team_id: string | null
  is_active: boolean
  // Migration 036: user presence
  status:            'online' | 'busy' | 'offline'
  status_updated_at: string | null
  created_at: string
  updated_at: string
}

export interface Team {
  id: string
  name: string
  created_at: string
}

export interface AuditEvent {
  id: string
  actor_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

export type AccountStatus = 'prospect' | 'active' | 'inactive'
export type AccountType   = 'empresa' | 'persona_fisica'

export interface Account {
  id: string
  account_code: string
  name: string
  type: AccountType
  rfc: string | null
  email: string | null
  phone: string | null
  status: AccountStatus
  team_id: string | null
  assigned_to: string | null
  notes: string | null
  // Sync (migration 028)
  external_id: string | null
  sync_source: SyncSource
  last_synced_at: string | null
  // Portal cliente (migration 041)
  portal_token:            string | null
  portal_enabled:          boolean
  portal_last_accessed_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  account_id: string
  full_name: string
  email: string | null
  phone: string | null
  position: string | null
  is_primary: boolean
  is_vip: boolean
  vip_notes: string | null
  notes: string | null
  // Sync (migration 028)
  external_id: string | null
  sync_source: SyncSource
  last_synced_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export type RenewalStatus =
  | 'in_progress'
  | 'changes_requested'
  | 'cancelled'
  | 'renewed_pending_payment'
  | 'renewed_paid'

export interface RenewalStage {
  id: string
  name: string
  days_before: number
  send_email: boolean
  send_whatsapp: boolean
  requires_new_policy: boolean
  sort_order: number
  is_active: boolean
  email_template_id: string | null
  whatsapp_template_id: string | null
  team_id: string | null
  created_at: string
}

export interface Renewal {
  id: string
  policy_id: string
  new_policy_id: string | null
  account_id: string
  assigned_to: string
  current_stage_id: string | null
  status: RenewalStatus
  client_confirmed_at: string | null
  call_attempts: number
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface RenewalEvent {
  id: string
  renewal_id: string
  stage_id: string | null
  action: string
  actor_id: string | null
  notes: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export type TaskStatus = 'pending' | 'in_progress' | 'done'
export type TaskSourceType = 'manual' | 'renewal' | 'claim' | 'movement'

export interface Task {
  id: string
  title: string
  description: string | null
  source_type: TaskSourceType
  source_id: string | null
  insurer: string | null
  due_date: string | null
  status: TaskStatus
  assigned_to: string | null
  created_by: string
  account_id: string | null
  created_at: string
  updated_at: string
}

export interface CollectionTemplate {
  id:            string
  name:          string
  type:          string   // 'cobranza' | 'renovacion'
  channel:       'email' | 'whatsapp' | 'both'
  subject_email: string | null
  body_email:    string | null
  body_whatsapp: string | null
  is_shared:     boolean
  is_active:     boolean
  created_by:    string
  team_id:       string | null
  created_at:    string
  updated_at:    string
}

export interface CollectionSend {
  id:                string
  policy_id:         string
  account_id:        string
  template_id:       string | null
  template_name:     string
  channel:           string
  rendered_whatsapp: string | null
  rendered_email:    string | null
  sent_to_email:     string | null
  sent_to_phone:     string | null
  sent_by:           string
  created_at:        string
}

export type ConversationChannel  = 'whatsapp' | 'email' | 'phone' | 'portal'
export type ConversationStatus   = 'open' | 'assigned' | 'resolved'
export type ConversationPriority = 'low' | 'normal' | 'high' | 'urgent'
export type MessageDirection     = 'inbound' | 'outbound' | 'note'

export interface Conversation {
  id:                 string
  contact_id:         string | null
  account_id:         string | null
  channel:            ConversationChannel
  status:             ConversationStatus
  priority:           ConversationPriority
  tags:               string[]
  subject:            string | null
  external_thread_id: string | null
  assigned_to:        string | null
  team_id:            string | null
  first_response_at:  string | null
  resolved_at:        string | null
  waiting_since:      string | null
  last_message_at:    string
  unread_count:       number
  created_at:         string
  updated_at:         string
}

export interface CcMessage {
  id:               string
  conversation_id:  string
  direction:        MessageDirection
  channel:          ConversationChannel
  body:             string | null
  subject:          string | null
  sender_name:      string | null
  sender_phone:     string | null
  sender_email:     string | null
  sent_by:          string | null
  external_id:      string | null
  duration_seconds: number | null
  status:           string
  created_at:       string
}

export interface ConversationEvent {
  id:              string
  conversation_id: string
  event_type:      string
  actor_id:        string | null
  metadata:        Record<string, unknown> | null
  created_at:      string
}

// ── Team skills ──────────────────────────────────────────────────────────────
// Módulos activos por equipo (migration 013)

export interface TeamSkill {
  id:        string
  team_id:   string
  module_id: string   // ModuleId from src/lib/modules.ts
}

// ── Quotation Stages ─────────────────────────────────────────────────────────
// Stages configurables por equipo (migration 017)

export interface QuotationStage {
  id:         string
  team_id:    string | null  // NULL = global default
  name:       string
  color:      string         // 'amber'|'blue'|'emerald'|'red'|'violet'|'orange'|'gray'
  is_won:     boolean        // cuenta como ganada en estadísticas
  is_lost:    boolean        // cuenta como perdida en estadísticas
  sort_order: number
  is_active:  boolean
  created_at: string
}

// ── Quotations ───────────────────────────────────────────────────────────────
// Cotizaciones / propuestas comerciales (migration 013 + 021)

export type QuotationStatus = 'pendiente' | 'enviada' | 'ganada' | 'perdida'
export type QuotationBranch = 'gmm' | 'autos' | 'vida' | 'daños' | 'rc' | 'otro'

export interface Quotation {
  id:                       string
  account_id:               string | null
  contact_id:               string | null
  assigned_to:              string
  insurer:                  string | null
  branch:                   QuotationBranch | null
  estimated_premium:        number | null
  status:                   QuotationStatus
  stage_id:                 string | null  // FK a quotation_stages (migration 017)
  notes:                    string | null
  expires_at:               string | null
  // Campos migration 021
  requested_by_id:          string | null
  requester_is_contractor:  boolean
  probable_contractor:      string | null
  delivery_due_at:          string | null
  created_by:               string
  created_at:               string
  updated_at:               string
}

// Solicitantes internos (quien dentro de Murguía pidió la cotización) — migration 021
export interface InternalRequester {
  id:         string
  name:       string
  email:      string | null
  notes:      string | null
  is_active:  boolean
  created_by: string | null
  created_at: string
}

// ── Insurers & Commission codes ───────────────────────────────────────────
// Directorio de aseguradoras y códigos de comisión (migration 022)

export interface Insurer {
  id:                    string
  name:                  string
  short_name:            string | null
  email:                 string | null
  phone:                 string | null
  website:               string | null
  notes:                 string | null
  is_active:             boolean
  // SLAs para agente IA (migration 023)
  sla_quote_hours:       number | null
  sla_endorsement_hours: number | null
  sla_issuance_hours:    number | null
  sla_notes:             string | null
  // Logo (migration 025)
  logo_url:              string | null
  created_at:            string
  updated_at:            string
}

export interface CommissionCode {
  id:              string
  insurer_id:      string
  code:            string
  branch:          string | null
  description:     string | null
  rate_pct:        number | null
  rate_flat:       number | null
  effective_from:  string | null
  effective_to:    string | null
  is_active:       boolean
  // Credenciales del portal (migration 024)
  portal_user:     string | null
  portal_password: string | null
  created_by:      string | null
  updated_by:      string | null
  created_at:      string
  updated_at:      string
}

export interface PaymentProof {
  id:                 string
  collection_send_id: string | null
  policy_id:          string | null
  file_name:          string
  file_path:          string
  size_bytes:         number | null
  mime_type:          string
  sent_to_control_at: string | null
  sent_by:            string
  created_at:         string
}

export interface AppSetting {
  key:        string
  value:      string | null
  updated_by: string | null
  updated_at: string
}

export type PolicyStatus = 'active' | 'pending_renewal' | 'expired' | 'cancelled' | 'quote'
export type PolicyBranch =
  | 'gmm' | 'vida' | 'auto' | 'rc' | 'danos'
  | 'transporte' | 'fianzas' | 'ap' | 'tecnicos' | 'otro'

export type SyncSource = 'manual' | 'import' | 'ocr' | 'external'

export interface Policy {
  id: string
  account_id: string
  policy_number: string | null
  branch: PolicyBranch
  insurer: string
  status: PolicyStatus
  premium: number | null
  start_date: string | null
  end_date: string | null
  tomador_id: string | null
  policy_url: string | null
  commission_code_id: string | null  // FK a commission_codes (migration 022)
  payment_frequency: 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual' | null  // migration 026
  notes: string | null
  // Campos de BD central (migration 028)
  concepto: string | null            // bien asegurado, ej. "Toyota Corolla 2023 ABC-123"
  subramo: string | null             // subtipo: "GMM Individual", "Auto Flotilla", etc.
  conducto_cobro: 'domiciliacion' | 'directo' | null  // quién cobra
  comision_total: number | null      // comisión real de la aseguradora (MXN)
  // Sync (migration 028)
  external_id: string | null
  sync_source: SyncSource
  last_synced_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

// ── Cobranza (migration 026) ──────────────────────────────────────────────

export type ReceiptStatus = 'pending' | 'paid' | 'overdue' | 'cancelled'

export interface CobranzaStage {
  id:                   string
  name:                 string
  description:          string | null
  days_before:          number | null
  send_email:           boolean
  send_whatsapp:        boolean
  email_template_id:    string | null
  whatsapp_template_id: string | null
  sort_order:           number
  is_active:            boolean
  team_id:              string | null
  created_at:           string
}

export interface PolicyReceipt {
  id:               string
  policy_id:        string
  account_id:       string
  receipt_number:   string | null
  due_date:         string
  amount:           number | null
  status:           ReceiptStatus
  current_stage_id: string | null
  paid_at:          string | null
  collected_by:     string | null
  notes:            string | null
  created_by:       string
  created_at:       string
  updated_at:       string
}

export interface ReceiptEvent {
  id:         string
  receipt_id: string
  action:     string   // 'notice_sent' | 'stage_advanced' | 'paid' | 'cancelled'
  stage_id:   string | null
  actor_id:   string | null
  notes:      string | null
  metadata:   Record<string, unknown> | null
  created_at: string
}

// ── Movimientos de póliza (migration 038) ─────────────────────────────────────

export interface MovementFieldDef {
  key:      string
  label:    string
  type:     'text' | 'number' | 'date' | 'textarea' | 'select'
  required: boolean
  options?: string[]
}

export interface MovementType {
  id:              string
  name:            string
  code:            string   // alta | baja | modificacion | cambio_cobertura | otro
  description:     string | null
  custom_fields:   MovementFieldDef[]
  affects_premium: boolean
  company_only:    boolean
  team_id:         string | null
  sort_order:      number
  is_active:       boolean
  created_by:      string
  created_at:      string
  updated_at:      string
}

export type MovementStatus = 'draft' | 'sent' | 'confirmed' | 'rejected'

export interface PolicyMovement {
  id:                 string
  policy_id:          string
  account_id:         string
  movement_type_id:   string
  movement_type_name: string
  insurer:            string
  policy_number:      string | null
  status:             MovementStatus
  field_values:       Record<string, unknown>
  notes:              string | null
  task_id:            string | null
  assigned_to:        string
  created_by:         string
  created_at:         string
  updated_at:         string
}

export interface MovementEvent {
  id:          string
  movement_id: string
  actor_id:    string
  status_from: string | null
  status_to:   string
  notes:       string | null
  created_at:  string
}

// ── Sync (migration 028) ──────────────────────────────────────────────────────

export type SyncRunStatus = 'running' | 'success' | 'partial' | 'failed'
export type SyncTriggeredBy = 'cron' | 'manual' | 'api'
export type SyncMapType = 'agent' | 'branch' | 'status' | 'insurer' | 'conducto' | 'payment_freq'

export interface SyncRun {
  id:                 string
  started_at:         string
  finished_at:        string | null
  triggered_by:       SyncTriggeredBy
  status:             SyncRunStatus
  accounts_upserted:  number
  contacts_upserted:  number
  policies_upserted:  number
  policies_cancelled: number
  receipts_upserted:  number
  renewals_created:   number
  error_count:        number
  notes:              string | null
  metadata:           Record<string, unknown> | null
}

export interface SyncError {
  id:            string
  sync_run_id:   string
  entity_type:   string
  external_id:   string | null
  error_type:    string | null
  error_message: string
  raw_data:      Record<string, unknown> | null
  created_at:    string
}

export interface SyncFieldMapping {
  id:             string
  entity_type:    string
  external_field: string
  local_field:    string
  allow_override: boolean
  transform:      Record<string, string> | null  // {"GMM":"gmm","AUTOS":"auto"}
  is_active:      boolean
  notes:          string | null
  created_at:     string
}

export interface SyncReferenceMap {
  id:             string
  map_type:       SyncMapType
  external_value: string
  local_value:    string
  auto_detected:  boolean
  is_active:      boolean
  notes:          string | null
  created_at:     string
}

// ── Siniestros (Claims) ────────────────────────────────────────────────────────

export interface ClaimImportRun {
  id:             string
  insurer_id:     string
  file_name:      string
  period_label:   string | null
  total_rows:     number
  matched_rows:   number
  unmatched_rows: number
  imported_by:    string | null
  created_at:     string
}

export interface ClaimColumnMapping {
  id:            string
  insurer_id:    string
  source_column: string   // encabezado en Excel: "NO_SINIESTRO"
  target_field:  string   // nuestro campo: "claim_number"
  is_active:     boolean
  created_at:    string
}

export interface AccountClaim {
  id:               string
  import_run_id:    string | null
  insurer_id:       string
  account_id:       string | null
  policy_id:        string | null
  is_matched:       boolean
  claim_number:     string | null
  policy_number_raw: string | null
  loss_date:        string | null
  report_date:      string | null
  claim_type:       string | null
  description:      string | null
  amount_claimed:   number | null
  amount_approved:  number | null
  amount_paid:      number | null
  status_insurer:   string | null
  extra_fields:     Record<string, unknown> | null
  created_at:       string
}

// Target fields para mapeo de columnas (orden de presentación en el UI)
export const CLAIM_TARGET_FIELDS: { field: string; label: string; required: boolean }[] = [
  { field: 'policy_number',  label: 'Número de póliza',        required: true  },
  { field: 'claim_number',   label: 'Número de siniestro',     required: false },
  { field: 'loss_date',      label: 'Fecha del siniestro',     required: false },
  { field: 'report_date',    label: 'Fecha de reporte',        required: false },
  { field: 'claim_type',     label: 'Tipo de siniestro',       required: false },
  { field: 'description',    label: 'Descripción',             required: false },
  { field: 'amount_claimed', label: 'Monto reclamado',         required: false },
  { field: 'amount_approved',label: 'Monto aprobado',          required: false },
  { field: 'amount_paid',    label: 'Monto pagado',            required: false },
  { field: 'status_insurer', label: 'Estatus en aseguradora',  required: false },
]

// Row parseada del Excel lista para importar
export interface ParsedClaimRow {
  claim_number:      string | null
  policy_number_raw: string | null
  loss_date:         string | null
  report_date:       string | null
  claim_type:        string | null
  description:       string | null
  amount_claimed:    number | null
  amount_approved:   number | null
  amount_paid:       number | null
  status_insurer:    string | null
  extra_fields:      Record<string, unknown>
}
