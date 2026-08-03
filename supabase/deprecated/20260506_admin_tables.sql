-- Run this in Supabase SQL Editor or via supabase db push

-- 1. role column on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- 2. Prompt versioning
CREATE TABLE IF NOT EXISTS agent_prompts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name   TEXT        NOT NULL,
  prompt_content TEXT      NOT NULL,
  version      INT         NOT NULL DEFAULT 1,
  is_active    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_prompts_name_active  ON agent_prompts(agent_name, is_active);
CREATE INDEX IF NOT EXISTS idx_agent_prompts_name_version ON agent_prompts(agent_name, version DESC);

-- 3. Usage / cost logs (written by each agent route on every call)
CREATE TABLE IF NOT EXISTS usage_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name   TEXT        NOT NULL,
  project_id   TEXT,
  user_id      UUID,
  input_tokens  INT,
  output_tokens INT,
  cost_usd     NUMERIC(10,6),
  duration_ms  INT,
  error        TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_logs_agent_created ON usage_logs(agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created       ON usage_logs(created_at DESC);

-- 4. RLS: only service role (admin API) can write usage_logs; admins can read both tables
ALTER TABLE agent_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs    ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — all writes from API routes use SUPABASE_SERVICE_ROLE_KEY.
-- For anon/auth reads, no policies = no access (admin routes use service role anyway).
