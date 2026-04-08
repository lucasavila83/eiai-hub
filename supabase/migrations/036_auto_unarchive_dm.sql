CREATE OR REPLACE FUNCTION auto_unarchive_dm_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE channels
  SET is_archived = false
  WHERE id = NEW.channel_id
    AND type = 'dm'
    AND is_archived = true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_unarchive_dm ON messages;
CREATE TRIGGER trg_auto_unarchive_dm
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION auto_unarchive_dm_on_message();
