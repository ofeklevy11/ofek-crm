"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import ActiveSyncRules from "./ActiveSyncRules";

export default function SyncRulesDialog({ rules }: { rules: any[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
        >
          <Settings className="w-4 h-4" />
          ניהול חוקי איסוף
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ניהול חוקי איסוף נתונים</DialogTitle>
        </DialogHeader>
        <div className="pt-4">
          <ActiveSyncRules rules={rules} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
