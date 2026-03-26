-- Add org_members to realtime publication so sidebar updates
-- when new members join the organization
ALTER PUBLICATION supabase_realtime ADD TABLE org_members;
