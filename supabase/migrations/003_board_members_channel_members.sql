-- ============================================================
-- Migration 003: Board Members + Channel member improvements
-- ============================================================

-- Board Members table
CREATE TABLE IF NOT EXISTS board_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(board_id, user_id)
);

-- RLS for board_members
ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "board_members_select" ON board_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM org_members om
      JOIN boards b ON b.org_id = om.org_id
      WHERE b.id = board_members.board_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "board_members_insert" ON board_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      JOIN boards b ON b.org_id = om.org_id
      WHERE b.id = board_members.board_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.board_id = board_members.board_id
      AND bm.user_id = auth.uid()
      AND bm.role = 'admin'
    )
  );

CREATE POLICY "board_members_delete" ON board_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM org_members om
      JOIN boards b ON b.org_id = om.org_id
      WHERE b.id = board_members.board_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.board_id = board_members.board_id
      AND bm.user_id = auth.uid()
      AND bm.role = 'admin'
    )
  );

-- Index
CREATE INDEX IF NOT EXISTS idx_board_members_board ON board_members(board_id);
CREATE INDEX IF NOT EXISTS idx_board_members_user ON board_members(user_id);

-- Enable realtime for board_members
ALTER PUBLICATION supabase_realtime ADD TABLE board_members;
