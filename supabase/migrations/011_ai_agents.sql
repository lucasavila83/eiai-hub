-- ================================================
-- AI Agents Configuration
-- ================================================

CREATE TABLE IF NOT EXISTS ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  personality TEXT NOT NULL DEFAULT 'helpful',
  instructions TEXT,
  auto_respond BOOLEAN NOT NULL DEFAULT FALSE,
  respond_in_channels TEXT[] NOT NULL DEFAULT '{}',
  trigger_keywords TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view ai_agents"
  ON ai_agents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = ai_agents.org_id
        AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "admins can create ai_agents"
  ON ai_agents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = ai_agents.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "admins can update ai_agents"
  ON ai_agents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = ai_agents.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "admins can delete ai_agents"
  ON ai_agents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = ai_agents.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );
