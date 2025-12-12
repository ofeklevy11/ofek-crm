"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  MoreHorizontal,
  Plus,
  Search,
  Filter,
  Kanban,
  List as ListIcon,
  MessageSquare,
  User as UserIcon,
  Calendar,
  Settings,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import TicketModal from "./ticket-modal";
import TicketDetails from "./ticket-details";
import SlaConfigModal from "./sla-config";
import { deleteTicket } from "@/app/actions/tickets";

interface ServicePageClientProps {
  initialTickets: any[];
  users: any[];
  clients: any[];
  initialSlaPolicies: any[];
}

export default function ServicePageClient({
  initialTickets,
  users,
  clients,
  initialSlaPolicies,
}: ServicePageClientProps) {
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [searchQuery, setSearchQuery] = useState("");
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [slaModalOpen, setSlaModalOpen] = useState(false);

  // Computed tickets
  const filteredTickets = initialTickets.filter(
    (ticket) =>
      ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.client?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.id.toString().includes(searchQuery)
  );

  const stats = {
    open: initialTickets.filter((t) => t.status === "OPEN").length,
    inProgress: initialTickets.filter((t) => t.status === "IN_PROGRESS").length,
    urgent: initialTickets.filter(
      (t) => t.priority === "HIGH" || t.priority === "CRITICAL"
    ).length,
  };

  return (
    <div className="h-full flex flex-col space-y-6 p-8 bg-slate-50/50">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Customer Service
          </h1>
          <p className="text-slate-500 mt-1">
            Manage support tickets, retention, and utilize SLA automations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setSlaModalOpen(true)}>
            <Settings className="w-4 h-4 mr-2" />
            SLA Settings
          </Button>
          <Button
            onClick={() => setTicketModalOpen(true)}
            className="bg-slate-900 hover:bg-slate-800"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Ticket
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard
          title="Open Tickets"
          value={stats.open}
          icon={AlertCircle}
          color="text-blue-600"
          bgColor="bg-blue-50"
        />
        <StatsCard
          title="In Progress"
          value={stats.inProgress}
          icon={Clock}
          color="text-amber-600"
          bgColor="bg-amber-50"
        />
        <StatsCard
          title="Urgent Attention"
          value={stats.urgent}
          icon={AlertCircle}
          color="text-red-600"
          bgColor="bg-red-50"
        />
      </div>

      {/* Filters & View Toggle */}
      <div className="flex items-center justify-between gap-4 bg-white p-2 rounded-lg border shadow-sm">
        <div className="flex items-center gap-2 flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 text-slate-400" />
          <Input
            placeholder="Search tickets..."
            className="pl-9 bg-transparent border-0 focus-visible:ring-0 max-w-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 border-l pl-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              viewMode === "kanban" && "bg-slate-100 text-slate-900"
            )}
            onClick={() => setViewMode("kanban")}
          >
            <Kanban className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(viewMode === "list" && "bg-slate-100 text-slate-900")}
            onClick={() => setViewMode("list")}
          >
            <ListIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0">
        {viewMode === "kanban" ? (
          <TicketKanban
            tickets={filteredTickets}
            onSelect={setSelectedTicket}
          />
        ) : (
          <TicketList tickets={filteredTickets} onSelect={setSelectedTicket} />
        )}
      </div>

      {/* Modals */}
      <TicketModal
        open={ticketModalOpen}
        onOpenChange={setTicketModalOpen}
        users={users}
        clients={clients}
      />

      {selectedTicket && (
        <TicketDetails
          ticket={selectedTicket}
          open={!!selectedTicket}
          onOpenChange={(open) => !open && setSelectedTicket(null)}
          users={users}
        />
      )}

      <SlaConfigModal
        open={slaModalOpen}
        onOpenChange={setSlaModalOpen}
        policies={initialSlaPolicies}
      />
    </div>
  );
}

function StatsCard({ title, value, icon: Icon, color, bgColor }: any) {
  return (
    <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between transition-all hover:shadow-md">
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <h3 className="text-2xl font-bold mt-1 text-slate-900">{value}</h3>
      </div>
      <div className={cn("p-3 rounded-lg", bgColor)}>
        <Icon className={cn("w-6 h-6", color)} />
      </div>
    </div>
  );
}

function TicketKanban({
  tickets,
  onSelect,
}: {
  tickets: any[];
  onSelect: (t: any) => void;
}) {
  const columns = [
    { id: "OPEN", label: "Open", color: "bg-blue-500" },
    { id: "IN_PROGRESS", label: "In Progress", color: "bg-amber-500" },
    { id: "WAITING", label: "Waiting", color: "bg-purple-500" },
    { id: "RESOLVED", label: "Resolved", color: "bg-green-500" },
  ];

  return (
    <div className="h-full overflow-x-auto pb-4">
      <div className="flex gap-4 h-full min-w-[1000px]">
        {columns.map((col) => (
          <div
            key={col.id}
            className="flex-1 flex flex-col gap-3 min-w-[280px]"
          >
            <div className="flex items-center justify-between p-1">
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", col.color)} />
                <span className="font-semibold text-sm text-slate-700">
                  {col.label}
                </span>
                <span className="text-xs text-slate-400 font-medium px-2 py-0.5 bg-slate-100 rounded-full">
                  {tickets.filter((t) => t.status === col.id).length}
                </span>
              </div>
            </div>
            <div className="flex-1 bg-slate-50/50 rounded-lg p-2 flex flex-col gap-2 overflow-y-auto">
              {tickets
                .filter((t) => t.status === col.id)
                .map((ticket) => (
                  <div
                    key={ticket.id}
                    className="bg-white p-3 rounded-lg border shadow-sm cursor-pointer hover:shadow-md transition-all group"
                    onClick={() => onSelect(ticket)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          getPriorityColor(ticket.priority)
                        )}
                      >
                        {ticket.priority}
                      </Badge>
                      <span className="text-xs text-slate-400">
                        #{ticket.id}
                      </span>
                    </div>
                    <h4 className="font-medium text-sm text-slate-900 line-clamp-2 mb-2">
                      {ticket.title}
                    </h4>
                    <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                      <div
                        className="flex items-center gap-1.5"
                        title={ticket.assignee?.name || "Unassigned"}
                      >
                        {ticket.assignee ? (
                          <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                            {ticket.assignee.name.charAt(0)}
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-slate-100 border border-dashed flex items-center justify-center">
                            <UserIcon className="w-3 h-3 text-slate-400" />
                          </div>
                        )}
                        <span>
                          {ticket.assignee?.name.split(" ")[0] || "Unassigned"}
                        </span>
                      </div>
                      {ticket.comments.length > 0 && (
                        <div className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          <span>{ticket.comments.length}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TicketList({
  tickets,
  onSelect,
}: {
  tickets: any[];
  onSelect: (t: any) => void;
}) {
  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-50 text-slate-500 border-b">
          <tr>
            <th className="px-4 py-3 font-medium">Ticket</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Client</th>
            <th className="px-4 py-3 font-medium">Assignee</th>
            <th className="px-4 py-3 font-medium">Priority</th>
            <th className="px-4 py-3 font-medium">Created</th>
            <th className="px-4 py-3 font-medium w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {tickets.map((ticket) => (
            <tr
              key={ticket.id}
              className="hover:bg-slate-50/50 cursor-pointer transition-colors"
              onClick={() => onSelect(ticket)}
            >
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{ticket.title}</div>
                <div className="text-xs text-slate-500">
                  #{ticket.id} • {ticket.type}
                </div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={ticket.status} />
              </td>
              <td className="px-4 py-3 text-slate-600">
                {ticket.client?.name || "-"}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {ticket.assignee ? (
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                      {ticket.assignee.name.charAt(0)}
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                      <UserIcon className="w-3 h-3 text-slate-400" />
                    </div>
                  )}
                  <span className="text-slate-600 truncate max-w-[100px]">
                    {ticket.assignee?.name || "Unassigned"}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant="outline"
                  className={cn("text-xs", getPriorityColor(ticket.priority))}
                >
                  {ticket.priority}
                </Badge>
              </td>
              <td className="px-4 py-3 text-slate-500">
                {format(new Date(ticket.createdAt), "MMM d, yyyy")}
              </td>
              <td className="px-4 py-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      confirm("Are you sure you want to delete this ticket?")
                    ) {
                      deleteTicket(ticket.id).catch(() =>
                        alert("Failed to delete ticket")
                      );
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-700 border-blue-200",
    IN_PROGRESS: "bg-amber-100 text-amber-700 border-amber-200",
    WAITING: "bg-purple-100 text-purple-700 border-purple-200",
    RESOLVED: "bg-green-100 text-green-700 border-green-200",
    CLOSED: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <Badge
      variant="outline"
      className={cn("capitalize shadow-none", styles[status] || styles.CLOSED)}
    >
      {status.replace("_", " ").toLowerCase()}
    </Badge>
  );
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "CRITICAL":
      return "text-red-700 bg-red-50 border-red-200";
    case "HIGH":
      return "text-orange-700 bg-orange-50 border-orange-200";
    case "MEDIUM":
      return "text-blue-700 bg-blue-50 border-blue-200";
    default:
      return "text-slate-700 bg-slate-50 border-slate-200";
  }
}
