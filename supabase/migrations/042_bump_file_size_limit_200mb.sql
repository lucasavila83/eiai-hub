-- ================================================
-- Migration 042: bump storage bucket file size limit to 200 MB
-- ================================================
-- Raises both chat-files and documents buckets from 50 MB (52428800 bytes)
-- to 200 MB (209715200 bytes). Must match the frontend MAX_FILE_SIZE.
-- ================================================

UPDATE storage.buckets
   SET file_size_limit = 209715200  -- 200 * 1024 * 1024
 WHERE id IN ('chat-files', 'documents');
