-- LossTrak Initial Database Schema
-- Run this in your Supabase SQL editor to set up the database

-- ─── Loss Categories ────────────────────────────────────────────────
CREATE TABLE loss_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  allowed_loss_types TEXT[] NOT NULL DEFAULT ARRAY['shutdown', 'slowdown'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Loss Subcategories ─────────────────────────────────────────────
CREATE TABLE loss_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES loss_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_loss_subcategories_category ON loss_subcategories(category_id);

-- ─── Loss Detail Codes ──────────────────────────────────────────────
CREATE TABLE loss_detail_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcategory_id UUID NOT NULL REFERENCES loss_subcategories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_loss_detail_codes_subcategory ON loss_detail_codes(subcategory_id);

-- ─── Daily Logs ─────────────────────────────────────────────────────
CREATE TABLE daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  production NUMERIC NOT NULL DEFAULT 0,
  bar NUMERIC NOT NULL,
  delta NUMERIC GENERATED ALWAYS AS (bar - production) STORED,
  comments TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_logs_date ON daily_logs(date);
CREATE INDEX idx_daily_logs_status ON daily_logs(status);

-- ─── Loss Entries ───────────────────────────────────────────────────
CREATE TABLE loss_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_log_id UUID NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES loss_categories(id),
  subcategory_id UUID NOT NULL REFERENCES loss_subcategories(id),
  detail_code_id UUID REFERENCES loss_detail_codes(id),
  loss_type TEXT NOT NULL CHECK (loss_type IN ('shutdown', 'slowdown')),
  amount NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0),
  comments TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_loss_entries_daily_log ON loss_entries(daily_log_id);
CREATE INDEX idx_loss_entries_category ON loss_entries(category_id);

-- ─── App Config ─────────────────────────────────────────────────────
CREATE TABLE app_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Auto-update updated_at ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER daily_logs_updated_at
  BEFORE UPDATE ON daily_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ─── Seed Default Data ──────────────────────────────────────────────

-- Default categories
INSERT INTO loss_categories (name, display_order, allowed_loss_types) VALUES
  ('Grade Slate', 1, ARRAY['slowdown']),
  ('Process', 2, ARRAY['shutdown', 'slowdown']),
  ('Maintenance', 3, ARRAY['shutdown', 'slowdown']),
  ('External', 4, ARRAY['shutdown', 'slowdown']),
  ('Business', 5, ARRAY['shutdown', 'slowdown']);

-- Default subcategories
INSERT INTO loss_subcategories (category_id, name, display_order)
SELECT c.id, s.name, s.display_order
FROM loss_categories c
CROSS JOIN LATERAL (
  VALUES
    ('Grade Slate', 'Grade Change', 1),
    ('Grade Slate', 'Product Mix', 2),
    ('Grade Slate', 'Quality Adjustment', 3),
    ('Process', 'Fouling', 1),
    ('Process', 'Catalyst', 2),
    ('Process', 'Corrosion', 3),
    ('Process', 'Instrumentation', 4),
    ('Process', 'Process Upset', 5),
    ('Maintenance', 'Planned Maintenance', 1),
    ('Maintenance', 'Unplanned Maintenance', 2),
    ('Maintenance', 'Equipment Failure', 3),
    ('Maintenance', 'Turnaround', 4),
    ('External', 'Feedstock', 1),
    ('External', 'Utilities', 2),
    ('External', 'Weather', 3),
    ('External', 'Logistics', 4),
    ('Business', 'Market', 1),
    ('Business', 'Regulatory', 2),
    ('Business', 'Commercial', 3)
) AS s(cat_name, name, display_order)
WHERE c.name = s.cat_name;

-- Default config
INSERT INTO app_config (key, value) VALUES
  ('bar_rate', '1200'),
  ('production_unit', 'tonnes');
