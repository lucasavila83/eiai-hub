-- Migration 031: Goals module — budget goals (financial) + member goals (KPIs)

-- 1. Budget goals (metas financeiras por departamento/categoria/mês)
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

-- 2. Member goals (KPIs individuais)
CREATE TABLE IF NOT EXISTS member_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('tasks_completed', 'sla_met', 'avg_time', 'custom')),
  goal_name TEXT NOT NULL,
  target_value NUMERIC(15,2) NOT NULL,
  current_value NUMERIC(15,2) DEFAULT 0,
  year_month TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id, goal_type, goal_name, year_month)
);

-- RLS
ALTER TABLE budget_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_goals ENABLE ROW LEVEL SECURITY;

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
CREATE INDEX IF NOT EXISTS idx_budget_goals_org_month ON budget_goals(org_id, year_month);
CREATE INDEX IF NOT EXISTS idx_member_goals_user_month ON member_goals(user_id, year_month);
