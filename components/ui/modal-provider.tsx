"use client";

import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { useModal, resolveModalDefault, type ModalState } from "@/hooks/use-modal";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

// ── Individual modal renderer ─────────────────────────────────────

function ModalRenderer({ modal }: { modal: ModalState }) {
  const [inputValue, setInputValue] = React.useState(
    modal.defaultValue ?? ""
  );

  // Resolve with default value on unmount to prevent hanging promises
  React.useEffect(() => {
    return () => {
      if (modal.open) resolveModalDefault(modal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = () => resolveModalDefault(modal);
  const handleConfirm = () => {
    if (modal.type === "alert") modal.resolve(undefined);
    else if (modal.type === "prompt") modal.resolve(inputValue);
    else modal.resolve(true);
  };

  const isDestructive = modal.type === "destructive-confirm";
  const phraseMatches =
    !isDestructive || inputValue.trim() === modal.confirmationPhrase;

  return (
    <AlertDialogPrimitive.Root open={modal.open}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
        <AlertDialogPrimitive.Content
          dir="rtl"
          className="bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg"
          onEscapeKeyDown={modal.type === "alert" ? handleConfirm : handleCancel}
        >
          {/* Header */}
          <div className="flex flex-col gap-2 text-center sm:text-right">
            {isDestructive && (
              <div className="mx-auto sm:mx-0 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
            )}
            {modal.title && (
              <AlertDialogPrimitive.Title className="text-lg font-semibold">
                {modal.title}
              </AlertDialogPrimitive.Title>
            )}
            <AlertDialogPrimitive.Description className="text-muted-foreground text-sm whitespace-pre-wrap">
              {modal.message}
            </AlertDialogPrimitive.Description>
          </div>

          {/* Input for destructive-confirm */}
          {isDestructive && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                הקלד{" "}
                <span className="font-semibold text-foreground">
                  {modal.confirmationPhrase}
                </span>{" "}
                כדי לאשר
              </p>
              <input
                dir="rtl"
                className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="הקלד כאן..."
                aria-label="הקלד ביטוי אישור"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && phraseMatches) handleConfirm();
                }}
              />
            </div>
          )}

          {/* Input for prompt */}
          {modal.type === "prompt" && (
            <input
              dir="rtl"
              className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={modal.placeholder}
              aria-label={modal.message}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirm();
              }}
            />
          )}

          {/* Footer */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {modal.type !== "alert" && (
              <AlertDialogPrimitive.Cancel
                className={cn(buttonVariants({ variant: "outline" }))}
                onClick={handleCancel}
              >
                {modal.cancelText}
              </AlertDialogPrimitive.Cancel>
            )}
            <AlertDialogPrimitive.Action
              className={cn(
                buttonVariants({
                  variant:
                    modal.variant === "destructive" ? "destructive" : "default",
                })
              )}
              onClick={handleConfirm}
              disabled={isDestructive && !phraseMatches}
            >
              {modal.confirmText}
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

// ── Provider component (add to layout.tsx) ────────────────────────

export function ModalProvider() {
  const { modals } = useModal();

  return (
    <>
      {modals.map((modal) => (
        <ModalRenderer key={modal.id} modal={modal} />
      ))}
    </>
  );
}
