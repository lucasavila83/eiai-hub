-- Per-user DM hiding: move from channels.is_archived to channel_members.is_hidden
ALTER TABLE channel_members ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- Update trigger: un-hide for ALL members of the DM (not just one user)
CREATE OR REPLACE FUNCTION auto_unarchive_dm_on_message()
RETURNS TRIGGER AS $$
BEGIN
  -- Un-hide the DM for all members when a new message arrives
  UPDATE channel_members
  SET is_hidden = false
  WHERE channel_id = NEW.channel_id
    AND is_hidden = true
    AND EXISTS (
      SELECT 1 FROM channels
      WHERE id = NEW.channel_id AND type = 'dm'
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
