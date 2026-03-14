import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(onClose: () => void, enabled = true) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;

    previousFocusRef.current = document.activeElement;
    const container = containerRef.current;
    if (!container) return;

    // Focus first focusable element
    const first = container.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Only handle Escape if focus is inside this trap's container
        // This prevents outer traps from stealing Escape from nested modals
        if (!container.contains(document.activeElement)) return;
        e.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;

      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      (previousFocusRef.current as HTMLElement)?.focus?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return containerRef;
}
