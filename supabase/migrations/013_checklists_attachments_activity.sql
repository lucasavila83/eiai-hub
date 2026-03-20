-- ================================================
-- Checklists (individual checklists per card with items that have dates & assignees)
-- ================================================

CREATE TABLE IF NOT EXISTS checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Checklist',
  position INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  due_date DATE,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- Card Attachments
-- ================================================

CREATE TABLE IF NOT EXISTS card_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  file_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- Activity Logs (per card)
-- ================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'created', 'moved', 'priority_changed', 'assigned', 'commented', 'completed', 'attachment_added', etc.
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- RLS Policies
-- ================================================

ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Checklists: board members can access via card -> board -> org
CREATE POLICY "board members can manage checklists" ON checklists FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM cards c
    JOIN boards b ON b.id = c.board_id
    JOIN org_members om ON om.org_id = b.org_id
    WHERE c.id = checklists.card_id AND om.user_id = auth.uid()
  )
);

CREATE POLICY "board members can manage checklist_items" ON checklist_items FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM checklists cl
    JOIN cards c ON c.id = cl.card_id
    JOIN boards b ON b.id = c.board_id
    JOIN org_members om ON om.org_id = b.org_id
    WHERE cl.id = checklist_items.checklist_id AND om.user_id = auth.uid()
  )
);

CREATE POLICY "board members can manage attachments" ON card_attachments FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM cards c
    JOIN boards b ON b.id = c.board_id
    JOIN org_members om ON om.org_id = b.org_id
    WHERE c.id = card_attachments.card_id AND om.user_id = auth.uid()
  )
);

CREATE POLICY "board members can manage activity_logs" ON activity_logs FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM cards c
    JOIN boards b ON b.id = c.board_id
    JOIN org_members om ON om.org_id = b.org_id
    WHERE c.id = activity_logs.card_id AND om.user_id = auth.uid()
  )
);
