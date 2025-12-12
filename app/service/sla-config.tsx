"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { updateSlaPolicy } from "@/app/actions/tickets";

interface SlaConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policies: any[];
}

export default function SlaConfigModal({
  open,
  onOpenChange,
  policies,
}: SlaConfigModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Helper to get policy or defaults
  const getPolicy = (priority: string) =>
    policies.find((p) => p.priority === priority) || {
      responseTimeMinutes: 60,
      resolveTimeMinutes: 24 * 60,
    };

  const [configs, setConfigs] = useState({
    CRITICAL: getPolicy("CRITICAL"),
    HIGH: getPolicy("HIGH"),
    MEDIUM: getPolicy("MEDIUM"),
    LOW: getPolicy("LOW"),
  });

  const handleUpdate = (
    priority: keyof typeof configs,
    field: string,
    value: string
  ) => {
    setConfigs((prev) => ({
      ...prev,
      [priority]: {
        ...prev[priority],
        [field]: parseInt(value) || 0,
      },
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await Promise.all([
        updateSlaPolicy({ priority: "CRITICAL", ...configs.CRITICAL }),
        updateSlaPolicy({ priority: "HIGH", ...configs.HIGH }),
        updateSlaPolicy({ priority: "MEDIUM", ...configs.MEDIUM }),
        updateSlaPolicy({ priority: "LOW", ...configs.LOW }),
      ]);
      toast({ title: "SLA Policies Updated" });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Failed to update policies", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>SLA Configuration</DialogTitle>
          <DialogDescription>
            Set target response and resolution times for each priority level.
            Times are in minutes.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((priority) => (
            <div
              key={priority}
              className="grid grid-cols-12 gap-4 items-center border-b pb-4 last:border-0 last:pb-0"
            >
              <div className="col-span-2 font-semibold text-sm">{priority}</div>
              <div className="col-span-5 space-y-1">
                <Label className="text-xs text-slate-500">
                  Target Response (Min)
                </Label>
                <Input
                  type="number"
                  value={
                    configs[priority as keyof typeof configs]
                      .responseTimeMinutes
                  }
                  onChange={(e) =>
                    handleUpdate(
                      priority as any,
                      "responseTimeMinutes",
                      e.target.value
                    )
                  }
                />
              </div>
              <div className="col-span-5 space-y-1">
                <Label className="text-xs text-slate-500">
                  Target Resolution (Min)
                </Label>
                <Input
                  type="number"
                  value={
                    configs[priority as keyof typeof configs].resolveTimeMinutes
                  }
                  onChange={(e) =>
                    handleUpdate(
                      priority as any,
                      "resolveTimeMinutes",
                      e.target.value
                    )
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
