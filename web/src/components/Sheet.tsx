import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

interface SheetProps {
  title: string;
  open: boolean;
  onClose: () => void;
  /** Small buttons or links under the title. */
  actions?: ComponentChildren;
  children: ComponentChildren;
}

/**
 * A full-screen page over the app, with a large close button. A native modal dialog, so the
 * browser keeps focus inside it and closes it on Escape or the back gesture.
 */
export function Sheet({ title, open, onClose, actions, children }: SheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog ref={dialog} className="app__sheet" aria-label={title} onClose={onClose}>
      <button type="button" className="app__sheet-close" aria-label="Close" onClick={onClose}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 5l14 14M19 5L5 19"
            stroke="currentColor"
            stroke-width="3.2"
            stroke-linecap="round"
          />
        </svg>
      </button>
      <div className="app__sheet-body">
        <h1 className="app__sheet-title">{title}</h1>
        {actions && <div className="app__sheet-actions">{actions}</div>}
        {children}
      </div>
    </dialog>
  );
}
