"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  X,
  Send,
  User,
  CheckCircle2,
  Clock,
  AlertCircle,
  MoreVertical,
  Paperclip,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  updateTicket,
  addTicketComment,
  deleteTicket,
} from "@/app/actions/tickets";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface TicketDetailsProps {
  ticket: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: any[];
}

export default function TicketDetails({
  ticket,
  open,
  onOpenChange,
  users,
}: TicketDetailsProps) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateTicket(ticket.id, { status: newStatus });
      toast({ title: "Status updated" });
    } catch (error) {
      toast({ title: "Failed to update status", variant: "destructive" });
    }
  };

  const handlePriorityChange = async (newPriority: string) => {
    try {
      await updateTicket(ticket.id, { priority: newPriority });
      toast({ title: "Priority updated" });
    } catch (error) {
      toast({ title: "Failed to update priority", variant: "destructive" });
    }
  };

  const handleAssigneeChange = async (assigneeId: string) => {
    try {
      await updateTicket(ticket.id, { assigneeId: parseInt(assigneeId) });
      toast({ title: "Assignee updated" });
    } catch (error) {
      toast({ title: "Failed to update assignee", variant: "destructive" });
    }
  };

  const handleSendComment = async () => {
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await addTicketComment(ticket.id, comment);
      setComment("");
    } catch (error) {
      toast({ title: "Failed to send comment", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col bg-white">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline">#{ticket.id}</Badge>
              <span className="text-sm text-slate-500">{ticket.type}</span>
            </div>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            {ticket.title}
          </h2>
          <div className="flex flex-wrap gap-4">
            <Select
              defaultValue={ticket.status}
              onValueChange={handleStatusChange}
            >
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="WAITING">Waiting</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
              </SelectContent>
            </Select>

            <Select
              defaultValue={ticket.priority}
              onValueChange={handlePriorityChange}
            >
              <SelectTrigger className="w-[120px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="CRITICAL">Critical</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="destructive"
              size="icon"
              className="h-8 w-8 ml-auto"
              onClick={async () => {
                if (confirm("Are you sure you want to delete this ticket?")) {
                  try {
                    await deleteTicket(ticket.id);
                    toast({ title: "Ticket deleted" });
                    onOpenChange(false);
                  } catch (error) {
                    toast({
                      title: "Failed to delete ticket",
                      variant: "destructive",
                    });
                  }
                }
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-8">
            {/* Description */}
            <div className="bg-slate-50 p-4 rounded-lg border">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">
                Description
              </h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">
                {ticket.description || "No description provided."}
              </p>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">
                  Client
                </label>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                    {ticket.client?.name.charAt(0) || "C"}
                  </div>
                  <div className="text-sm font-medium">
                    {ticket.client?.name || "No Client"}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">
                  Assignee
                </label>
                <Select
                  defaultValue={ticket.assigneeId?.toString() || ""}
                  onValueChange={handleAssigneeChange}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">
                  Created By
                </label>
                <div className="text-sm text-slate-900">
                  {ticket.creator?.name}
                </div>
                <div className="text-xs text-slate-500">
                  {format(new Date(ticket.createdAt), "PPp")}
                </div>
              </div>
            </div>

            <Separator />

            {/* Activity / Comments */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-4">
                Activity
              </h3>
              <div className="space-y-6">
                {ticket.comments.map((comment: any) => (
                  <div key={comment.id} className="flex gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-slate-200 text-slate-600">
                        {comment.user.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="bg-white border rounded-lg p-3 shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-slate-900">
                            {comment.user.name}
                          </span>
                          <span className="text-xs text-slate-400">
                            {format(new Date(comment.createdAt), "p")}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          {comment.content}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                {ticket.comments.length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    No comments yet. Start the conversation.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Input */}
        <div className="p-4 border-t bg-slate-50">
          <div className="flex gap-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Write a reply..."
              className="resize-none min-h-[44px] max-h-32 bg-white"
            />
            <Button
              size="icon"
              className="h-auto w-12 bg-blue-600 hover:bg-blue-700"
              onClick={handleSendComment}
              disabled={submitting || !comment.trim()}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
