"use client";

import { WorkflowStage } from "@prisma/client";
import { Circle } from "lucide-react";
import { WorkflowIconMap } from "@/lib/workflows/icon-map";

interface StageCardProps {
  stage: WorkflowStage;
  onClick: () => void;
  index: number;
  isLast: boolean;
}

export function StageCard({ stage, onClick, index }: StageCardProps) {
  // @ts-ignore
  const IconComponent = WorkflowIconMap[stage.icon] || Circle;
  // @ts-ignore
  const stageColor = stage.color || "blue";

  const colorClasses: Record<string, string> = {
    blue: "border-blue-500 bg-blue-50 text-blue-600",
    green: "border-emerald-500 bg-emerald-50 text-emerald-600",
    purple: "border-purple-500 bg-purple-50 text-purple-600",
    orange: "border-orange-500 bg-orange-50 text-orange-600",
    gray: "border-gray-500 bg-gray-50 text-gray-600",
    red: "border-red-500 bg-red-50 text-red-600",
  };

  const activeColorClass = colorClasses[stageColor] || colorClasses.blue;
  const borderColor = activeColorClass.split(" ")[0]; // extract border-X-500

  return (
    <div
      onClick={onClick}
      className={`
        relative w-[280px] h-[180px] bg-white rounded-xl shadow-sm border border-gray-200 cursor-pointer
        transform transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-indigo-300
        flex flex-col group overflow-hidden
      `}
    >
      {/* Top Color Line */}
      <div
        className={`h-1.5 w-full ${borderColor.replace("border-", "bg-")}`}
      />

      <div className="p-5 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-3">
          <div className={`p-2 rounded-lg ${activeColorClass}`}>
            <IconComponent size={20} />
          </div>
          <span className="text-xs font-semibold text-gray-400 bg-gray-50 px-2 py-1 rounded-full uppercase tracking-wider">
            שלב {index + 1}
          </span>
        </div>

        <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-indigo-600 transition-colors">
          {stage.name}
        </h3>

        <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">
          {stage.description || "אין תיאור זמין לשלב זה."}
        </p>
      </div>

      {/* Footer / Status Indicator (Fake for visuals) */}
      <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between text-xs text-gray-400">
        <span>פעיל</span>
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      </div>

      {/* Hover Reveal Gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-indigo-50/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
}
