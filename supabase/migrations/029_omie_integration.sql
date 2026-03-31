-- Migration 029: OMIE Integration — categories, departments, config
-- Syncs categories and departments from OMIE ERP into eiai-hub

-- 1. OMIE API config per organization (multiple companies supported)
CREATE TABLE IF NOT EXISTS omie_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  app_key TEXT NOT NULL,
  app_secret TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, app_key)
);

-- 2. OMIE Categories (receitas + despesas)
CREATE TABLE IF NOT EXISTS omie_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  omie_app_key TEXT NOT NULL,
  codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  categoria_superior TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa', 'transferencia', 'outro')),
  totalizadora BOOLEAN DEFAULT false,
  conta_inativa BOOLEAN DEFAULT false,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, omie_app_key, codigo)
);

-- 3. OMIE Departments
CREATE TABLE IF NOT EXISTS omie_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  omie_app_key TEXT NOT NULL,
  omie_codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  estrutura TEXT,
  inativo BOOLEAN DEFAULT false,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, omie_app_key, omie_codigo)
);

-- 4. Budget goals (metas financeiras por departamento/categoria/mes)
CREATE TABLE IF NOT EXISTS budget_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id UUID REFERENCES omie_departments(id) ON DELETE SET NULL,
  category_id UUID REFERENCES omie_categories(id) ON DELETE SET NULL,
  year_month TEXT NOT NULL, -- '2026-03'
  limit_amount NUMERIC(15,2) NOT NULL,
  alert_percent INTEGER DEFAULT 80,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, department_id, category_id, year_month)
);

-- 5. Member goals (KPIs individuais)
CREATE TABLE IF NOT EXISTS member_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('tasks_completed', 'sla_met', 'avg_time', 'custom')),
  goal_name TEXT NOT NULL,
  target_value NUMERIC(15,2) NOT NULL,
  year_month TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id, goal_type, year_month)
);

-- RLS
ALTER TABLE omie_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE omie_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE omie_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_goals ENABLE ROW LEVEL SECURITY;

-- omie_config: admins can manage, members can view
CREATE POLICY "org members view omie_config" ON omie_config
  FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "admins manage omie_config" ON omie_config
  FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- omie_categories: members can view, service role manages
CREATE POLICY "org members view omie_categories" ON omie_categories
  FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "service manages omie_categories" ON omie_categories
  FOR ALL USING (true);

-- omie_departments: members can view, service role manages
CREATE POLICY "org members view omie_departments" ON omie_departments
  FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "service manages omie_departments" ON omie_departments
  FOR ALL USING (true);

-- budget_goals: admins manage, members can view
CREATE POLICY "org members view budget_goals" ON budget_goals
  FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
CREATE POLICY "admins manage budget_goals" ON budget_goals
  FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- member_goals: admins manage, members can view own
CREATE POLICY "members view own goals" ON member_goals
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );
CREATE POLICY "admins manage member_goals" ON member_goals
  FOR ALL USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_omie_categories_org ON omie_categories(org_id);
CREATE INDEX IF NOT EXISTS idx_omie_categories_tipo ON omie_categories(org_id, tipo);
CREATE INDEX IF NOT EXISTS idx_omie_departments_org ON omie_departments(org_id);
CREATE INDEX IF NOT EXISTS idx_budget_goals_org_month ON budget_goals(org_id, year_month);
CREATE INDEX IF NOT EXISTS idx_member_goals_user_month ON member_goals(user_id, year_month);
