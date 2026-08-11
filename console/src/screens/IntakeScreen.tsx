import { useCallback, useEffect, useRef, useState } from "react";
import { api, type IntakeFile } from "../lib/api";

type Props = {
  onToast: (msg: string) => void;
};

export function IntakeScreen({ onToast }: Props) {
  const [files, setFiles] = useState<IntakeFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const data = await api.intake();
    setFiles(data.files);
  }, []);

  useEffect(() => {
    refresh().catch((e: Error) => setError(e.message));
  }, [refresh]);

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        await api.uploadIntake(file);
      }
      await api.indexIntake();
      await api.enqueueCommand("/orchestrate intake");
      await refresh();
      onToast(`Uploaded ${list.length} file(s); queued /orchestrate intake`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onIndex() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.indexIntake();
      await api.enqueueCommand("/orchestrate intake");
      await refresh();
      onToast(`Indexed ${r.count} file(s); queued /orchestrate intake`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="brand" style={{ fontSize: "1.35rem" }}>
        Intake
      </h2>
      <p className="muted">
        Drop a brief, notes, or recording transcript to start a project plan.
      </p>

      <div
        className="dropzone"
        role="group"
        aria-labelledby="intake-drop-title"
        aria-describedby="intake-drop-formats"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void onFiles(e.dataTransfer.files);
        }}
      >
        <p id="intake-drop-title">Drop files here or choose files</p>
        <p id="intake-drop-formats" className="muted">Accepted formats: Markdown, text, PDF, images, and audio.</p>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => fileInput.current?.click()}>Choose files</button>
        <input ref={fileInput} type="file" multiple hidden disabled={busy} aria-label="Intake files" onChange={(e) => void onFiles(e.target.files)} />
      </div>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <table className="catalog">
        <caption className="sr-only">Intake files</caption>
        <thead>
          <tr>
            <th>File</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {files.length === 0 ? (
            <tr>
              <td colSpan={2} className="muted">
                _(none yet)_ — drop files above
              </td>
            </tr>
          ) : (
            files.map((f) => (
              <tr key={f.name}>
                <td>{f.name}</td>
                <td>{f.type}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void onIndex()}
        >
          Index intake
        </button>
      </div>
    </section>
  );
}
