import { HENON_SYSTEM_EXAMPLE, REGISTRY_EXAMPLE } from "../lib/systemExample";

const BUILD_STEPS = [
  {
    title: "Implement SystemBase",
    body: "Write a C++ class with evaluate(), get_name(), get_parameter_names(), and get_variable_names(). Register it with SLICER_REGISTER_SYSTEM.",
  },
  {
    title: "Paste the source below",
    body: "Copy your .cpp file into the upload form. Slicer compiles it on the server for the current platform — no manual build step needed.",
  },
  {
    title: "Metadata is automatic",
    body: "After compilation, Slicer reads the system name, parameters, and variables directly from the plugin. You can optionally add a description and default starting point.",
  },
];

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="guide-code-wrap">
      <div className="guide-code-header">
        <span className="guide-code-lang">{language}</span>
        <button
          type="button"
          className="guide-code-copy secondary btn-sm"
          onClick={() => navigator.clipboard.writeText(code).catch(() => undefined)}
        >
          Copy
        </button>
      </div>
      <pre className="guide-code">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function SystemGuide() {
  return (
    <section className="system-guide">
      <div className="guide-hero">
        <div className="guide-hero-badge">Plugin authoring</div>
        <h2>How to add a dynamical system</h2>
        <p>
          Paste C++ source that implements <code>SystemBase</code>. Slicer compiles it
          automatically and registers the system for use in the Explorer.
        </p>
      </div>

      <div className="guide-steps">
        {BUILD_STEPS.map((step, index) => (
          <article key={step.title} className="guide-step-card">
            <span className="guide-step-number">{index + 1}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="guide-examples">
        <div className="guide-example-panel">
          <h3>Example — Hénon map</h3>
          <p className="muted">
            <code>evaluate()</code> returns the next state. The value from{" "}
            <code>get_name()</code> becomes the system identifier in the UI.
          </p>
          <CodeBlock code={HENON_SYSTEM_EXAMPLE} language="C++" />
        </div>

        <div className="guide-example-panel">
          <h3>Generated registry entry</h3>
          <p className="muted">
            Slicer writes metadata like this after a successful compile. Parameter and
            variable names come from your C++ methods.
          </p>
          <CodeBlock code={REGISTRY_EXAMPLE} language="YAML" />
        </div>
      </div>

      <div className="guide-callout guide-callout-info">
        <strong>Server-side compilation</strong>
        <p>
          Your code is compiled on the Slicer server when you submit the form. Compilation
          errors are shown inline — fix the source and try again. The new system appears in
          the Explorer picker immediately after a successful upload.
        </p>
      </div>
    </section>
  );
}
