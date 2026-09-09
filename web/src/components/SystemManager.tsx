import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { deleteSystem, listSystems, uploadSystem } from "../api/client";
import { HENON_SYSTEM_EXAMPLE } from "../lib/systemExample";
import type { SystemDefinition, SystemsResponse } from "../types";
import { SystemGuide } from "./SystemGuide";

interface UploadFormState {
  source: string;
  description: string;
  defaultStartingPoint: string;
}

const emptyForm = (): UploadFormState => ({
  source: "",
  description: "",
  defaultStartingPoint: "",
});

function parseApiError(message: string): string {
  try {
    const payload = JSON.parse(message) as { detail?: string };
    if (typeof payload.detail === "string") {
      return payload.detail;
    }
  } catch {
    /* use raw message */
  }
  return message;
}

function SystemCard({
  name,
  definition,
  onDelete,
  busy,
}: {
  name: string;
  definition: SystemDefinition;
  onDelete: (name: string) => void;
  busy: boolean;
}) {
  return (
    <article className="system-card">
      <div className="system-card-header">
        <h3>
          {name}
          {definition.builtin && <span className="system-badge">built-in</span>}
        </h3>
        {definition.can_delete && (
          <button
            type="button"
            className="danger btn-sm"
            disabled={busy}
            onClick={() => onDelete(name)}
          >
            Delete
          </button>
        )}
      </div>
      {definition.reference ? (
        <p className="system-card-desc">
          <a href={definition.reference.url} target="_blank" rel="noreferrer">
            {definition.reference.citation}
          </a>
        </p>
      ) : (
        definition.description && <p className="system-card-desc">{definition.description}</p>
      )}
      <dl className="system-card-meta">
        <div>
          <dt>Parameters</dt>
          <dd>{definition.parameters.join(", ")}</dd>
        </div>
        <div>
          <dt>Variables</dt>
          <dd>{definition.variables.join(", ")}</dd>
        </div>
        {definition.default_starting_point && (
          <div>
            <dt>Default IC</dt>
            <dd>{definition.default_starting_point.join(", ")}</dd>
          </div>
        )}
      </dl>

    </article>
  );
}

export function SystemManager() {
  const [systems, setSystems] = useState<SystemsResponse>({});
  const [form, setForm] = useState<UploadFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSystems();
      setSystems(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.source.trim()) {
      setError("Paste C++ source code for the system plugin");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await uploadSystem({
        source: form.source,
        description: form.description.trim() || undefined,
        defaultStartingPoint: form.defaultStartingPoint.trim() || undefined,
      });
      const uploadedName = Object.keys(result)[0] ?? "system";
      setForm(emptyForm());
      setSuccess(`System "${uploadedName}" compiled and registered successfully.`);
      await refresh();
    } catch (err) {
      setError(parseApiError(err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(name: string) {
    if (!window.confirm(`Delete system "${name}"? This removes the plugin and registry entry.`)) {
      return;
    }
    setDeleting(name);
    setError(null);
    setSuccess(null);
    try {
      await deleteSystem(name);
      setSuccess(`System "${name}" deleted.`);
      await refresh();
    } catch (err) {
      setError(parseApiError(err instanceof Error ? err.message : String(err)));
    } finally {
      setDeleting(null);
    }
  }

  const systemNames = Object.keys(systems).sort();

  return (
    <div className="system-manager">
      <SystemGuide />

      <section className="system-upload-panel">
        <div className="section-header">
          <h2>Upload system</h2>
          <span className="muted">C++ source — compiled on the server</span>
        </div>

        <form className="system-upload-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>C++ source</span>
            <textarea
              required
              className="system-source-input"
              spellCheck={false}
              placeholder={HENON_SYSTEM_EXAMPLE}
              value={form.source}
              disabled={submitting}
              onChange={(event) =>
                setForm((current) => ({ ...current, source: event.target.value }))
              }
            />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Description (optional)</span>
              <input
                placeholder="Short label for the UI"
                value={form.description}
                disabled={submitting}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Default starting point (optional)</span>
              <input
                placeholder="0.1, 0.0"
                value={form.defaultStartingPoint}
                disabled={submitting}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    defaultStartingPoint: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="system-upload-actions">
            <button
              type="button"
              className="secondary"
              disabled={submitting}
              onClick={() => setForm((current) => ({ ...current, source: HENON_SYSTEM_EXAMPLE }))}
            >
              Load example
            </button>
            <button type="submit" disabled={submitting}>
              {submitting ? "Compiling…" : "Compile & register"}
            </button>
          </div>
        </form>
      </section>

      {error && <pre className="error-box">{error}</pre>}
      {success && (
        <div className="success-panel">
          <p className="success-box">{success}</p>
          <Link className="sidebar-link" to="/">
            Open Explorer
          </Link>
        </div>
      )}

      <section className="system-list-panel">
        <div className="section-header">
          <h2>Installed systems</h2>
          <span className="muted">{systemNames.length} total</span>
        </div>

        {loading ? (
          <p className="muted">Loading systems…</p>
        ) : systemNames.length === 0 ? (
          <p className="muted">No systems registered yet.</p>
        ) : (
          <div className="system-card-grid">
            {systemNames.map((name) => (
              <SystemCard
                key={name}
                name={name}
                definition={systems[name]!}
                onDelete={handleDelete}
                busy={deleting === name}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
