import { Spinner } from "@/components/ui/spinner"

export default function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Spinner size="xl" />
    </div>
  )
}
