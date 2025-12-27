"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { createTicket } from "@/app/actions/tickets";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface TicketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: any[];
  clients: any[];
}

export default function TicketModal({
  open,
  onOpenChange,
  users,
  clients,
}: TicketModalProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "MEDIUM",
    type: "SERVICE",
    clientId: "",
    assigneeId: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;

    setLoading(true);
    try {
      await createTicket({
        ...formData,
        clientId: formData.clientId ? parseInt(formData.clientId) : undefined,
        assigneeId: formData.assigneeId
          ? parseInt(formData.assigneeId)
          : undefined,
        status: "OPEN",
      });

      toast({
        title: "הצלחה",
        description: "הקריאה נוצרה בהצלחה",
      });

      onOpenChange(false);
      setFormData({
        title: "",
        description: "",
        priority: "MEDIUM",
        type: "SERVICE",
        clientId: "",
        assigneeId: "",
      });
    } catch (error) {
      toast({
        title: "שגיאה",
        description: "שגיאה ביצירת הקריאה",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="text-[#000000]">פתיחת קריאה חדשה</DialogTitle>
          <DialogDescription className="text-right">
            פתח קריאת שירות חדשה או בקשה לעזרה.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-right block">
              נושא
            </Label>
            <Input
              id="title"
              placeholder="לדוגמה: מדפסת מקולקלת"
              value={formData.title}
              onChange={(e) =>
                setFormData((d) => ({ ...d, title: e.target.value }))
              }
              required
              className="text-right"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type" className="text-right block">
                סוג
              </Label>
              <Select
                value={formData.type}
                onValueChange={(val) =>
                  setFormData((d) => ({ ...d, type: val }))
                }
              >
                <SelectTrigger className="text-right" dir="rtl">
                  <SelectValue placeholder="בחר סוג" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="SERVICE">שירות</SelectItem>
                  <SelectItem value="COMPLAINT">תלונה</SelectItem>
                  <SelectItem value="RETENTION">שימור</SelectItem>
                  <SelectItem value="OTHER">אחר</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority" className="text-right block">
                עדיפות
              </Label>
              <Select
                value={formData.priority}
                onValueChange={(val) =>
                  setFormData((d) => ({ ...d, priority: val }))
                }
              >
                <SelectTrigger className="text-right" dir="rtl">
                  <SelectValue placeholder="בחר עדיפות" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="LOW">נמוך</SelectItem>
                  <SelectItem value="MEDIUM">בינוני</SelectItem>
                  <SelectItem value="HIGH">גבוה</SelectItem>
                  <SelectItem value="CRITICAL">קריטי</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client" className="text-right block">
              לקוח
            </Label>
            <Select
              value={formData.clientId}
              onValueChange={(val) =>
                setFormData((d) => ({ ...d, clientId: val }))
              }
            >
              <SelectTrigger className="text-right" dir="rtl">
                <SelectValue placeholder="בחר לקוח" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id.toString()}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assignee" className="text-right block">
              נציג מטפל (אופציונלי)
            </Label>
            <Select
              value={formData.assigneeId}
              onValueChange={(val) =>
                setFormData((d) => ({ ...d, assigneeId: val }))
              }
            >
              <SelectTrigger className="text-right" dir="rtl">
                <SelectValue placeholder="לא משויך" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="0">לא משויך</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id.toString()}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-right block">
              תיאור
            </Label>
            <Textarea
              id="description"
              placeholder="תיאור מפורט של הבעיה..."
              rows={4}
              value={formData.description}
              onChange={(e) =>
                setFormData((d) => ({ ...d, description: e.target.value }))
              }
              className="text-right"
            />
          </div>

          <DialogFooter className="flex-row-reverse sm:justify-start gap-2">
            <Button
              type="submit"
              disabled={loading}
              className="bg-[#4f95ff] hover:bg-blue-600 text-white"
            >
              {loading && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              צור קריאה
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              ביטול
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
