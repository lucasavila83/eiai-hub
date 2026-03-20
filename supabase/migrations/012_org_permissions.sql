-- ================================================
-- Organization Permissions / Role Settings
-- ================================================

CREATE TABLE IF NOT EXISTS org_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Board visibility: 'own' = only assigned cards, 'team' = team boards, 'all' = everything
  member_board_visibility TEXT NOT NULL DEFAULT 'all' CHECK (member_board_visibility IN ('own', 'team', 'all')),
  guest_board_visibility TEXT NOT NULL DEFAULT 'own' CHECK (guest_board_visibility IN ('own', 'team', 'all')),
  -- What members can do
  member_can_create_boards BOOLEAN NOT NULL DEFAULT TRUE,
  member_can_create_channels BOOLEAN NOT NULL DEFAULT TRUE,
  member_can_invite_members BOOLEAN NOT NULL DEFAULT FALSE,
  member_can_manage_automations BOOLEAN NOT NULL DEFAULT FALSE,
  member_can_manage_integrations BOOLEAN NOT NULL DEFAULT FALSE,
  member_can_view_dashboard BOOLEAN NOT NULL DEFAULT TRUE,
  member_can_delete_cards BOOLEAN NOT NULL DEFAULT TRUE,
  member_can_manage_labels BOOLEAN NOT NULL DEFAULT TRUE,
  -- What guests can do
  guest_can_create_cards BOOLEAN NOT NULL DEFAULT TRUE,
  guest_can_comment BOOLEAN NOT NULL DEFAULT TRUE,
  guest_can_view_calendar BOOLEAN NOT NULL DEFAULT TRUE,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One permission set per org
  UNIQUE(org_id)
);

ALTER TABLE org_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view permissions"
  ON org_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_permissions.org_id
        AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "admins can manage permissions"
  ON org_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_permissions.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

-- Insert default permissions for existing orgs
INSERT INTO org_permissions (org_id)
SELECT id FROM organizations
ON CONFLICT (org_id) DO NOTHING;
