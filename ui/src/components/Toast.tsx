import { useEffect, useRef, useState, type ReactElement } from "react";

const TOAST_DURATION_MS = 4000;

export interface ToastApi {
  readonly message: string | null;
  readonly showToast: (message: string) => void;
}

/**
 * A page mounts one of these plus a <Toast> to raise transient success
 * feedback from anywhere in its tree -- see README section 2.6: a modal
 * never shows its own success message, it closes and a toast appears.
 */
export const useToast = (): ToastApi => {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    []
  );

  const showToast = (nextMessage: string): void => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    setMessage(nextMessage);
    timeoutRef.current = window.setTimeout(() => {
      setMessage(null);
    }, TOAST_DURATION_MS);
  };

  return { message, showToast };
};

export interface ToastProps {
  readonly message: string | null;
}

export const Toast = ({ message }: ToastProps): ReactElement | null => {
  if (message === null) {
    return null;
  }

  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
};
