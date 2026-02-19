import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

const sizeClasses = {
  sm: "size-3",
  default: "size-4",
  lg: "size-6",
  xl: "size-8",
} as const

function Spinner({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"svg"> & { size?: keyof typeof sizeClasses }) {
  return (
    <Loader2Icon
      role="status"
      aria-label="טוען"
      className={cn(sizeClasses[size], "animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
