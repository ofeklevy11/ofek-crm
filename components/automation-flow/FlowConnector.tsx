import { ChevronDown } from "lucide-react";

export default function FlowConnector() {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="w-0.5 h-5 bg-gray-300" />
      <ChevronDown className="w-4 h-4 text-gray-400 -mt-1" />
    </div>
  );
}
