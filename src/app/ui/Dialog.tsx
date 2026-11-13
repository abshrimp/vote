"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import styles from "./ui.module.css";

/**
 * Modal dialog built on the native <dialog> element:
 * focus trapping, Esc to close and the top layer come from the browser.
 */
export function Dialog({ open, onClose, title, children, actions, size = "small", focusDialog = false, onClosed }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  size?: "small" | "large";
  /** Focus the dialog itself instead of its first control (for lists of choices). */
  focusDialog?: boolean;
  /** Called once the dialog has really closed (after its fade-out). */
  onClosed?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closed = useRef(onClosed);
  closed.current = onClosed;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      if (focusDialog) dialog.focus();
    }
    if (!open && dialog.open) {
      // A short fade-out before the native close (skipped when motion is reduced).
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { dialog.close(); closed.current?.(); return; }
      dialog.classList.add(styles.closing);
      const finish = () => { dialog.classList.remove(styles.closing); if (dialog.open) dialog.close(); closed.current?.(); };
      const timer = window.setTimeout(finish, 140);
      return () => { if (dialog.classList.contains(styles.closing)) { window.clearTimeout(timer); finish(); } };
    }
    if (!open) closed.current?.();
  }, [open, focusDialog]);

  return <dialog ref={ref} aria-labelledby={titleId} tabIndex={-1}
    className={size === "large" ? `${styles.dialog} ${styles.dialogLarge}` : styles.dialog}
    onClose={onClose}
    onClick={event => { if (event.target === ref.current) onClose(); }}>
    <div className={styles.dialogInner}>
      <div className={styles.dialogHead}>
        <h2 id={titleId} className={styles.dialogTitle}>{title}</h2>
        {size === "large" && <button type="button" className={styles.closeButton}
          aria-label="閉じる" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor"
            d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>}
      </div>
      {children && <div className={styles.dialogBody}>{children}</div>}
      {actions && <div className={styles.dialogActions}>{actions}</div>}
    </div>
  </dialog>;
}

type ConfirmOptions = {
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

/** Promise-based replacement for window.confirm(). Render `dialog` once in the tree. */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);
  const confirm = useCallback((options: ConfirmOptions) =>
    new Promise<boolean>(resolve => setState({ ...options, resolve })), []);
  const settle = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };
  const dialog = <Dialog open={state !== null} onClose={() => settle(false)} title={state?.title}
    actions={<>
      <button type="button" className={styles.textButton} onClick={() => settle(false)}>
        {state?.cancelLabel ?? "キャンセル"}
      </button>
      <button type="button" autoFocus
        className={state?.danger ? `${styles.textButton} ${styles.danger}` : styles.textButton}
        onClick={() => settle(true)}>
        {state?.confirmLabel ?? "OK"}
      </button>
    </>}>
    {state?.body}
  </Dialog>;
  return [confirm, dialog] as const;
}

/** Bottom snackbar. Pass a new object each time to re-announce the same text. */
export function Snackbar({ message, onDismiss, className }: {
  message: { text: string; id: number } | null;
  onDismiss: () => void;
  className?: string;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);
  return <div className={className ? `${styles.snackbarRegion} ${className}` : styles.snackbarRegion} aria-live="polite">
    {message && <div key={message.id} className={styles.snackbar} role="status">
      <span>{message.text}</span>
      <button type="button" onClick={onDismiss}>閉じる</button>
    </div>}
  </div>;
}
