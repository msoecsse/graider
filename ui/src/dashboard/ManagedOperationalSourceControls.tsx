import { useEffect, useState } from "react";

/** Registration remains required. Remote-only course controls are intentionally absent. */
export const ManagedOperationalSourceControls = ({ folderId }: { readonly folderId: string }) => {
  const [mode, setMode] = useState<"legacy" | "managed">();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  useEffect(() => {
    let active = true;
    void window.graiderUI.getCourseOperationalMode?.(folderId).then((value) => {
      if (active) setMode(value);
    });
    return () => {
      active = false;
    };
  }, [folderId]);
  if (!mode) return null;
  return (
    <div>
      <p>
        {mode === "managed"
          ? "Managed course source active. Course edits publish when saved."
          : "This registered course uses its local folder."}
      </p>
      {mode === "legacy" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setMessage(undefined);
            void window.graiderUI
              .cutoverManagedCourse?.(folderId)
              .then(() => setMode("managed"))
              .catch(() =>
                setMessage(
                  "Cutover could not finish. Review the course status and resolve local work before retrying."
                )
              )
              .finally(() => setBusy(false));
          }}
        >
          Use managed course source
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setMessage(undefined);
          void window.graiderUI
            .updateCourseSource?.(folderId)
            .catch(() => setMessage("Course source could not be updated. Local work is preserved."))
            .finally(() => setBusy(false));
        }}
      >
        Update course source
      </button>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
};
