-- Migration 033: Redesign goals module
-- Budget goals: monthly table (Jan-Dec per year), visible only to admins + authorized members
-- Member goals: activity KPIs visible to the member + admins

-- Add visibility/sharing columns to budget_goals
ALTER TABLE budget_goals ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE budget_goals ADD COLUMN IF NOT EXISTS goal_type TEXT DEFAULT 'amount' CHECK (goal_type IN ('amount', 'quantity', 'percentage'));
ALTER TABLE budget_goals ADD COLUMN IF NOT EXISTS values_by_month JSONB DEFAULT '{}';
-- values_by_month: {"2026": {"01": 100, "02": 120, ...}, "2025": {...}}
ALTER TABLE budget_goals ADD COLUMN IF NOT EXISTS allowed_viewers UUID[] DEFAULT '{}';
-- allowed_viewers: specific member user_ids who can see this budget goal

-- Add year field to budget_goals (instead of year_month)
ALTER TABLE budget_goals ADD COLUMN IF NOT EXISTS year INTEGER;

-- Member goals: also monthly
ALTER TABLE member_goals ADD COLUMN IF NOT EXISTS values_by_month JSONB DEFAULT '{}';
-- values_by_month: {"01": target, "02": target, ...}
ALTER TABLE member_goals ADD COLUMN IF NOT EXISTS actuals_by_month JSONB DEFAULT '{}';
-- actuals_by_month: {"01": actual, "02": actual, ...}

-- Drop the old unique constraint and add a simpler one
ALTER TABLE budget_goals DROP CONSTRAINT IF EXISTS budget_goals_org_id_department_id_category_id_year_month_key;

-- Drop the old member_goals unique constraint
ALTER TABLE member_goals DROP CONSTRAINT IF EXISTS member_goals_org_id_user_id_goal_type_goal_name_year_month_key;
