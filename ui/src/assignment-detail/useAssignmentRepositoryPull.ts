import { useEffect, useRef, useState } from "react";
import type {
  AssignmentRepositoryUpdateProgress,
  AssignmentRepositoryUpdateResult
} from "../../electron/ipc";
import type { AssignmentDetailPageProps } from "./assignmentDetailTypes";

export const useAssignmentRepositoryPull = (
  selection: AssignmentDetailPageProps["selection"],
  refreshLocalLifecycle: () => Promise<void>
) => {
  const [isPulling, setIsPulling] = useState(false);
  const [progress, setProgress] = useState<AssignmentRepositoryUpdateProgress | null>(null);
  const [result, setResult] = useState<AssignmentRepositoryUpdateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const generation = useRef(0);
  const unsubscribe = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    active.current = false;
    setIsPulling(false);
    setProgress(null);
    setResult(null);
    setError(null);
    return () => {
      generation.current += 1;
      unsubscribe.current?.();
      unsubscribe.current = undefined;
    };
  }, [selection.courseFolderId, selection.courseFolderPath, selection.assignmentFile]);

  const pull = async (): Promise<void> => {
    const update = window.graiderUI.pullLatestAssignmentStudentChanges;
    if (
      !active.current &&
      update !== undefined &&
      selection.termSlug !== null &&
      selection.assignmentSlug !== null
    ) {
      active.current = true;
      const startedGeneration = generation.current;
      const current = () => startedGeneration === generation.current;
      setIsPulling(true);
      setProgress(null);
      setResult(null);
      setError(null);
      try {
        unsubscribe.current = window.graiderUI.onAssignmentRepositoryUpdateProgress?.((next) => {
          if (
            current() &&
            next.courseFolderId === selection.courseFolderId &&
            next.termCode === selection.termSlug &&
            next.assignmentSlug === selection.assignmentSlug
          )
            setProgress(next);
        });
        const next = await update({
          courseFolderId: selection.courseFolderId,
          courseFolderPath: selection.courseFolderPath,
          termCode: selection.termSlug,
          assignmentSlug: selection.assignmentSlug
        });
        if (current()) {
          setResult(next);
          if (next.message !== undefined) setError(next.message);
        }
      } catch {
        if (current())
          setError(
            "Unable to finish pulling student changes. Some repositories may have updated. Check course access, GitHub sign-in and local repository status, then retry."
          );
      } finally {
        if (current()) {
          unsubscribe.current?.();
          unsubscribe.current = undefined;
          await refreshLocalLifecycle();
          if (current()) {
            active.current = false;
            setIsPulling(false);
          }
        }
      }
    }
  };
  return { isPulling, progress, result, error, pull };
};
