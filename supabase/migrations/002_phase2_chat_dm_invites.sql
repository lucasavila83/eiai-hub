-- ================================================
-- Fase 2: Chat, DMs, Convites, Unread tracking
-- ================================================

-- channel_members: políticas faltantes
CREATE POLICY "Membros podem ver channel_members da org"
  ON channel_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM channels c
      WHERE c.id = channel_members.channel_id
      AND is_org_member(c.org_id)
    )
  );

CREATE POLICY "Membros podem se adicionar a canais públicos"
  ON channel_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM channels c
      WHERE c.id = channel_id
      AND is_org_member(c.org_id)
    )
  );

CREATE POLICY "Membros podem atualizar seu last_read_at"
  ON channel_members FOR UPDATE
  USING (user_id = auth.uid());

-- invitations: admins podem criar
CREATE POLICY "Admins podem criar convites"
  ON invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id = invitations.org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- message_reactions: políticas
CREATE POLICY "Reactions visíveis para membros da org"
  ON message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN channels c ON c.id = m.channel_id
      WHERE m.id = message_reactions.message_id
      AND is_org_member(c.org_id)
    )
  );

CREATE POLICY "Membros podem adicionar reactions"
  ON message_reactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM messages m
      JOIN channels c ON c.id = m.channel_id
      WHERE m.id = message_id
      AND is_org_member(c.org_id)
    )
  );

CREATE POLICY "Membros podem remover próprias reactions"
  ON message_reactions FOR DELETE
  USING (user_id = auth.uid());

-- Notifications: sistema pode criar
CREATE POLICY "Sistema pode criar notificações"
  ON notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Realtime para channel_members (para unread tracking)
ALTER PUBLICATION supabase_realtime ADD TABLE channel_members;

-- Índice para buscar mensagens não lidas eficientemente
CREATE INDEX IF NOT EXISTS idx_channel_members_user_channel
  ON channel_members(user_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel_created
  ON messages(channel_id, created_at);
