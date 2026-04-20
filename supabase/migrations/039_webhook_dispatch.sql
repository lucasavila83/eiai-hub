-- ================================================
-- Migration 039: Outbound Webhook Dispatch System
-- ================================================
-- Adds:
--   1. integrations.filters column (jsonb) for per-integration filtering
--      (e.g. fire only for a specific pipe/phase/board/column)
--   2. webhook_deliveries table (log every dispatch attempt)
--   3. app_settings table (stores webhook_intake_url + shared secret)
--   4. pg_net-based trigger functions that POST row changes to our intake endpoint
--   5. Triggers on cards, bpm_cards, messages, org_members, card_comments,
--      bpm_card_comments, events
-- ================================================

-- Required extensions
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ================================================
-- 1. Add filters column to integrations
-- ================================================
ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS filters JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN integrations.filters IS
  'Per-integration filters. Shape: {"pipe_id":"...","phase_id":"...","to_phase_id":"...","board_id":"...","column_id":"...","to_column_id":"..."}. Only fires when filter keys match event context. Empty = no filter (all events of subscribed types fire).';

-- ================================================
-- 2. webhook_deliveries — log of every webhook attempt
-- ================================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  target_url TEXT NOT NULL,
  request_body JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  error TEXT,
  duration_ms INTEGER,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_integration
  ON webhook_deliveries (integration_id, delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_org
  ON webhook_deliveries (org_id, delivered_at DESC);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org admins view deliveries"
  ON webhook_deliveries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = webhook_deliveries.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

-- Auto-prune: keep only last 500 deliveries per integration
CREATE OR REPLACE FUNCTION prune_webhook_deliveries()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM webhook_deliveries wd
   WHERE wd.integration_id = NEW.integration_id
     AND wd.id NOT IN (
       SELECT id FROM webhook_deliveries
        WHERE integration_id = NEW.integration_id
        ORDER BY delivered_at DESC
        LIMIT 500
     );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prune_webhook_deliveries_trigger ON webhook_deliveries;
CREATE TRIGGER prune_webhook_deliveries_trigger
  AFTER INSERT ON webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION prune_webhook_deliveries();

-- ================================================
-- 3. app_settings — stores webhook intake URL + shared secret
-- ================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
-- No policy: only service_role can access.

-- Seed defaults (user must update the secret after migration)
INSERT INTO app_settings (key, value) VALUES
  ('webhook_intake_url', 'https://eiai-hub.vercel.app/api/events/webhook-intake'),
  ('webhook_intake_secret', 'CHANGE_ME_AFTER_MIGRATION')
ON CONFLICT (key) DO NOTHING;

-- ================================================
-- 4. Trigger function: POSTs row change to intake endpoint via pg_net
-- ================================================
CREATE OR REPLACE FUNCTION notify_webhook_intake()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
  v_payload JSONB;
BEGIN
  SELECT value INTO v_url FROM app_settings WHERE key = 'webhook_intake_url';
  SELECT value INTO v_secret FROM app_settings WHERE key = 'webhook_intake_secret';

  -- Short-circuit if not configured
  IF v_url IS NULL OR v_secret IS NULL OR v_secret = 'CHANGE_ME_AFTER_MIGRATION' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_payload := jsonb_build_object(
    'op', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END,
    'old_record', CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    'ts', extract(epoch from now())
  );

  -- Fire-and-forget: pg_net is async, so this won't block the transaction
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Secret', v_secret
    ),
    body := v_payload,
    timeout_milliseconds := 5000
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Never break the parent transaction if webhook dispatch fails
  RAISE WARNING 'notify_webhook_intake failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ================================================
-- 5. Attach triggers to relevant tables
-- ================================================

-- Kanban cards
DROP TRIGGER IF EXISTS cards_webhook_intake ON cards;
CREATE TRIGGER cards_webhook_intake
  AFTER INSERT OR UPDATE OR DELETE ON cards
  FOR EACH ROW EXECUTE FUNCTION notify_webhook_intake();

-- BPM cards (processes)
DROP TRIGGER IF EXISTS bpm_cards_webhook_intake ON bpm_cards;
CREATE TRIGGER bpm_cards_webhook_intake
  AFTER INSERT OR UPDATE OR DELETE ON bpm_cards
  FOR EACH ROW EXECUTE FUNCTION notify_webhook_intake();

-- Chat messages
DROP TRIGGER IF EXISTS messages_webhook_intake ON messages;
CREATE TRIGGER messages_webhook_intake
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION notify_webhook_intake();

-- Org members (joined)
DROP TRIGGER IF EXISTS org_members_webhook_intake ON org_members;
CREATE TRIGGER org_members_webhook_intake
  AFTER INSERT ON org_members
  FOR EACH ROW EXECUTE FUNCTION notify_webhook_intake();

-- Card comments (kanban)
DROP TRIGGER IF EXISTS card_comments_webhook_intake ON card_comments;
CREATE TRIGGER card_comments_webhook_intake
  AFTER INSERT ON card_comments
  FOR EACH ROW EXECUTE FUNCTION notify_webhook_intake();

-- BPM card comments
DROP TRIGGER IF EXISTS bpm_card_comments_webhook_intake ON bpm_card_comments;
CREATE TRIGGER bpm_card_comments_webhook_intake
  AFTER INSERT ON bpm_card_comments
  FOR EACH ROW EXECUTE FUNCTION notify_webhook_intake();

-- Calendar events
DROP TRIGGER IF EXISTS events_webhook_intake ON events;
CREATE TRIGGER events_webhook_intake
  AFTER INSERT OR UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION notify_webhook_intake();

-- Card assignees (to detect card.assigned / card.unassigned)
DROP TRIGGER IF EXISTS card_assignees_webhook_intake ON card_assignees;
CREATE TRIGGER card_assignees_webhook_intake
  AFTER INSERT OR DELETE ON card_assignees
  FOR EACH ROW EXECUTE FUNCTION notify_webhook_intake();
