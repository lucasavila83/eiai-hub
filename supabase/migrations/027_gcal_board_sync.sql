-- Migration 027: Google Calendar ↔ Board sync
-- Adds board selection for calendar sync + google_event_id on cards

-- Column to store which boards to sync (per user per org)
ALTER TABLE google_calendar_tokens
  ADD COLUMN IF NOT EXISTS synced_board_ids UUID[] DEFAULT '{}';

-- Track Google Calendar event ID on cards (for synced due dates)
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_synced_at TIMESTAMPTZ;
