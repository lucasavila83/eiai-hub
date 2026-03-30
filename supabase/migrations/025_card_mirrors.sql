-- Card Mirroring: allows a card to be mirrored to a hub board
-- When a member assigns a task to someone who has a hub board,
-- a mirror copy is created there. Completion syncs back.

-- Mark a board as someone's hub (one per user per org)
ALTER TABLE boards ADD COLUMN IF NOT EXISTS hub_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Mirror links between cards
CREATE TABLE IF NOT EXISTS card_mirrors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  mirror_card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  source_board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  mirror_board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_card_id, mirror_board_id)
);

-- RLS
ALTER TABLE card_mirrors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view mirrors"
  ON card_mirrors FOR SELECT
  USING (
    source_board_id IN (SELECT id FROM boards WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()))
    OR mirror_board_id IN (SELECT id FROM boards WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()))
  );

CREATE POLICY "Authenticated users can manage mirrors"
  ON card_mirrors FOR ALL
  USING (true);
