-- ================================================
-- RLS Policies for teams and team_members
-- ================================================

-- Teams: org members can view teams in their org
CREATE POLICY "org members can view teams"
  ON teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = teams.org_id
        AND org_members.user_id = auth.uid()
    )
  );

-- Teams: org admins/owners can create teams
CREATE POLICY "org admins can create teams"
  ON teams FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = teams.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

-- Teams: org admins/owners or team leads can update teams
CREATE POLICY "admins or leads can update teams"
  ON teams FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = teams.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = teams.id
        AND team_members.user_id = auth.uid()
        AND team_members.role = 'lead'
    )
  );

-- Teams: org admins/owners can delete teams
CREATE POLICY "org admins can delete teams"
  ON teams FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = teams.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

-- Team Members: anyone in the org can view team members
CREATE POLICY "org members can view team members"
  ON team_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM teams
      JOIN org_members ON org_members.org_id = teams.org_id
      WHERE teams.id = team_members.team_id
        AND org_members.user_id = auth.uid()
    )
  );

-- Team Members: org admins/owners or team leads can add members
CREATE POLICY "admins or leads can add team members"
  ON team_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams
      JOIN org_members ON org_members.org_id = teams.org_id
      WHERE teams.id = team_members.team_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM team_members AS tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'lead'
    )
  );

-- Team Members: org admins/owners or team leads can update members (role change)
CREATE POLICY "admins or leads can update team members"
  ON team_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM teams
      JOIN org_members ON org_members.org_id = teams.org_id
      WHERE teams.id = team_members.team_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM team_members AS tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'lead'
    )
  );

-- Team Members: org admins/owners or team leads can remove members
CREATE POLICY "admins or leads can remove team members"
  ON team_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM teams
      JOIN org_members ON org_members.org_id = teams.org_id
      WHERE teams.id = team_members.team_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM team_members AS tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'lead'
    )
  );
