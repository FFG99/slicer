CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_type TEXT NOT NULL,
    system          TEXT NOT NULL,
    parameters      JSONB NOT NULL DEFAULT '{}',
    frame           JSONB,
    status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
    progress        DOUBLE PRECISION,
    artifact_key    TEXT,
    parent_run_id   UUID REFERENCES runs (id) ON DELETE SET NULL,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_runs_system ON runs (system);
CREATE INDEX idx_runs_calculation_type ON runs (calculation_type);
CREATE INDEX idx_runs_status ON runs (status);
CREATE INDEX idx_runs_parent_run_id ON runs (parent_run_id);
CREATE INDEX idx_runs_created_at ON runs (created_at DESC);
CREATE INDEX idx_runs_parameters ON runs USING GIN (parameters);
CREATE INDEX idx_runs_frame ON runs USING GIN (frame);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER runs_updated_at
    BEFORE UPDATE ON runs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
