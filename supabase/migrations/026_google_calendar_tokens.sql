-- Store Google OAuth tokens per user per org
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE TRIGGER set_google_calendar_tokens_updated_at
  BEFORE UPDATE ON google_calendar_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tokens"
  ON google_calendar_tokens FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own tokens"
  ON google_calendar_tokens FOR ALL
  USING (user_id = auth.uid());

-- Track synced events to avoid duplicates
ALTER TABLE events ADD COLUMN IF NOT EXISTS google_event_id TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS google_synced_at TIMESTAMPTZ;
