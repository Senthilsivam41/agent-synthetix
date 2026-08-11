import { useCallback, useEffect, useRef, useState } from "react";
import { api, watchRuntime } from "./lib/api";
import { CommandActivity } from "./components/CommandActivity";
import { IntakeScreen } from "./screens/IntakeScreen";
import { ClarifyScreen } from "./screens/ClarifyScreen";
import { PlanScreen } from "./screens/PlanScreen";
import { ApproveScreen } from "./screens/ApproveScreen";
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
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  const previousStep = useRef<StepId>(step);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  }, []);
  const updatePendingCount = useCallback((count: number) => setPendingCount(count), []);
  const goToSprints = useCallback(() => setStep("sprints"), []);

  useEffect(() => watchRuntime(() => setRuntimeVersion((version) => version + 1)), []);

  useEffect(() => {
    if (previousStep.current !== step) {
      previousStep.current = step;
      mainRef.current?.focus();
    }
  }, [step]);

  useEffect(() => {
    api
      .status()
      .then((s) => setStatusText(s.text.split("\n")[0] ?? ""))
      .catch(() => setStatusText("status: unavailable"));
    api
      .pendingCommands()
      .then((p) => setPendingCount(p.items.length))
      .catch(() => setPendingCount(0));
  }, [toast, runtimeVersion]);

  return (
    <div className="shell">
      <a className="skip-link" href="#workflow-main">Skip to workflow</a>
      <header>
        <div className="shell-heading"><div><h1 className="brand">AutoClaw Orchestrate</h1><p className="muted">Guided control surface · {statusText || "loading status…"}{pendingCount > 0 ? ` · ${pendingCount} pending slash-command(s)` : ""}</p></div><CommandActivity refreshKey={runtimeVersion} onPendingCount={updatePendingCount} /></div>
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

      <main className="main" id="workflow-main" ref={mainRef} tabIndex={-1}>
        {step === "intake" && (
          <IntakeScreen
            onToast={notify}
          />
        )}
        {step === "clarify" && (
          <ClarifyScreen refreshKey={runtimeVersion} onToast={notify} onContinue={() => setStep("plan")} />
        )}
        {step === "plan" && (
          <PlanScreen refreshKey={runtimeVersion} onToast={notify} onApprove={() => setStep("approve")} />
        )}
        {step === "approve" && (
          <ApproveScreen refreshKey={runtimeVersion} onToast={notify} onRevise={() => setStep("plan")} onComplete={goToSprints} />
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
