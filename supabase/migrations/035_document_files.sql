-- Migration: Add file/link support to board_documents + create bpm_card_documents
-- board_documents gains document_type, file_url, file_name, file_size, file_type
-- bpm_card_documents mirrors the same structure for BPM process cards

-- ============================================================
-- 1. Extend board_documents with file support
-- ============================================================
ALTER TABLE board_documents
  ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'text'
    CHECK (document_type IN ('text', 'file', 'link')),
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS file_type TEXT;

-- ============================================================
-- 2. Create bpm_card_documents (same structure, linked to bpm_cards)
-- ============================================================
CREATE TABLE IF NOT EXISTS bpm_card_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES bpm_cards(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES board_document_folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  icon TEXT DEFAULT '📄',
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  document_type TEXT NOT NULL DEFAULT 'text'
    CHECK (document_type IN ('text', 'file', 'link')),
  file_url TEXT,
  file_name TEXT,
  file_size BIGINT,
  file_type TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bpm_card_documents_card ON bpm_card_documents(card_id);
CREATE INDEX IF NOT EXISTS idx_bpm_card_documents_org ON bpm_card_documents(org_id);

-- RLS
ALTER TABLE bpm_card_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bpm_card_documents_select" ON bpm_card_documents
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "bpm_card_documents_insert" ON bpm_card_documents
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "bpm_card_documents_update" ON bpm_card_documents
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "bpm_card_documents_delete" ON bpm_card_documents
  FOR DELETE USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- 3. Storage bucket for board/bpm document files
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('documents', 'documents', true, 52428800)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "documents_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');

CREATE POLICY "documents_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents' AND auth.role() = 'authenticated');

CREATE POLICY "documents_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'documents' AND auth.role() = 'authenticated');
