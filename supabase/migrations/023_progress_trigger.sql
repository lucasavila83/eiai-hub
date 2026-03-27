-- Add 'progress_reached' trigger type to automations
ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_trigger_type_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_type_check CHECK (trigger_type IN (
  'card_moved_to_column',
  'card_created',
  'card_overdue',
  'card_completed',
  'progress_reached'
));
