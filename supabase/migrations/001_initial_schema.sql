-- ================================================
-- EIAI Hub - Schema Inicial
-- ================================================

-- Extensões necessárias

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================
-- TABELA: organizations
-- ================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- TABELA: profiles (espelha auth.users)
-- ================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  is_ai_agent BOOLEAN NOT NULL DEFAULT FALSE,
  agent_config JSONB,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'offline', 'dnd')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- TABELA: org_members
-- ================================================
CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'guest')),
  invited_by UUID REFERENCES profiles(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- ================================================
-- TABELA: teams
-- ================================================
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- TABELA: team_members
-- ================================================
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member')),
  UNIQUE(team_id, user_id)
);

-- ================================================
-- TABELA: channels
-- ================================================
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'public' CHECK (type IN ('public', 'private', 'dm')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- TABELA: channel_members
-- ================================================
CREATE TABLE IF NOT EXISTS channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notifications TEXT NOT NULL DEFAULT 'all' CHECK (notifications IN ('all', 'mentions', 'none')),
  UNIQUE(channel_id, user_id)
);

-- ================================================
-- TABELA: messages
-- ================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  reply_to UUID REFERENCES messages(id) ON DELETE SET NULL,
  is_thread_root BOOLEAN NOT NULL DEFAULT FALSE,
  thread_count INTEGER NOT NULL DEFAULT 0,
  mentions UUID[] NOT NULL DEFAULT '{}',
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- TABELA: message_reactions
-- ================================================
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

-- ================================================
-- TABELA: boards
-- ================================================
CREATE TABLE IF NOT EXISTS boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'team' CHECK (visibility IN ('public', 'team', 'private')),
  settings JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- TABELA: columns
-- ================================================
CREATE TABLE IF NOT EXISTS columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#6366f1',
  wip_limit INTEGER,
  is_done_column BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- TABELA: cards
-- ================================================
CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id UUID NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'none' CHECK (priority IN ('urgent', 'high', 'medium', 'low', 'none')),
  due_date DATE,
  position INTEGER NOT NULL DEFAULT 0,
  cover_color TEXT,
  estimated_hours NUMERIC,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- TABELA: card_assignees
-- ================================================
CREATE TABLE IF NOT EXISTS card_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(card_id, user_id)
);

-- ================================================
-- TABELA: card_comments
-- ================================================
CREATE TABLE IF NOT EXISTS card_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- TABELA: labels
-- ================================================
CREATE TABLE IF NOT EXISTS labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- TABELA: card_labels (junction)
-- ================================================
CREATE TABLE IF NOT EXISTS card_labels (
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);

-- ================================================
-- TABELA: notifications
-- ================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- TABELA: invitations
-- ================================================
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token TEXT UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- ÍNDICES
-- ================================================
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_cards_column_id ON cards(column_id);
CREATE INDEX IF NOT EXISTS idx_cards_board_id ON cards(board_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_channels_org_id ON channels(org_id);

-- ================================================
-- FUNÇÕES E TRIGGERS
-- ================================================

-- Atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cards_updated_at
  BEFORE UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_card_comments_updated_at
  BEFORE UPDATE ON card_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Criar perfil automaticamente ao registrar usuário
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ================================================
-- ROW LEVEL SECURITY (RLS)
-- ================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Função auxiliar: verificar se usuário é membro da org
CREATE OR REPLACE FUNCTION is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.org_id = $1
    AND org_members.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Políticas: profiles
CREATE POLICY "Profiles são visíveis para membros da mesma org"
  ON profiles FOR SELECT
  USING (
    id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM org_members om1
      JOIN org_members om2 ON om1.org_id = om2.org_id
      WHERE om1.user_id = auth.uid() AND om2.user_id = profiles.id
    )
  );

CREATE POLICY "Usuário pode atualizar próprio perfil"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Políticas: organizations
CREATE POLICY "Org visível para membros"
  ON organizations FOR SELECT
  USING (is_org_member(id));

CREATE POLICY "Qualquer usuário autenticado pode criar org"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins podem atualizar org"
  ON organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id = organizations.id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Políticas: org_members
CREATE POLICY "Membros podem ver outros membros da mesma org"
  ON org_members FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "Usuário pode se adicionar como owner ao criar org"
  ON org_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Políticas: channels
CREATE POLICY "Canais visíveis para membros da org"
  ON channels FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "Membros podem criar canais"
  ON channels FOR INSERT
  WITH CHECK (is_org_member(org_id));

-- Políticas: messages
CREATE POLICY "Mensagens visíveis para membros da org do canal"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM channels c
      WHERE c.id = messages.channel_id
      AND is_org_member(c.org_id)
    )
  );

CREATE POLICY "Membros podem enviar mensagens"
  ON messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM channels c
      WHERE c.id = channel_id
      AND is_org_member(c.org_id)
    )
  );

CREATE POLICY "Autor pode editar/deletar própria mensagem"
  ON messages FOR UPDATE
  USING (user_id = auth.uid());

-- Políticas: boards
CREATE POLICY "Boards visíveis para membros da org"
  ON boards FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "Membros podem criar boards"
  ON boards FOR INSERT
  WITH CHECK (is_org_member(org_id));

CREATE POLICY "Membros podem atualizar boards"
  ON boards FOR UPDATE
  USING (is_org_member(org_id));

-- Políticas: columns
CREATE POLICY "Colunas visíveis para membros da org do board"
  ON columns FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM boards b
      WHERE b.id = columns.board_id
      AND is_org_member(b.org_id)
    )
  );

CREATE POLICY "Membros podem criar colunas"
  ON columns FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM boards b
      WHERE b.id = board_id
      AND is_org_member(b.org_id)
    )
  );

CREATE POLICY "Membros podem atualizar colunas"
  ON columns FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM boards b
      WHERE b.id = columns.board_id
      AND is_org_member(b.org_id)
    )
  );

-- Políticas: cards
CREATE POLICY "Cards visíveis para membros da org"
  ON cards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM boards b
      WHERE b.id = cards.board_id
      AND is_org_member(b.org_id)
    )
  );

CREATE POLICY "Membros podem criar cards"
  ON cards FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM boards b
      WHERE b.id = board_id
      AND is_org_member(b.org_id)
    )
  );

CREATE POLICY "Membros podem atualizar cards"
  ON cards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM boards b
      WHERE b.id = cards.board_id
      AND is_org_member(b.org_id)
    )
  );

-- Políticas: notifications
CREATE POLICY "Usuário vê apenas suas notificações"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Usuário pode marcar suas notificações como lidas"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

-- Políticas: card_assignees
CREATE POLICY "Assignees visíveis para membros da org"
  ON card_assignees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM cards ca
      JOIN boards b ON b.id = ca.board_id
      WHERE ca.id = card_assignees.card_id
      AND is_org_member(b.org_id)
    )
  );

CREATE POLICY "Membros podem adicionar assignees"
  ON card_assignees FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cards ca
      JOIN boards b ON b.id = ca.board_id
      WHERE ca.id = card_id
      AND is_org_member(b.org_id)
    )
  );

-- Políticas: card_comments
CREATE POLICY "Comentários visíveis para membros da org"
  ON card_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM cards ca
      JOIN boards b ON b.id = ca.board_id
      WHERE ca.id = card_comments.card_id
      AND is_org_member(b.org_id)
    )
  );

CREATE POLICY "Membros podem comentar"
  ON card_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM cards ca
      JOIN boards b ON b.id = ca.board_id
      WHERE ca.id = card_id
      AND is_org_member(b.org_id)
    )
  );

-- Políticas: invitations
CREATE POLICY "Admins podem ver convites da org"
  ON invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id = invitations.org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Qualquer um pode ver convite pelo token (para aceitar)"
  ON invitations FOR SELECT
  USING (TRUE);

-- ================================================
-- REALTIME
-- ================================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE cards;
ALTER PUBLICATION supabase_realtime ADD TABLE channels;
