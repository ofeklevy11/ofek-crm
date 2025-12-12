"use client";

import { useState, useEffect } from "react";
import { Workflow, WorkflowStage } from "@prisma/client";
import { User, Check, Smartphone, Mail, RefreshCw } from "lucide-react";

interface WorkflowDemoProps {
  workflow: Workflow & { stages: WorkflowStage[] };
}

export function WorkflowDemo({ workflow }: WorkflowDemoProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [log, setLog] = useState<string[]>([]);

  // Simulation loop
  useEffect(() => {
    if (!isPlaying || workflow.stages.length === 0) return;

    const interval = setInterval(() => {
      setCurrentStepIndex((prev) => {
        const next = prev + 1;
        if (next >= workflow.stages.length) {
          // Reset after a pause
          setLog((prevLog) => [...prevLog, `✅ התהליך הושלם בהצלחה.`]);
          setTimeout(() => {
            setCurrentStepIndex(0);
            setLog([]);
          }, 2000);
          return workflow.stages.length - 1; // Stay at end briefly
        }

        // Add log entry for the new step
        const stageName = workflow.stages[next]?.name || "Unknown Stage";
        setLog((prevLog) => [...prevLog, `➡️ הליד עבר לשלב: ${stageName}`]);

        return next;
      });
    }, 3000); // 3 seconds per step

    return () => clearInterval(interval);
  }, [isPlaying, workflow.stages]);

  if (workflow.stages.length === 0) {
    return (
      <div className="text-sm text-gray-400 p-4">אין שלבים להצגה בדמו.</div>
    );
  }

  // Calculate progress percentage for the progress bar
  const progress = (currentStepIndex / (workflow.stages.length - 1)) * 100;

  return (
    <div className="bg-slate-900 rounded-xl p-6 text-white shadow-2xl overflow-hidden relative border border-slate-700">
      {/* Background visuals */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex justify-between items-center mb-8 relative z-10">
        <div>
          <h3 className="text-lg font-medium text-slate-100">
            סימולציית תהליך בזמן אמת
          </h3>
          <p className="text-slate-400 text-sm">
            צפה איך ליד עובר דרך הפייפליין שהגדרת
          </p>
        </div>
        <button
          onClick={() => {
            setIsPlaying(!isPlaying);
            if (!isPlaying && currentStepIndex === workflow.stages.length - 1) {
              setCurrentStepIndex(0);
              setLog([]);
            }
          }}
          className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded-full border border-slate-600 transition-colors"
        >
          {isPlaying ? "השהה סימולציה" : "הפעל סימולציה"}
        </button>
      </div>

      {/* Visual Pipeline Track */}
      <div className="relative mb-8 px-4">
        {/* Track Line */}
        <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-700 -translate-y-1/2 rounded-full" />

        {/* Progress Line */}
        <div
          className="absolute top-1/2 right-0 h-1 bg-gradient-to-l from-indigo-500 to-emerald-400 -translate-y-1/2 rounded-full transition-all duration-1000 ease-in-out"
          style={{
            width: `${
              (currentStepIndex / (workflow.stages.length - 1)) * 100
            }%`,
          }} // Simplified for RTL/LTR. Assuming container is RTL based on context?
          // Actually, if we are in RTL mode, right:0 is start. Let's assume standard CSS LTR logic but right-aligned?
          // Wait, usually creating a progress bar in RTL means growing from Right to Left.
        />
        {/* NOTE: If the app is RTL, "right-0" is the starting point. I'll assume RTL direction for logic. */}

        <div
          className="relative flex justify-between items-center z-10"
          dir="rtl"
        >
          {workflow.stages.map((stage, index) => {
            const isActive = index === currentStepIndex;
            const isCompleted = index < currentStepIndex;

            return (
              <div
                key={stage.id}
                className="flex flex-col items-center gap-2 group transition-all duration-500"
              >
                {/* Dot / Indicator */}
                <div
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-500 scale-100
                    ${
                      isActive
                        ? "bg-indigo-600 border-indigo-400 text-white scale-125 shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                        : isCompleted
                        ? "bg-emerald-500 border-emerald-400 text-white"
                        : "bg-slate-800 border-slate-600 text-slate-500"
                    }
                  `}
                >
                  {isCompleted ? <Check size={14} /> : index + 1}
                </div>

                {/* Stage Name */}
                <span
                  className={`text-xs max-w-[80px] text-center transition-colors duration-300 ${
                    isActive ? "text-indigo-400 font-medium" : "text-slate-500"
                  }`}
                >
                  {stage.name}
                </span>

                {/* Floating "User" Avatar moving */}
                {isActive && (
                  <div className="absolute -top-10 transition-all duration-1000 ease-in-out animate-bounce">
                    <div className="bg-white text-indigo-900 p-1.5 rounded-full shadow-lg">
                      <User size={16} />
                    </div>
                    {/* Tooltip-ish thing */}
                    <div className="absolute -top-8 right-1/2 translate-x-1/2 bg-indigo-600 text-[10px] text-white px-2 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                      Ofek (Lead)
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Terminal / Log Area */}
      <div className="bg-slate-950/50 rounded-lg p-3 font-mono text-xs text-emerald-400/90 h-[100px] overflow-y-auto border border-slate-800/50">
        <div className="flex items-center gap-2 mb-2 text-slate-500 border-b border-slate-800 pb-1">
          <RefreshCw size={10} className={isPlaying ? "animate-spin" : ""} />
          <span>SYSTEM LOGS</span>
        </div>
        <div className="flex flex-col gap-1">
          {log.length === 0 && (
            <span className="text-slate-600 opacity-50">
              ממתין לתחילת סימולציה...
            </span>
          )}
          {log.map((line, i) => (
            <div
              key={i}
              className="animate-in fade-in slide-in-from-bottom-1 duration-300"
            >
              <span className="text-slate-500 mr-2">
                [{new Date().toLocaleTimeString()}]
              </span>
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
