-- Apply on existing databases that were created before progress tracking.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS progress DOUBLE PRECISION;
