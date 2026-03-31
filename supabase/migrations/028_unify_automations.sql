-- Migration 028: Unify automations
-- Expands the `automations` table to support BPM process automations too.
-- After migration, `bpm_automations` is no longer used (kept for safety).

-- 1. Add BPM-related columns to automations table
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS pipe_id UUID REFERENCES bpm_pipes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES bpm_phases(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS condition JSONB;

-- 2. Drop old CHECK constraints and add expanded ones
ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_trigger_type_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_type_check CHECK (trigger_type IN (
  'card_moved_to_column', 'card_created', 'card_overdue', 'card_completed',
  'progress_reached',
  'card_moved_to_phase', 'field_updated', 'sla_warning', 'sla_expired'
));

ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_action_type_check;
ALTER TABLE automations ADD CONSTRAINT automations_action_type_check CHECK (action_type IN (
  'mark_completed', 'set_priority', 'assign_member', 'send_notification', 'move_to_column',
  'notify_chat', 'send_email', 'assign_user', 'move_to_phase',
  'create_board_task', 'call_webhook'
));

-- 3. Expand automation_logs to support JSONB details and 'skipped' status
ALTER TABLE automation_logs DROP CONSTRAINT IF EXISTS automation_logs_status_check;
ALTER TABLE automation_logs ADD CONSTRAINT automation_logs_status_check CHECK (status IN ('success', 'error', 'skipped'));

-- Add bpm_card_id column to automation_logs for BPM tracking
ALTER TABLE automation_logs
  ADD COLUMN IF NOT EXISTS bpm_card_id UUID,
  ADD COLUMN IF NOT EXISTS details_json JSONB;

-- 4. Migrate existing bpm_automations into automations table
INSERT INTO automations (id, org_id, pipe_id, phase_id, name, is_active, trigger_type, trigger_config, action_type, action_config, condition, created_at, updated_at)
SELECT
  ba.id,
  bp.org_id,
  ba.pipe_id,
  ba.phase_id,
  ba.name,
  ba.is_active,
  ba.trigger_type,
  '{}'::jsonb,
  ba.action_type,
  ba.config,
  ba.config->'condition',
  ba.created_at,
  ba.updated_at
FROM bpm_automations ba
JOIN bpm_pipes bp ON bp.id = ba.pipe_id
ON CONFLICT (id) DO NOTHING;

-- 5. Migrate bpm_automation_logs into automation_logs
INSERT INTO automation_logs (id, automation_id, bpm_card_id, status, details_json, created_at)
SELECT
  bal.id,
  bal.automation_id,
  bal.bpm_card_id,
  bal.status,
  bal.details,
  bal.executed_at
FROM bpm_automation_logs bal
WHERE EXISTS (SELECT 1 FROM automations a WHERE a.id = bal.automation_id)
ON CONFLICT (id) DO NOTHING;
