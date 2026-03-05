-- Migration 039: Índices de rendimiento + team_id en policy_movements
-- Preparación para 15-20 usuarios con 30,000 pólizas

-- ── 1. Columna team_id en policy_movements (denormalizada) ──────────────────
-- Permite simplificar la RLS del manager de O(triple subquery) a O(1 subquery)

ALTER TABLE policy_movements
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_policy_movements_team_id
  ON policy_movements(team_id);

-- ── 2. RLS simplificada para policy_movements ────────────────────────────────
-- Antes: manager hacía triple subquery por fila
-- Ahora: 1 subquery a profiles con OR interno

DROP POLICY IF EXISTS "policy_movements_select" ON policy_movements;

CREATE POLICY "policy_movements_select" ON policy_movements
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'ops')
          OR (p.role = 'manager' AND policy_movements.team_id = p.team_id)
        )
    )
  );

-- ── 3. Índices en policy_receipts ────────────────────────────────────────────
-- La tabla que más crecerá (~12 recibos/póliza/año = 360k filas para 30k pólizas)

-- Filtro principal de cobranza: status + fecha
CREATE INDEX IF NOT EXISTS idx_policy_receipts_status_due
  ON policy_receipts(status, due_date)
  WHERE status IN ('pending', 'overdue');

-- Filtro por etapa (kanban cobranza)
CREATE INDEX IF NOT EXISTS idx_policy_receipts_stage_status
  ON policy_receipts(current_stage_id, status);

-- ── 4. Índices en policy_movements ──────────────────────────────────────────
-- "Mis movimientos pendientes" — filtro más común del agente

CREATE INDEX IF NOT EXISTS idx_policy_movements_status_assigned
  ON policy_movements(status, assigned_to)
  WHERE status IN ('draft', 'sent');

-- ── 5. Índices en event timelines ────────────────────────────────────────────
-- Tablas de log: crecer sin techo, se consultan por ID + orden cronológico

CREATE INDEX IF NOT EXISTS idx_renewal_events_renewal_created
  ON renewal_events(renewal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_receipt_events_receipt_created
  ON receipt_events(receipt_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_movement_events_movement_created
  ON movement_events(movement_id, created_at DESC);

-- ── 6. Índices en accounts ───────────────────────────────────────────────────
-- Dashboard por equipo (manager ve su equipo)

CREATE INDEX IF NOT EXISTS idx_accounts_team_status
  ON accounts(team_id, status);

-- ── 7. Índice en contacts ────────────────────────────────────────────────────
-- Lookup del contacto principal al enviar emails

CREATE INDEX IF NOT EXISTS idx_contacts_account_primary
  ON contacts(account_id, is_primary)
  WHERE is_primary = true;

-- ── 8. Índice en collection_sends ────────────────────────────────────────────
-- Historial de envíos por póliza (timeline de cobranza)

CREATE INDEX IF NOT EXISTS idx_collection_sends_policy_created
  ON collection_sends(policy_id, created_at DESC);

-- ── 9. Índice en conversations ───────────────────────────────────────────────
-- Inbox del agente: "mis conversaciones abiertas"

CREATE INDEX IF NOT EXISTS idx_conversations_assigned_status
  ON conversations(assigned_to, status)
  WHERE status IN ('open', 'assigned');

-- ── 10. Índice en policies ───────────────────────────────────────────────────
-- Renovaciones por aseguradora (filtro frecuente)

CREATE INDEX IF NOT EXISTS idx_policies_insurer_status_end
  ON policies(insurer, status, end_date)
  WHERE status = 'active';
