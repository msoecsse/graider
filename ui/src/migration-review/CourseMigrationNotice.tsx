import { useEffect, useState } from "react";
import { getMigrationReviewPath } from "../dashboard/routePaths";
const readPreference = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === "seen";
  } catch {
    return false;
  }
};
const writePreference = (key: string): void => {
  try {
    localStorage.setItem(key, "seen");
  } catch {
    /* Display preferences never grant migration authority. */
  }
};
export const CourseMigrationReminder = ({
  selector,
  code
}: {
  readonly selector: string;
  readonly code: string;
}) => {
  const key = `migration-reminder:${selector}`;
  const [dismissed, setDismissed] = useState(() => readPreference(key));
  return (
    <section aria-label={`Course upgrade — ${code}`}>
      {!dismissed ? (
        <p>
          Optional course upgrade available for review. Existing Schema 1 operations remain
          available.{" "}
          <button
            type="button"
            aria-label={`Dismiss upgrade reminder for ${code}`}
            onClick={() => {
              writePreference(key);
              setDismissed(true);
            }}
          >
            Dismiss reminder
          </button>
        </p>
      ) : null}
      <a className="secondary-action" href={`#${getMigrationReviewPath(selector)}`}>
        Review migration — {code}
      </a>
    </section>
  );
};
export const CourseMigrationNotice = ({ selector }: { readonly selector: string }) => {
  const [notice, setNotice] = useState<"complete" | "needs_attention" | null>(null);
  useEffect(() => {
    let active = true;
    setNotice(null);
    void window.graiderUI.migrationExecution
      ?.history({ selector })
      .then((history) => {
        if (!active) return;
        if (history.currentAccess !== "ready") setNotice("needs_attention");
        else {
          const key = `migration-return:${selector}:${history.publication}`;
          if (!readPreference(key)) {
            setNotice("complete");
            writePreference(key);
          }
        }
      })
      .catch(() => {
        /* New v2 courses have no migration history; unauthorized history is not disclosed. */
      });
    return () => {
      active = false;
    };
  }, [selector]);
  return (
    <>
      {notice === "complete" ? (
        <p role="status">
          Course upgrade complete — Ready.{" "}
          <button type="button" onClick={() => setNotice(null)}>
            Dismiss upgrade-complete notice
          </button>
        </p>
      ) : null}
      {notice === "needs_attention" ? (
        <p role="status">
          Published — Needs attention. Required current access is incomplete or unverified.{" "}
          <a href={`#/migration-history/${encodeURIComponent(selector)}`}>
            Review migration recovery
          </a>
        </p>
      ) : null}
      <details>
        <summary>Course Settings</summary>
        <a
          className="secondary-action"
          href={`#/migration-history/${encodeURIComponent(selector)}`}
        >
          Migration History
        </a>
      </details>
    </>
  );
};
