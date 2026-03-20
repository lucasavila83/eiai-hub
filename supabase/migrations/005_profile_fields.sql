-- Add new profile fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS job_title text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text;
