-- Fix RLS: remove recursive policies and create non-recursive ones

-- Drop ALL existing BPM policies
DROP POLICY IF EXISTS "admins see all pipes" ON bpm_pipes;
DROP POLICY IF EXISTS "members see assigned pipes" ON bpm_pipes;
DROP POLICY IF EXISTS "admins manage pipes" ON bpm_pipes;
DROP POLICY IF EXISTS "admins update pipes" ON bpm_pipes;
DROP POLICY IF EXISTS "admins delete pipes" ON bpm_pipes;
DROP POLICY IF EXISTS "pipe viewers see phases" ON bpm_phases;
DROP POLICY IF EXISTS "admins manage phases" ON bpm_phases;
DROP POLICY IF EXISTS "phase viewers see fields" ON bpm_fields;
DROP POLICY IF EXISTS "admins manage fields" ON bpm_fields;
DROP POLICY IF EXISTS "admins see all cards" ON bpm_cards;
DROP POLICY IF EXISTS "members see own cards" ON bpm_cards;
DROP POLICY IF EXISTS "org members create cards" ON bpm_cards;
DROP POLICY IF EXISTS "admins or assignee update cards" ON bpm_cards;
DROP POLICY IF EXISTS "card viewers see values" ON bpm_card_values;
DROP POLICY IF EXISTS "card editors manage values" ON bpm_card_values;
DROP POLICY IF EXISTS "card viewers see history" ON bpm_card_history;
DROP POLICY IF EXISTS "org members create history" ON bpm_card_history;
DROP POLICY IF EXISTS "card viewers see comments" ON bpm_card_comments;
DROP POLICY IF EXISTS "org members add comments" ON bpm_card_comments;
DROP POLICY IF EXISTS "own comments editable" ON bpm_card_comments;
DROP POLICY IF EXISTS "own comments deletable" ON bpm_card_comments;
DROP POLICY IF EXISTS "org members see task links" ON bpm_task_links;
DROP POLICY IF EXISTS "system manages task links" ON bpm_task_links;
DROP POLICY IF EXISTS "admins manage automations" ON bpm_automations;
DROP POLICY IF EXISTS "admins see automation logs" ON bpm_automation_logs;

-- bpm_pipes: simple org membership check (no recursion)
CREATE POLICY "org members see pipes" ON bpm_pipes FOR SELECT USING (
  EXISTS (SELECT 1 FROM org_members WHERE org_members.org_id = bpm_pipes.org_id AND org_members.user_id = auth.uid())
);
CREATE POLICY "admins insert pipes" ON bpm_pipes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM org_members WHERE org_members.org_id = bpm_pipes.org_id AND org_members.user_id = auth.uid() AND org_members.role IN ('owner','admin'))
);
CREATE POLICY "admins update pipes" ON bpm_pipes FOR UPDATE USING (
  EXISTS (SELECT 1 FROM org_members WHERE org_members.org_id = bpm_pipes.org_id AND org_members.user_id = auth.uid() AND org_members.role IN ('owner','admin'))
);
CREATE POLICY "admins delete pipes" ON bpm_pipes FOR DELETE USING (
  EXISTS (SELECT 1 FROM org_members WHERE org_members.org_id = bpm_pipes.org_id AND org_members.user_id = auth.uid() AND org_members.role IN ('owner','admin'))
);

-- bpm_phases: join through bpm_pipes -> org_members
CREATE POLICY "org members see phases" ON bpm_phases FOR SELECT USING (
  EXISTS (SELECT 1 FROM bpm_pipes JOIN org_members ON org_members.org_id = bpm_pipes.org_id WHERE bpm_pipes.id = bpm_phases.pipe_id AND org_members.user_id = auth.uid())
);
CREATE POLICY "admins insert phases" ON bpm_phases FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM bpm_pipes JOIN org_members ON org_members.org_id = bpm_pipes.org_id WHERE bpm_pipes.id = bpm_phases.pipe_id AND org_members.user_id = auth.uid() AND org_members.role IN ('owner','admin'))
);
CREATE POLICY "admins update phases" ON bpm_phases FOR UPDATE USING (
  EXISTS (SELECT 1 FROM bpm_pipes JOIN org_members ON org_members.org_id = bpm_pipes.org_id WHERE bpm_pipes.id = bpm_phases.pipe_id AND org_members.user_id = auth.uid() AND org_members.role IN ('owner','admin'))
);
CREATE POLICY "admins delete phases" ON bpm_phases FOR DELETE USING (
  EXISTS (SELECT 1 FROM bpm_pipes JOIN org_members ON org_members.org_id = bpm_pipes.org_id WHERE bpm_pipes.id = bpm_phases.pipe_id AND org_members.user_id = auth.uid() AND org_members.role IN ('owner','admin'))
);

-- bpm_fields: join through bpm_phases -> bpm_pipes -> org_members
CREATE POLICY "org members see fields" ON bpm_fields FOR SELECT USING (
  EXISTS (SELECT 1 FROM bpm_phases JOIN bpm_pipes ON bpm_pipes.id = bpm_phases.pipe_id JOIN org_members ON org_members.org_id = bpm_pipes.org_id WHERE bpm_phases.id = bpm_fields.phase_id AND org_members.user_id = auth.uid())
);
CREATE POLICY "admins insert fields" ON bpm_fields FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM bpm_phases JOIN bpm_pipes ON bpm_pipes.id = bpm_phases.pipe_id JOIN org_members ON org_members.org_id = bpm_pipes.org_id WHERE bpm_phases.id = bpm_fields.phase_id AND org_members.user_id = auth.uid() AND org_members.role IN ('owner','admin'))
);
CREATE POLICY "admins update fields" ON bpm_fields FOR UPDATE USING (
  EXISTS (SELECT 1 FROM bpm_phases JOIN bpm_pipes ON bpm_pipes.id = bpm_phases.pipe_id JOIN org_members ON org_members.org_id = bpm_pipes.org_id WHERE bpm_phases.id = bpm_fields.phase_id AND org_members.user_id = auth.uid() AND org_members.role IN ('owner','admin'))
);
CREATE POLICY "admins delete fields" ON bpm_fields FOR DELETE USING (
  EXISTS (SELECT 1 FROM bpm_phases JOIN bpm_pipes ON bpm_pipes.id = bpm_phases.pipe_id JOIN org_members ON org_members.org_id = bpm_pipes.org_id WHERE bpm_phases.id = bpm_fields.phase_id AND org_members.user_id = auth.uid() AND org_members.role IN ('owner','admin'))
);

-- bpm_cards: simple org membership (no recursion)
CREATE POLICY "org members see cards" ON bpm_cards FOR SELECT USING (
  EXISTS (SELECT 1 FROM org_members WHERE org_members.org_id = bpm_cards.org_id AND org_members.user_id = auth.uid())
);
CREATE POLICY "org members create cards" ON bpm_cards FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM org_members WHERE org_members.org_id = bpm_cards.org_id AND org_members.user_id = auth.uid())
);
CREATE POLICY "org members update cards" ON bpm_cards FOR UPDATE USING (
  EXISTS (SELECT 1 FROM org_members WHERE org_members.org_id = bpm_cards.org_id AND org_members.user_id = auth.uid())
);

-- bpm_card_values: join through bpm_cards -> org_members
CREATE POLICY "org members see card values" ON bpm_card_values FOR SELECT USING (
  EXISTS (SELECT 1 FROM bpm_cards JOIN org_members ON org_members.org_id = bpm_cards.org_id WHERE bpm_cards.id = bpm_card_values.card_id AND org_members.user_id = auth.uid())
);
CREATE POLICY "org members insert card values" ON bpm_card_values FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM bpm_cards JOIN org_members ON org_members.org_id = bpm_cards.org_id WHERE bpm_cards.id = bpm_card_values.card_id AND org_members.user_id = auth.uid())
);
CREATE POLICY "org members update card values" ON bpm_card_values FOR UPDATE USING (
  EXISTS (SELECT 1 FROM bpm_cards JOIN org_members ON org_members.org_id = bpm_cards.org_id WHERE bpm_cards.id = bpm_card_values.card_id AND org_members.user_id = auth.uid())
);

-- bpm_card_history
CREATE POLICY "org members see card history" ON bpm_card_history FOR SELECT USING (
  EXISTS (SELECT 1 FROM bpm_cards JOIN org_members ON org_members.org_id = bpm_cards.org_id WHERE bpm_cards.id = bpm_card_history.card_id AND org_members.user_id = auth.uid())
);
CREATE POLICY "org members create card history" ON bpm_card_history FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM bpm_cards JOIN org_members ON org_members.org_id = bpm_cards.org_id WHERE bpm_cards.id = bpm_card_history.card_id AND org_members.user_id = auth.uid())
);

-- bpm_card_comments
CREATE POLICY "org members see card comments" ON bpm_card_comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM bpm_cards JOIN org_members ON org_members.org_id = bpm_cards.org_id WHERE bpm_cards.id = bpm_card_comments.card_id AND org_members.user_id = auth.uid())
);
CREATE POLICY "org members add card comments" ON bpm_card_comments FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own comments edit" ON bpm_card_comments FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "own comments delete" ON bpm_card_comments FOR DELETE USING (user_id = auth.uid());

-- bpm_task_links
CREATE POLICY "org members see task links" ON bpm_task_links FOR SELECT USING (
  EXISTS (SELECT 1 FROM bpm_cards JOIN org_members ON org_members.org_id = bpm_cards.org_id WHERE bpm_cards.id = bpm_task_links.bpm_card_id AND org_members.user_id = auth.uid())
);
CREATE POLICY "org members insert task links" ON bpm_task_links FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM bpm_cards JOIN org_members ON org_members.org_id = bpm_cards.org_id WHERE bpm_cards.id = bpm_task_links.bpm_card_id AND org_members.user_id = auth.uid())
);
CREATE POLICY "org members update task links" ON bpm_task_links FOR UPDATE USING (
  EXISTS (SELECT 1 FROM bpm_cards JOIN org_members ON org_members.org_id = bpm_cards.org_id WHERE bpm_cards.id = bpm_task_links.bpm_card_id AND org_members.user_id = auth.uid())
);

-- bpm_automations
CREATE POLICY "admins see automations" ON bpm_automations FOR SELECT USING (
  EXISTS (SELECT 1 FROM bpm_pipes JOIN org_members ON org_members.org_id = bpm_pipes.org_id WHERE bpm_pipes.id = bpm_automations.pipe_id AND org_members.user_id = auth.uid() AND org_members.role IN ('owner','admin'))
);
CREATE POLICY "admins insert automations" ON bpm_automations FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM bpm_pipes JOIN org_members ON org_members.org_id = bpm_pipes.org_id WHERE bpm_pipes.id = bpm_automations.pipe_id AND org_members.user_id = auth.uid() AND org_members.role IN ('owner','admin'))
);
CREATE POLICY "admins update automations" ON bpm_automations FOR UPDATE USING (
  EXISTS (SELECT 1 FROM bpm_pipes JOIN org_members ON org_members.org_id = bpm_pipes.org_id WHERE bpm_pipes.id = bpm_automations.pipe_id AND org_members.user_id = auth.uid() AND org_members.role IN ('owner','admin'))
);
CREATE POLICY "admins delete automations" ON bpm_automations FOR DELETE USING (
  EXISTS (SELECT 1 FROM bpm_pipes JOIN org_members ON org_members.org_id = bpm_pipes.org_id WHERE bpm_pipes.id = bpm_automations.pipe_id AND org_members.user_id = auth.uid() AND org_members.role IN ('owner','admin'))
);

-- bpm_automation_logs
CREATE POLICY "admins see automation logs" ON bpm_automation_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM bpm_automations JOIN bpm_pipes ON bpm_pipes.id = bpm_automations.pipe_id JOIN org_members ON org_members.org_id = bpm_pipes.org_id WHERE bpm_automations.id = bpm_automation_logs.automation_id AND org_members.user_id = auth.uid() AND org_members.role IN ('owner','admin'))
);
CREATE POLICY "system insert automation logs" ON bpm_automation_logs FOR INSERT WITH CHECK (true);
