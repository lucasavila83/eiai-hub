-- ================================================
-- Automations
-- ================================================

CREATE TABLE IF NOT EXISTS automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'card_moved_to_column',
    'card_created',
    'card_overdue',
    'card_completed'
  )),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  action_type TEXT NOT NULL CHECK (action_type IN (
    'mark_completed',
    'set_priority',
    'assign_member',
    'send_notification',
    'move_to_column'
  )),
  action_config JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Automation execution log
CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error')),
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

-- RLS: org members can view automations
CREATE POLICY "org members can view automations"
  ON automations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = automations.org_id
        AND org_members.user_id = auth.uid()
    )
  );

-- RLS: admins/owners can manage automations
CREATE POLICY "admins can create automations"
  ON automations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = automations.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "admins can update automations"
  ON automations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = automations.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "admins can delete automations"
  ON automations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = automations.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

-- RLS: org members can view logs
CREATE POLICY "org members can view automation logs"
  ON automation_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM automations
      JOIN org_members ON org_members.org_id = automations.org_id
      WHERE automations.id = automation_logs.automation_id
        AND org_members.user_id = auth.uid()
    )
  );

-- RLS: system can insert logs (service role or via automation runner)
CREATE POLICY "authenticated can insert automation logs"
  ON automation_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM automations
      JOIN org_members ON org_members.org_id = automations.org_id
      WHERE automations.id = automation_logs.automation_id
        AND org_members.user_id = auth.uid()
    )
  );
