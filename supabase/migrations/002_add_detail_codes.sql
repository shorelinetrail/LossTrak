-- Add detail codes: a third level of categorisation below subcategories
-- This migration is safe to run on databases created from 001_initial_schema.sql

-- ─── Loss Detail Codes table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loss_detail_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcategory_id UUID NOT NULL REFERENCES loss_subcategories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loss_detail_codes_subcategory
  ON loss_detail_codes(subcategory_id);

-- ─── Add optional detail_code_id to loss_entries ────────────────────
ALTER TABLE loss_entries
  ADD COLUMN IF NOT EXISTS detail_code_id UUID REFERENCES loss_detail_codes(id);
