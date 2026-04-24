-- ================================================
-- Migration 043: Web Push subscriptions
-- ================================================
-- Stores browser push subscriptions per user so we can send notifications
-- when they receive chat messages, are mentioned, or get new tasks.
-- ================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,   -- public key from subscription.keys.p256dh
  auth TEXT NOT NULL,     -- auth secret from subscription.keys.auth
  user_agent TEXT,        -- for debugging / UI ("iPhone Safari", "Chrome Windows")
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can see/manage only their own subscriptions
CREATE POLICY "users manage own push subs"
  ON push_subscriptions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
