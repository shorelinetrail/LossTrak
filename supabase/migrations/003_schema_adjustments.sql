-- Schema adjustments for Supabase integration
-- Safe to run on existing databases

-- Allow draft loss entries (created before category is selected)
ALTER TABLE loss_entries ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE loss_entries ALTER COLUMN subcategory_id DROP NOT NULL;

-- Denormalized date on loss_entries for efficient filtering
ALTER TABLE loss_entries ADD COLUMN IF NOT EXISTS date DATE;

-- Backfill date from daily_logs for any existing rows
UPDATE loss_entries le
SET date = dl.date
FROM daily_logs dl
WHERE le.daily_log_id = dl.id
  AND le.date IS NULL;

-- Add operating_hours config if not present
INSERT INTO app_config (key, value) VALUES ('operating_hours', '24')
ON CONFLICT (key) DO NOTHING;
