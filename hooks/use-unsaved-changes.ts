import { useEffect } from "react";

/**
 * Registers a `beforeunload` listener when `isDirty` is true.
 * Warns the user before they close/refresh the tab with unsaved changes.
 */
export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
