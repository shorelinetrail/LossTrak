-- Multi-Site / Multi-Plant Support
-- Adds sites and plants hierarchy. Categories remain global.
-- Subcategories, daily logs, and loss entries become plant-scoped.

-- ─── New Tables ─────────────────────────────────────────────────────

CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE plants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plants_site ON plants(site_id);

-- ─── Add plant_id to existing tables (nullable for migration) ──────

ALTER TABLE loss_subcategories ADD COLUMN plant_id UUID REFERENCES plants(id);
ALTER TABLE daily_logs ADD COLUMN plant_id UUID REFERENCES plants(id);
ALTER TABLE loss_entries ADD COLUMN plant_id UUID REFERENCES plants(id);

-- ─── Seed default site and plant ────────────────────────────────────

INSERT INTO sites (id, name, display_order)
  VALUES ('00000000-0000-0000-0000-000000000001', 'Default Site', 1);

INSERT INTO plants (id, site_id, name, display_order)
  VALUES ('00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000001',
          'Default Plant', 1);

-- ─── Backfill existing data to default plant ────────────────────────

UPDATE loss_subcategories
  SET plant_id = '00000000-0000-0000-0000-000000000002'
  WHERE plant_id IS NULL;

UPDATE daily_logs
  SET plant_id = '00000000-0000-0000-0000-000000000002'
  WHERE plant_id IS NULL;

UPDATE loss_entries
  SET plant_id = '00000000-0000-0000-0000-000000000002'
  WHERE plant_id IS NULL;

-- ─── Make plant_id NOT NULL ─────────────────────────────────────────

ALTER TABLE loss_subcategories ALTER COLUMN plant_id SET NOT NULL;
ALTER TABLE daily_logs ALTER COLUMN plant_id SET NOT NULL;
ALTER TABLE loss_entries ALTER COLUMN plant_id SET NOT NULL;

-- ─── Fix daily_logs UNIQUE constraint: (plant_id, date) ────────────

ALTER TABLE daily_logs DROP CONSTRAINT daily_logs_date_key;
ALTER TABLE daily_logs ADD CONSTRAINT daily_logs_plant_date_unique UNIQUE (plant_id, date);

-- ─── Indexes ────────────────────────────────────────────────────────

CREATE INDEX idx_loss_subcategories_plant ON loss_subcategories(plant_id);
CREATE INDEX idx_daily_logs_plant ON daily_logs(plant_id);
CREATE INDEX idx_loss_entries_plant ON loss_entries(plant_id);

-- ─── Migrate config to plant-scoped keys ────────────────────────────

UPDATE app_config SET key = 'plant:00000000-0000-0000-0000-000000000002:' || key
  WHERE key IN ('bar_rate', 'production_unit', 'operating_hours');

-- Store last selected plant
INSERT INTO app_config (key, value) VALUES
  ('selected_plant_id', '00000000-0000-0000-0000-000000000002');
