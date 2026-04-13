-- Create chat-files storage bucket (previously created manually)
-- No MIME type restriction — accept all file types
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-files', 'chat-files', true, 10485760, NULL)
ON CONFLICT (id) DO UPDATE SET
  allowed_mime_types = NULL,
  file_size_limit = 10485760;

-- Storage policies for chat-files (IF NOT EXISTS to avoid errors if already created manually)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'chat_files_select' AND tablename = 'objects') THEN
    CREATE POLICY "chat_files_select" ON storage.objects FOR SELECT USING (bucket_id = 'chat-files');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'chat_files_insert' AND tablename = 'objects') THEN
    CREATE POLICY "chat_files_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-files' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'chat_files_delete' AND tablename = 'objects') THEN
    CREATE POLICY "chat_files_delete" ON storage.objects FOR DELETE USING (bucket_id = 'chat-files' AND auth.role() = 'authenticated');
  END IF;
END $$;
