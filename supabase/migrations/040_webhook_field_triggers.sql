-- ================================================
-- Migration 040: Webhook triggers for BPM field values
-- ================================================
-- Adds INSERT/UPDATE triggers on bpm_card_values so that webhooks can
-- fire when a custom field on a BPM card gets filled or updated.
-- ================================================

DROP TRIGGER IF EXISTS bpm_card_values_webhook_intake ON bpm_card_values;
CREATE TRIGGER bpm_card_values_webhook_intake
  AFTER INSERT OR UPDATE ON bpm_card_values
  FOR EACH ROW EXECUTE FUNCTION notify_webhook_intake();
