-- ================================================
-- Subtasks
-- ================================================

CREATE TABLE IF NOT EXISTS subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

-- RLS: org members with access to the board can view subtasks
CREATE POLICY "org members can view subtasks"
  ON subtasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM cards
      JOIN boards ON boards.id = cards.board_id
      JOIN org_members ON org_members.org_id = boards.org_id
      WHERE cards.id = subtasks.card_id
        AND org_members.user_id = auth.uid()
    )
  );

-- RLS: org members can create subtasks
CREATE POLICY "org members can create subtasks"
  ON subtasks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cards
      JOIN boards ON boards.id = cards.board_id
      JOIN org_members ON org_members.org_id = boards.org_id
      WHERE cards.id = subtasks.card_id
        AND org_members.user_id = auth.uid()
    )
  );

-- RLS: org members can update subtasks
CREATE POLICY "org members can update subtasks"
  ON subtasks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM cards
      JOIN boards ON boards.id = cards.board_id
      JOIN org_members ON org_members.org_id = boards.org_id
      WHERE cards.id = subtasks.card_id
        AND org_members.user_id = auth.uid()
    )
  );

-- RLS: org members can delete subtasks
CREATE POLICY "org members can delete subtasks"
  ON subtasks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM cards
      JOIN boards ON boards.id = cards.board_id
      JOIN org_members ON org_members.org_id = boards.org_id
      WHERE cards.id = subtasks.card_id
        AND org_members.user_id = auth.uid()
    )
  );
