-- ================================================
-- Granular Permissions: per user, per team, per module
-- ================================================

-- User-level permission overrides (per person per org)
CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Module access
  can_view_dashboard BOOLEAN DEFAULT NULL,        -- NULL = use role default
  can_view_dashboard_all BOOLEAN DEFAULT NULL,
  can_manage_automations BOOLEAN DEFAULT NULL,
  can_manage_integrations BOOLEAN DEFAULT NULL,
  can_access_settings BOOLEAN DEFAULT NULL,
  can_invite_members BOOLEAN DEFAULT NULL,
  can_create_boards BOOLEAN DEFAULT NULL,
  can_create_channels BOOLEAN DEFAULT NULL,
  can_delete_cards BOOLEAN DEFAULT NULL,
  can_manage_labels BOOLEAN DEFAULT NULL,
  can_view_calendar BOOLEAN DEFAULT NULL,
  can_create_cards BOOLEAN DEFAULT NULL,
  can_comment BOOLEAN DEFAULT NULL,
  board_visibility TEXT DEFAULT NULL CHECK (board_visibility IS NULL OR board_visibility IN ('own', 'team', 'all')),
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- Team-level permission overrides
CREATE TABLE IF NOT EXISTS team_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  -- Module access
  can_view_dashboard BOOLEAN DEFAULT NULL,
  can_manage_automations BOOLEAN DEFAULT NULL,
  can_manage_integrations BOOLEAN DEFAULT NULL,
  can_access_settings BOOLEAN DEFAULT NULL,
  can_invite_members BOOLEAN DEFAULT NULL,
  can_create_boards BOOLEAN DEFAULT NULL,
  can_create_channels BOOLEAN DEFAULT NULL,
  can_delete_cards BOOLEAN DEFAULT NULL,
  can_manage_labels BOOLEAN DEFAULT NULL,
  can_view_calendar BOOLEAN DEFAULT NULL,
  board_visibility TEXT DEFAULT NULL CHECK (board_visibility IS NULL OR board_visibility IN ('own', 'team', 'all')),
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, team_id)
);

-- RLS
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_permissions ENABLE ROW LEVEL SECURITY;

-- Admins can manage all permissions
CREATE POLICY "admins manage user permissions"
  ON user_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = user_permissions.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "users can view own permissions"
  ON user_permissions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "admins manage team permissions"
  ON team_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = team_permissions.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "org members can view team permissions"
  ON team_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = team_permissions.org_id
        AND org_members.user_id = auth.uid()
    )
  );
