-- Loss entry duration capture + audit timestamp.
--
-- duration_hours: when an Ops Engineer enters a loss in hours (or days),
-- the original duration is kept here alongside the converted production
-- amount, so duration-based analysis (hours lost per cause) is possible.
--
-- updated_at: loss entries are editable while a day is open (and after
-- reopening); track when they last changed.
--
-- Safe, additive migration — run before deploying the build that writes
-- duration_hours.

ALTER TABLE loss_entries
  ADD COLUMN IF NOT EXISTS duration_hours NUMERIC CHECK (duration_hours >= 0);

ALTER TABLE loss_entries
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS loss_entries_updated_at ON loss_entries;
CREATE TRIGGER loss_entries_updated_at
  BEFORE UPDATE ON loss_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
