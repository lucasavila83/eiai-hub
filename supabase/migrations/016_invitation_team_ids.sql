-- Add team_ids to invitations so teams can be pre-assigned at invite time
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS team_ids UUID[] DEFAULT '{}';
