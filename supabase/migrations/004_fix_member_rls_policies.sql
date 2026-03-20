-- ============================================================
-- Migration 004: Fix RLS policies for channel_members and board_members
-- ============================================================

-- Fix channel_members INSERT: allow org members to add others to channels
-- (needed when creating a channel and adding members)
DROP POLICY IF EXISTS "Membros podem se adicionar a canais públicos" ON channel_members;

CREATE POLICY "Org members podem adicionar membros a canais"
  ON channel_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM channels c
      WHERE c.id = channel_id
      AND is_org_member(c.org_id)
    )
  );

-- Fix board_members INSERT: allow any org member to add board members
-- (not just org admins — board admins and the creator should also be able to)
DROP POLICY IF EXISTS "board_members_insert" ON board_members;

CREATE POLICY "board_members_insert" ON board_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      JOIN boards b ON b.org_id = om.org_id
      WHERE b.id = board_members.board_id
      AND om.user_id = auth.uid()
    )
  );

-- Fix board_members DELETE: allow any org member to remove board members
DROP POLICY IF EXISTS "board_members_delete" ON board_members;

CREATE POLICY "board_members_delete" ON board_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM org_members om
      JOIN boards b ON b.org_id = om.org_id
      WHERE b.id = board_members.board_id
      AND om.user_id = auth.uid()
    )
  );

-- Add UPDATE policy for board_members (role changes)
CREATE POLICY "board_members_update" ON board_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM org_members om
      JOIN boards b ON b.org_id = om.org_id
      WHERE b.id = board_members.board_id
      AND om.user_id = auth.uid()
    )
  );
