-- ================================================
-- API Keys para acesso externo à API v1
-- ================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- Nome descritivo (ex: "App Mobile", "Zapier")
  key_hash TEXT NOT NULL UNIQUE,         -- SHA-256 do key (nunca armazenar plain text)
  key_prefix TEXT NOT NULL,              -- Primeiros 8 chars para identificação (ex: "eiai_ab12")
  scopes TEXT[] NOT NULL DEFAULT '{}',   -- Permissões: {"read:boards","write:cards",...}
  created_by UUID NOT NULL REFERENCES profiles(id),
  expires_at TIMESTAMPTZ,               -- NULL = não expira
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  rate_limit INT NOT NULL DEFAULT 100,   -- requests por minuto
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_org ON api_keys(org_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

-- Rate limiting log
CREATE TABLE IF NOT EXISTS api_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INT NOT NULL DEFAULT 1,
  UNIQUE(key_id, endpoint, window_start)
);

CREATE INDEX idx_api_rate_limits_key ON api_rate_limits(key_id, window_start);
CREATE INDEX idx_api_rate_limits_user ON api_rate_limits(user_id, window_start);

-- API request log (para analytics)
CREATE TABLE IF NOT EXISTS api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INT NOT NULL,
  response_time_ms INT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_logs_key ON api_logs(key_id, created_at);
CREATE INDEX idx_api_logs_created ON api_logs(created_at);

-- Limpar logs antigos (mais de 30 dias) - pode ser feito via cron
-- DELETE FROM api_logs WHERE created_at < now() - interval '30 days';
-- DELETE FROM api_rate_limits WHERE window_start < now() - interval '1 day';
