"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { toast, Toaster as Sonner, type ToasterProps } from "sonner"

// Monkey-patch per-type durations (JS module singleton — applies to all importers)
const _success = toast.success;
const _error = toast.error;
const _warning = toast.warning;
const _info = toast.info;

toast.success = (msg, data) => _success(msg, { duration: 3000, ...data });
toast.error = (msg, data) => _error(msg, { duration: 6000, ...data });
toast.warning = (msg, data) => _warning(msg, { duration: 5000, ...data });
toast.info = (msg, data) => _info(msg, { duration: 4000, ...data });

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      dir="rtl"
      position="top-center"
      duration={5000} /* fallback for plain toast() calls */
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
