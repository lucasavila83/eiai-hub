-- ================================================
-- BPM Module: Processos com fases, campos dinâmicos, SLA
-- ================================================

-- ===== PIPES (Templates de Processo) =====
CREATE TABLE IF NOT EXISTS bpm_pipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'workflow',
  color TEXT DEFAULT '#6366f1',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== PHASES (Fases do Processo) =====
CREATE TABLE IF NOT EXISTS bpm_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipe_id UUID NOT NULL REFERENCES bpm_pipes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  sla_hours INTEGER, -- NULL = sem SLA
  default_assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_start BOOLEAN NOT NULL DEFAULT FALSE,
  is_end BOOLEAN NOT NULL DEFAULT FALSE,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== FIELDS (Campos Dinâmicos por Fase) =====
CREATE TABLE IF NOT EXISTS bpm_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES bpm_phases(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL, -- identificador único dentro da fase
  field_type TEXT NOT NULL CHECK (field_type IN (
    'text', 'textarea', 'number', 'currency', 'date',
    'select', 'multiselect', 'checkbox', 'email', 'phone',
    'file', 'user'
  )),
  label TEXT NOT NULL,
  placeholder TEXT,
  help_text TEXT,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  options JSONB DEFAULT '[]', -- para select/multiselect: [{"value":"x","label":"X"}]
  default_value JSONB, -- valor padrão (JSONB para flexibilidade)
  position INTEGER NOT NULL DEFAULT 0,
  validations JSONB DEFAULT '{}', -- {"min":0,"max":100,"regex":"..."}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== CARDS BPM (Instâncias do Processo) =====
CREATE TABLE IF NOT EXISTS bpm_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipe_id UUID NOT NULL REFERENCES bpm_pipes(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  current_phase_id UUID REFERENCES bpm_phases(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sla_deadline TIMESTAMPTZ, -- calculado: moved_at + phase.sla_hours
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent', 'high', 'medium', 'low', 'none')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ, -- NULL = em andamento
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== CARD VALUES (Valores dos Campos - EAV) =====
CREATE TABLE IF NOT EXISTS bpm_card_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES bpm_cards(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES bpm_fields(id) ON DELETE CASCADE,
  value JSONB, -- valor armazenado (texto, número, array, etc.)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(card_id, field_id)
);

-- ===== CARD HISTORY (Log de Movimentações) =====
CREATE TABLE IF NOT EXISTS bpm_card_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES bpm_cards(id) ON DELETE CASCADE,
  from_phase_id UUID REFERENCES bpm_phases(id) ON DELETE SET NULL,
  to_phase_id UUID REFERENCES bpm_phases(id) ON DELETE SET NULL,
  moved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  action TEXT NOT NULL DEFAULT 'moved' CHECK (action IN ('created', 'moved', 'completed', 'reopened', 'assigned', 'field_updated'))
);

-- ===== CARD COMMENTS =====
CREATE TABLE IF NOT EXISTS bpm_card_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES bpm_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== TASK LINKS (Vínculo bidirecional BPM ↔ Board Cards) =====
CREATE TABLE IF NOT EXISTS bpm_task_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bpm_card_id UUID NOT NULL REFERENCES bpm_cards(id) ON DELETE CASCADE,
  board_card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  phase_id UUID NOT NULL REFERENCES bpm_phases(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE, -- FALSE quando fase avançou
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bpm_card_id, phase_id)
);

-- ===== AUTOMATIONS =====
CREATE TABLE IF NOT EXISTS bpm_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipe_id UUID NOT NULL REFERENCES bpm_pipes(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES bpm_phases(id) ON DELETE CASCADE, -- NULL = aplica a todas
  name TEXT NOT NULL DEFAULT 'Automação',
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'card_created', 'card_moved_to_phase', 'card_completed',
    'field_updated', 'sla_warning', 'sla_expired'
  )),
  action_type TEXT NOT NULL CHECK (action_type IN (
    'notify_chat', 'send_email', 'assign_user', 'move_to_phase',
    'create_board_task', 'call_webhook'
  )),
  config JSONB NOT NULL DEFAULT '{}', -- config específica da ação
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== AUTOMATION LOGS =====
CREATE TABLE IF NOT EXISTS bpm_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES bpm_automations(id) ON DELETE CASCADE,
  bpm_card_id UUID REFERENCES bpm_cards(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  details JSONB DEFAULT '{}',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== INDEXES =====
CREATE INDEX IF NOT EXISTS idx_bpm_pipes_org ON bpm_pipes(org_id);
CREATE INDEX IF NOT EXISTS idx_bpm_phases_pipe ON bpm_phases(pipe_id);
CREATE INDEX IF NOT EXISTS idx_bpm_fields_phase ON bpm_fields(phase_id);
CREATE INDEX IF NOT EXISTS idx_bpm_cards_pipe ON bpm_cards(pipe_id);
CREATE INDEX IF NOT EXISTS idx_bpm_cards_org ON bpm_cards(org_id);
CREATE INDEX IF NOT EXISTS idx_bpm_cards_phase ON bpm_cards(current_phase_id);
CREATE INDEX IF NOT EXISTS idx_bpm_cards_assignee ON bpm_cards(assignee_id);
CREATE INDEX IF NOT EXISTS idx_bpm_card_values_card ON bpm_card_values(card_id);
CREATE INDEX IF NOT EXISTS idx_bpm_card_values_field ON bpm_card_values(field_id);
CREATE INDEX IF NOT EXISTS idx_bpm_card_history_card ON bpm_card_history(card_id);
CREATE INDEX IF NOT EXISTS idx_bpm_task_links_bpm ON bpm_task_links(bpm_card_id);
CREATE INDEX IF NOT EXISTS idx_bpm_task_links_board ON bpm_task_links(board_card_id);
CREATE INDEX IF NOT EXISTS idx_bpm_card_values_value ON bpm_card_values USING GIN (value);

-- ===== RLS =====
ALTER TABLE bpm_pipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpm_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpm_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpm_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpm_card_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpm_card_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpm_card_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpm_task_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpm_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpm_automation_logs ENABLE ROW LEVEL SECURITY;

-- ===== RLS POLICIES: bpm_pipes =====
-- Admin/owner vê todos os pipes da org
CREATE POLICY "admins see all pipes"
  ON bpm_pipes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = bpm_pipes.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

-- Membros veem pipes onde são responsáveis em alguma fase ou criadores
CREATE POLICY "members see assigned pipes"
  ON bpm_pipes FOR SELECT
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM bpm_phases
      WHERE bpm_phases.pipe_id = bpm_pipes.id
        AND bpm_phases.default_assignee_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM bpm_cards
      WHERE bpm_cards.pipe_id = bpm_pipes.id
        AND bpm_cards.assignee_id = auth.uid()
    )
  );

-- Admin/owner pode criar/editar/deletar
CREATE POLICY "admins manage pipes"
  ON bpm_pipes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = bpm_pipes.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "admins update pipes"
  ON bpm_pipes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = bpm_pipes.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "admins delete pipes"
  ON bpm_pipes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = bpm_pipes.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

-- ===== RLS POLICIES: bpm_phases =====
-- Quem vê o pipe vê as fases
CREATE POLICY "pipe viewers see phases"
  ON bpm_phases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bpm_pipes
      WHERE bpm_pipes.id = bpm_phases.pipe_id
    )
  );

-- Admin pode gerenciar fases
CREATE POLICY "admins manage phases"
  ON bpm_phases FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM bpm_pipes
      JOIN org_members ON org_members.org_id = bpm_pipes.org_id
      WHERE bpm_pipes.id = bpm_phases.pipe_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

-- ===== RLS POLICIES: bpm_fields =====
CREATE POLICY "phase viewers see fields"
  ON bpm_fields FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bpm_phases
      WHERE bpm_phases.id = bpm_fields.phase_id
    )
  );

CREATE POLICY "admins manage fields"
  ON bpm_fields FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM bpm_phases
      JOIN bpm_pipes ON bpm_pipes.id = bpm_phases.pipe_id
      JOIN org_members ON org_members.org_id = bpm_pipes.org_id
      WHERE bpm_phases.id = bpm_fields.phase_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

-- ===== RLS POLICIES: bpm_cards =====
-- Admin vê todos os cards da org
CREATE POLICY "admins see all cards"
  ON bpm_cards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = bpm_cards.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

-- Membro vê cards onde é responsável ou criador
CREATE POLICY "members see own cards"
  ON bpm_cards FOR SELECT
  USING (
    created_by = auth.uid()
    OR assignee_id = auth.uid()
  );

-- Org members podem criar cards
CREATE POLICY "org members create cards"
  ON bpm_cards FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = bpm_cards.org_id
        AND org_members.user_id = auth.uid()
    )
  );

-- Admin ou responsável pode atualizar
CREATE POLICY "admins or assignee update cards"
  ON bpm_cards FOR UPDATE
  USING (
    assignee_id = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = bpm_cards.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

-- ===== RLS POLICIES: bpm_card_values =====
CREATE POLICY "card viewers see values"
  ON bpm_card_values FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bpm_cards
      WHERE bpm_cards.id = bpm_card_values.card_id
    )
  );

CREATE POLICY "card editors manage values"
  ON bpm_card_values FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM bpm_cards
      WHERE bpm_cards.id = bpm_card_values.card_id
        AND (
          bpm_cards.assignee_id = auth.uid()
          OR bpm_cards.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM org_members
            WHERE org_members.org_id = bpm_cards.org_id
              AND org_members.user_id = auth.uid()
              AND org_members.role IN ('owner', 'admin')
          )
        )
    )
  );

-- ===== RLS POLICIES: bpm_card_history =====
CREATE POLICY "card viewers see history"
  ON bpm_card_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bpm_cards
      WHERE bpm_cards.id = bpm_card_history.card_id
    )
  );

CREATE POLICY "org members create history"
  ON bpm_card_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bpm_cards
      JOIN org_members ON org_members.org_id = bpm_cards.org_id
      WHERE bpm_cards.id = bpm_card_history.card_id
        AND org_members.user_id = auth.uid()
    )
  );

-- ===== RLS POLICIES: bpm_card_comments =====
CREATE POLICY "card viewers see comments"
  ON bpm_card_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bpm_cards
      WHERE bpm_cards.id = bpm_card_comments.card_id
    )
  );

CREATE POLICY "org members add comments"
  ON bpm_card_comments FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own comments editable"
  ON bpm_card_comments FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "own comments deletable"
  ON bpm_card_comments FOR DELETE
  USING (user_id = auth.uid());

-- ===== RLS POLICIES: bpm_task_links =====
CREATE POLICY "org members see task links"
  ON bpm_task_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bpm_cards
      JOIN org_members ON org_members.org_id = bpm_cards.org_id
      WHERE bpm_cards.id = bpm_task_links.bpm_card_id
        AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "system manages task links"
  ON bpm_task_links FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM bpm_cards
      JOIN org_members ON org_members.org_id = bpm_cards.org_id
      WHERE bpm_cards.id = bpm_task_links.bpm_card_id
        AND org_members.user_id = auth.uid()
    )
  );

-- ===== RLS POLICIES: bpm_automations =====
CREATE POLICY "admins manage automations"
  ON bpm_automations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM bpm_pipes
      JOIN org_members ON org_members.org_id = bpm_pipes.org_id
      WHERE bpm_pipes.id = bpm_automations.pipe_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

-- ===== RLS POLICIES: bpm_automation_logs =====
CREATE POLICY "admins see automation logs"
  ON bpm_automation_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bpm_automations
      JOIN bpm_pipes ON bpm_pipes.id = bpm_automations.pipe_id
      JOIN org_members ON org_members.org_id = bpm_pipes.org_id
      WHERE bpm_automations.id = bpm_automation_logs.automation_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

-- ===== REALTIME =====
ALTER PUBLICATION supabase_realtime ADD TABLE bpm_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE bpm_card_history;

-- ===== UPDATED_AT TRIGGERS =====
CREATE TRIGGER update_bpm_pipes_updated_at
  BEFORE UPDATE ON bpm_pipes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bpm_phases_updated_at
  BEFORE UPDATE ON bpm_phases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bpm_cards_updated_at
  BEFORE UPDATE ON bpm_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bpm_card_comments_updated_at
  BEFORE UPDATE ON bpm_card_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bpm_automations_updated_at
  BEFORE UPDATE ON bpm_automations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
