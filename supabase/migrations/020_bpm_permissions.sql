-- ================================================
-- Add BPM process permissions to granular permission tables
-- ================================================

-- Add to org_permissions (role-based defaults)
ALTER TABLE org_permissions
  ADD COLUMN IF NOT EXISTS member_can_view_processes BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS member_can_manage_processes BOOLEAN DEFAULT FALSE;

-- Add to user_permissions (per-person overrides)
ALTER TABLE user_permissions
  ADD COLUMN IF NOT EXISTS can_view_processes_view BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_view_processes_edit BOOLEAN DEFAULT NULL;

-- Add to team_permissions (per-team overrides)
ALTER TABLE team_permissions
  ADD COLUMN IF NOT EXISTS can_view_processes_view BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_view_processes_edit BOOLEAN DEFAULT NULL;
