import { SystemManager } from "../components/SystemManager";

export function SystemsPage() {
  return (
    <main className="systems-page">
      <div className="systems-page-header">
        <h2>Systems</h2>
        <p className="muted">
          Paste C++ source for a dynamical system — Slicer compiles and registers it
          automatically.
        </p>
      </div>
      <SystemManager />
    </main>
  );
}
