-- ================================================
-- Board Documents / Playbooks
-- ================================================

-- Folders for organizing documents
CREATE TABLE IF NOT EXISTS board_document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📁',
  position INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Documents
CREATE TABLE IF NOT EXISTS board_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES board_document_folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  icon TEXT DEFAULT '📄',
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_board_documents_board ON board_documents(board_id);
CREATE INDEX IF NOT EXISTS idx_board_documents_folder ON board_documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_board_document_folders_board ON board_document_folders(board_id);

-- RLS
ALTER TABLE board_document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage document folders" ON board_document_folders FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM boards b
    JOIN org_members om ON om.org_id = b.org_id
    WHERE b.id = board_document_folders.board_id AND om.user_id = auth.uid()
  )
);

CREATE POLICY "org members can manage documents" ON board_documents FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM boards b
    JOIN org_members om ON om.org_id = b.org_id
    WHERE b.id = board_documents.board_id AND om.user_id = auth.uid()
  )
);
