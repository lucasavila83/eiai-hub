-- ================================================
-- Restrict boards visibility by role and board settings
-- Admins/owners see all, members see based on visibility
-- ================================================

-- Drop old permissive policy
DROP POLICY IF EXISTS "Boards visíveis para membros da org" ON boards;

-- New policy: visibility-aware board access
CREATE POLICY "boards visibility by role and settings"
  ON boards FOR SELECT
  USING (
    -- Admins/owners see everything in their org
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = boards.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
    OR
    -- Creator always sees their own boards
    created_by = auth.uid()
    OR
    -- Public boards visible to all org members
    (
      visibility = 'public'
      AND EXISTS (
        SELECT 1 FROM org_members
        WHERE org_members.org_id = boards.org_id
          AND org_members.user_id = auth.uid()
      )
    )
    OR
    -- Team boards visible to team members
    (
      visibility = 'team'
      AND team_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM team_members
        WHERE team_members.team_id = boards.team_id
          AND team_members.user_id = auth.uid()
      )
    )
    OR
    -- Board members can always see boards they're added to
    EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = boards.id
        AND board_members.user_id = auth.uid()
    )
  );
