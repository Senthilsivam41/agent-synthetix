import { useEffect, useState } from "react";
import { api } from "./lib/api";
import { IntakeScreen } from "./screens/IntakeScreen";
import { PlaceholderScreen } from "./screens/PlaceholderScreen";
import { SprintsScreen } from "./screens/SprintsScreen";

const STEPS = [
  { id: "intake", label: "Intake" },
  { id: "clarify", label: "Clarify" },
  { id: "plan", label: "Plan" },
  { id: "approve", label: "Approve" },
  { id: "sprints", label: "Sprints" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export default function App() {
  const [step, setStep] = useState<StepId>("intake");
  const [statusText, setStatusText] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    api
      .status()
      .then((s) => setStatusText(s.text.split("\n")[0] ?? ""))
      .catch(() => setStatusText("status: unavailable"));
    api
      .pendingCommands()
      .then((p) => setPendingCount(p.items.length))
      .catch(() => setPendingCount(0));
  }, [toast]);

  return (
    <div className="shell">
      <header>
        <h1 className="brand">AutoClaw Orchestrate</h1>
        <p className="muted">
          Guided control surface · {statusText || "loading status…"}
          {pendingCount > 0
            ? ` · ${pendingCount} pending slash-command(s)`
            : ""}
        </p>
      </header>

      <nav aria-label="Orchestrate steps">
        <ul className="step-rail">
          {STEPS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                aria-current={step === s.id ? "step" : undefined}
                onClick={() => setStep(s.id)}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {pendingCount > 0 && (
        <div className="banner" role="status">
          Commands queued in{" "}
          <code>.autoclaw/orchestrator/commands/pending.jsonl</code>. In agent
          chat run the matching <code>/orchestrate …</code> (or drain pending
          per rules).
        </div>
      )}

      <main className="main">
        {step === "intake" && (
          <IntakeScreen
            onToast={(msg) => {
              setToast(msg);
              window.setTimeout(() => setToast(null), 4000);
            }}
          />
        )}
        {step === "clarify" && (
          <PlaceholderScreen
            title="Clarify"
            body="Ask 1–5 critical questions; answers write to plans/clarifications.md."
          />
        )}
        {step === "plan" && (
          <PlaceholderScreen
            title="Plan"
            body="Review plans/project-plan.md; revise or continue to approve."
          />
        )}
        {step === "approve" && (
          <PlaceholderScreen
            title="Approve"
            body="Confirm → queue /orchestrate approve (status approved → manifested)."
          />
        )}
        {step === "sprints" && (
          <SprintsScreen />
        )}
      </main>

      {toast && (
        <p className="toast" role="status">
          {toast}
        </p>
      )}
    </div>
  );
}
