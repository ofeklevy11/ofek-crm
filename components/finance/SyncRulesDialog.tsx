"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
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
          className="gap-2 border-[#a24ec1] text-[#a24ec1] hover:bg-purple-50"
        >
          <Settings className="w-4 h-4" />
          ניהול חוקי איסוף
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ניהול חוקי איסוף נתונים</DialogTitle>
          <DialogDescription className="sr-only">צפייה ועריכה של חוקי איסוף נתונים פעילים</DialogDescription>
        </DialogHeader>
        <div className="pt-4">
          <ActiveSyncRules rules={rules} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
