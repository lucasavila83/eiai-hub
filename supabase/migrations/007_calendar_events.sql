-- ================================================
-- Calendar Events
-- ================================================

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  location TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  card_id UUID REFERENCES cards(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Event participants
CREATE TABLE IF NOT EXISTS event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('accepted', 'declined', 'pending')),
  UNIQUE(event_id, user_id)
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;

-- RLS: org members can view events
CREATE POLICY "org members can view events"
  ON events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = events.org_id
        AND org_members.user_id = auth.uid()
    )
  );

-- RLS: org members can create events
CREATE POLICY "org members can create events"
  ON events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = events.org_id
        AND org_members.user_id = auth.uid()
    )
  );

-- RLS: creator or admins can update events
CREATE POLICY "creator or admins can update events"
  ON events FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = events.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

-- RLS: creator or admins can delete events
CREATE POLICY "creator or admins can delete events"
  ON events FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = events.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

-- RLS: participants can view their entries
CREATE POLICY "participants can view event_participants"
  ON event_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      JOIN org_members ON org_members.org_id = events.org_id
      WHERE events.id = event_participants.event_id
        AND org_members.user_id = auth.uid()
    )
  );

-- RLS: event creator or admins can manage participants
CREATE POLICY "creator or admins can manage participants"
  ON event_participants FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_participants.event_id
        AND (
          events.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM org_members
            WHERE org_members.org_id = events.org_id
              AND org_members.user_id = auth.uid()
              AND org_members.role IN ('owner', 'admin')
          )
        )
    )
  );

-- RLS: participants can update own status, creator/admins can update any
CREATE POLICY "participants can update own status"
  ON event_participants FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_participants.event_id
        AND (
          events.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM org_members
            WHERE org_members.org_id = events.org_id
              AND org_members.user_id = auth.uid()
              AND org_members.role IN ('owner', 'admin')
          )
        )
    )
  );

-- RLS: creator/admins can delete participants
CREATE POLICY "creator or admins can delete participants"
  ON event_participants FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_participants.event_id
        AND (
          events.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM org_members
            WHERE org_members.org_id = events.org_id
              AND org_members.user_id = auth.uid()
              AND org_members.role IN ('owner', 'admin')
          )
        )
    )
  );
