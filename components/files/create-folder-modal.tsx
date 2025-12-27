"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderPlus } from "lucide-react";
import { createFolder } from "@/app/actions/storage";

interface CreateFolderModalProps {
  currentFolderId: number | null;
}

export function CreateFolderModal({ currentFolderId }: CreateFolderModalProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    setLoading(true);
    try {
      await createFolder(name, currentFolderId);
      setOpen(false);
      setName("");
    } catch (error) {
      console.error("Failed to create folder:", error);
      alert("נכשל ביצירת התיקייה");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 border-[#4f95ff] text-[#4f95ff] hover:bg-[#4f95ff]/10"
        >
          <FolderPlus className="h-4 w-4" />
          תיקייה חדשה
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle>יצירת תיקייה חדשה</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-right block">
              שם התיקייה
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="לדוגמה: חוזים"
              autoFocus
              className="text-right"
            />
          </div>
          <DialogFooter className="mr-auto flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              ביטול
            </Button>
            <Button
              type="submit"
              disabled={loading || !name}
              className="bg-[#4f95ff] hover:bg-[#4f95ff]/90 text-white"
            >
              {loading ? "יוצר..." : "צור תיקייה"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
