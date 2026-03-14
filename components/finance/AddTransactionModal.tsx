"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addFinanceRecord } from "@/app/actions/finance-records";

export default function AddTransactionModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    amount: "",
    type: "EXPENSE",
    category: "",
    date: new Date().toISOString().split("T")[0],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await addFinanceRecord({
        title: formData.title,
        amount: Number(formData.amount),
        type: formData.type as "INCOME" | "EXPENSE",
        category: formData.category,
        date: new Date(formData.date),
      });

      toast.success("התנועה נקלטה במערכת");
      setOpen(false);
      setFormData({
        title: "",
        amount: "",
        type: "EXPENSE",
        category: "",
        date: new Date().toISOString().split("T")[0],
      });
    } catch (err) {
      toast.error("לא ניתן להוסיף כעת");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="font-bold bg-[#4f95ff] hover:bg-blue-600 shadow-lg shadow-blue-200">
          <Plus className="w-4 h-4 mr-2" />
          הוסף תנועה
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-right">הוספת תנועה חדשה</DialogTitle>
          <DialogDescription className="sr-only">טופס להוספת תנועת הכנסה או הוצאה חדשה</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-right block">סוג תנועה</Label>
              <Select
                value={formData.type}
                onValueChange={(val) =>
                  setFormData((p) => ({ ...p, type: val }))
                }
              >
                <SelectTrigger className="text-right">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCOME">הכנסה (+)</SelectItem>
                  <SelectItem value="EXPENSE">הוצאה (-)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-right block">תאריך</Label>
              <Input
                type="date"
                required
                value={formData.date}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, date: e.target.value }))
                }
                className="text-right"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-right block">תיאור / כותרת</Label>
            <Input
              placeholder="למשל: תשלום ספקים, מכירה ללקוח..."
              required
              value={formData.title}
              onChange={(e) =>
                setFormData((p) => ({ ...p, title: e.target.value }))
              }
              className="text-right"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-right block">סכום (₪)</Label>
              <Input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, amount: e.target.value }))
                }
                className="text-right"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">קטגוריה (אופציונלי)</Label>
              <Input
                placeholder="שיווק, משרד, וכו'"
                value={formData.category}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, category: e.target.value }))
                }
                className="text-right"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-[#a24ec1] hover:bg-[#8e3dab]"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "שמור תנועה"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
