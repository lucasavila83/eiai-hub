-- ================================================
-- Restrict events visibility: members see only their own events
-- Admins/owners see all events in org
-- ================================================

-- Drop old permissive policy
DROP POLICY IF EXISTS "org members can view events" ON events;

-- New policy: admins see all, members see only their own + events they're participants of
CREATE POLICY "events visibility by role"
  ON events FOR SELECT
  USING (
    -- Admins/owners see everything in their org
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = events.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
    OR
    -- Creator always sees their own events
    created_by = auth.uid()
    OR
    -- Participants can see events they're invited to
    EXISTS (
      SELECT 1 FROM event_participants
      WHERE event_participants.event_id = events.id
        AND event_participants.user_id = auth.uid()
    )
  );
