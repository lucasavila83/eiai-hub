-- ================================================
-- Migration 041: DELETE RLS policies for BPM tables
-- ================================================
-- Root cause: bpm_cards has RLS ENABLED but no policy for DELETE, which
-- means the Supabase client silently returns 0 rows on delete and the
-- record stays in the database. Cards appeared to "come back" because
-- the optimistic state removal was reverted on next realtime refresh.
-- ================================================

-- Admin/owner can delete any card in their org
DROP POLICY IF EXISTS "admins delete cards" ON bpm_cards;
CREATE POLICY "admins delete cards"
  ON bpm_cards FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = bpm_cards.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );

-- Card creator can delete their own cards
DROP POLICY IF EXISTS "creators delete own cards" ON bpm_cards;
CREATE POLICY "creators delete own cards"
  ON bpm_cards FOR DELETE
  USING (created_by = auth.uid());

-- Related tables have ON DELETE CASCADE, but user-initiated clears
-- on bpm_card_values / bpm_card_comments need their own DELETE policies
-- so users can (e.g.) clear a field or remove their own comment.

DROP POLICY IF EXISTS "card editors delete values" ON bpm_card_values;
CREATE POLICY "card editors delete values"
  ON bpm_card_values FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM bpm_cards c
      WHERE c.id = bpm_card_values.card_id
        AND (
          c.assignee_id = auth.uid()
          OR c.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM org_members
            WHERE org_members.org_id = c.org_id
              AND org_members.user_id = auth.uid()
              AND org_members.role IN ('owner', 'admin')
          )
        )
    )
  );

DROP POLICY IF EXISTS "comment authors delete own" ON bpm_card_comments;
CREATE POLICY "comment authors delete own"
  ON bpm_card_comments FOR DELETE
  USING (user_id = auth.uid());
