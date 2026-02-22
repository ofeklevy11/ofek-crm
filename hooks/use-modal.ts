"use client";

import * as React from "react";

// ── Types ──────────────────────────────────────────────────────────

interface BaseModalOptions {
  title?: string;
  message: string;
}

interface AlertOptions extends BaseModalOptions {}

interface ConfirmOptions extends BaseModalOptions {
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
}

interface DestructiveConfirmOptions extends BaseModalOptions {
  confirmText?: string;
  cancelText?: string;
  confirmationPhrase: string;
}

interface PromptOptions extends BaseModalOptions {
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

interface ModalBase {
  id: string;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  variant: "default" | "destructive";
  confirmationPhrase?: string;
  placeholder?: string;
  defaultValue?: string;
  open: boolean;
}

export type ModalState =
  | (ModalBase & { type: "alert"; resolve: (value: void) => void })
  | (ModalBase & { type: "confirm"; resolve: (value: boolean) => void })
  | (ModalBase & {
      type: "destructive-confirm";
      resolve: (value: boolean) => void;
    })
  | (ModalBase & { type: "prompt"; resolve: (value: string | null) => void });

interface State {
  modals: ModalState[];
}

// ── Module-level state ──────────────────────────────────────────────

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { modals: [] };

function dispatch(state: State) {
  memoryState = state;
  listeners.forEach((listener) => listener(memoryState));
}

const MAX_MODALS = 5;

/** Resolve a modal with its cancel/default value (void for alert, false for confirm, null for prompt). */
export function resolveModalDefault(modal: ModalState) {
  if (modal.type === "alert") modal.resolve(undefined);
  else if (modal.type === "prompt") modal.resolve(null);
  else modal.resolve(false);
}

function addModal(modal: ModalState) {
  let modals = [...memoryState.modals, modal];
  // Auto-resolve oldest modals when exceeding limit
  while (modals.length > MAX_MODALS) {
    resolveModalDefault(modals[0]);
    modals = modals.slice(1);
  }
  dispatch({ modals });
}

function removeModal(id: string) {
  dispatch({ modals: memoryState.modals.filter((m) => m.id !== id) });
}

// ── Public imperative API ──────────────────────────────────────────

export function showAlert(msgOrOpts: string | AlertOptions): Promise<void> {
  const opts: AlertOptions =
    typeof msgOrOpts === "string" ? { message: msgOrOpts } : msgOrOpts;

  return new Promise<void>((resolve) => {
    const id = genId();
    addModal({
      id,
      type: "alert",
      title: opts.title ?? "שים לב",
      message: opts.message,
      confirmText: "אישור",
      cancelText: "",
      variant: "default",
      open: true,
      resolve: () => {
        removeModal(id);
        resolve();
      },
    });
  });
}

export function showConfirm(
  msgOrOpts: string | ConfirmOptions
): Promise<boolean> {
  const opts: ConfirmOptions =
    typeof msgOrOpts === "string" ? { message: msgOrOpts } : msgOrOpts;

  return new Promise<boolean>((resolve) => {
    const id = genId();
    addModal({
      id,
      type: "confirm",
      title: opts.title ?? "אישור",
      message: opts.message,
      confirmText: opts.confirmText ?? "אישור",
      cancelText: opts.cancelText ?? "ביטול",
      variant: opts.variant ?? "default",
      open: true,
      resolve: (confirmed: boolean) => {
        removeModal(id);
        resolve(confirmed);
      },
    });
  });
}

export function showDestructiveConfirm(
  opts: DestructiveConfirmOptions
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const id = genId();
    addModal({
      id,
      type: "destructive-confirm",
      title: opts.title ?? "אישור מחיקה",
      message: opts.message,
      confirmText: opts.confirmText ?? "מחק",
      cancelText: opts.cancelText ?? "ביטול",
      variant: "destructive",
      confirmationPhrase: opts.confirmationPhrase,
      open: true,
      resolve: (confirmed: boolean) => {
        removeModal(id);
        resolve(confirmed);
      },
    });
  });
}

export function showPrompt(
  msgOrOpts: string | PromptOptions
): Promise<string | null> {
  const opts: PromptOptions =
    typeof msgOrOpts === "string" ? { message: msgOrOpts } : msgOrOpts;

  return new Promise<string | null>((resolve) => {
    const id = genId();
    addModal({
      id,
      type: "prompt",
      title: opts.title ?? "",
      message: opts.message,
      confirmText: opts.confirmText ?? "אישור",
      cancelText: opts.cancelText ?? "ביטול",
      variant: "default",
      placeholder: opts.placeholder,
      defaultValue: opts.defaultValue,
      open: true,
      resolve: (value: string | null) => {
        removeModal(id);
        resolve(value);
      },
    });
  });
}

// ── React hook for ModalProvider ───────────────────────────────────

export function useModal() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);

  return state;
}
