"use client";

import React, { useState, useEffect } from "react";
import TaskKanbanBoard from "@/components/TaskKanbanBoard";

export default function TasksPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">משימות</h1>
          <p className="text-slate-400">ניהול משימות בצורה ויזואלית</p>
        </div>

        <TaskKanbanBoard />
      </div>
    </div>
  );
}
