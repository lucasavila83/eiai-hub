-- ================================================
-- Separate VIEW and EDIT permissions for granular control
-- ================================================

-- Add _view and _edit columns to user_permissions
ALTER TABLE user_permissions
  ADD COLUMN IF NOT EXISTS can_view_dashboard_view BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_view_dashboard_edit BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_manage_automations_view BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_manage_automations_edit BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_manage_integrations_view BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_manage_integrations_edit BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_access_settings_view BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_access_settings_edit BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_view_boards_view BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_view_boards_edit BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_view_calendar_view BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_view_calendar_edit BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_view_chat_view BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_view_chat_edit BOOLEAN DEFAULT NULL;

-- Add _view and _edit columns to team_permissions
ALTER TABLE team_permissions
  ADD COLUMN IF NOT EXISTS can_view_dashboard_view BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_view_dashboard_edit BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_manage_automations_view BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_manage_automations_edit BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_manage_integrations_view BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_manage_integrations_edit BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_access_settings_view BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_access_settings_edit BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_view_boards_view BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_view_boards_edit BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_view_calendar_view BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_view_calendar_edit BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_view_chat_view BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS can_view_chat_edit BOOLEAN DEFAULT NULL;

-- Add view/edit scope to org_permissions for role-based defaults
ALTER TABLE org_permissions
  ADD COLUMN IF NOT EXISTS member_can_edit_own_only BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS guest_can_edit_own_only BOOLEAN DEFAULT TRUE;
