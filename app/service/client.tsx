"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import {
  CheckCircle,
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
  GripVertical,
  AlertTriangle,
  Archive,
} from "lucide-react";
import Link from "next/link";
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
import { deleteTicket, updateTicket } from "@/app/actions/tickets";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  DragEndEvent,
  DragStartEvent,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { createPortal } from "react-dom";

interface ServicePageClientProps {
  initialTickets: any[];
  users: any[];
  clients: any[];
  initialSlaPolicies: any[];
  ticketStats: {
    open: number;
    inProgress: number;
    waiting: number;
    closed: number;
    breached: number;
  };
  currentUser?: { id: number; role: string };
}

export default function ServicePageClient({
  initialTickets,
  users,
  clients,
  initialSlaPolicies,
  ticketStats,
  currentUser,
}: ServicePageClientProps) {
  const [tickets, setTickets] = useState(initialTickets);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [searchQuery, setSearchQuery] = useState("");
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [slaModalOpen, setSlaModalOpen] = useState(false);

  useEffect(() => {
    setTickets(initialTickets);
  }, [initialTickets]);

  // Handle ticket updates from TicketDetails - instant UI update
  const handleTicketUpdate = (updatedTicket: any) => {
    // Update selected ticket for the details panel
    setSelectedTicket(updatedTicket);
    // Update the ticket in the main list
    setTickets((prev) =>
      prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t))
    );
  };

  // Computed tickets
  const filteredTickets = tickets.filter(
    (ticket) =>
      ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.client?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.id.toString().includes(searchQuery)
  );

  const stats = {
    open: tickets.filter((t) => t.status === "OPEN").length,
    inProgress: tickets.filter((t) => t.status === "IN_PROGRESS").length,
    urgent: tickets.filter(
      (t) => t.priority === "HIGH" || t.priority === "CRITICAL"
    ).length,
  };

  const [activeDragTicket, setActiveDragTicket] = useState<any>(null);

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragTicket(null);
    const { active, over } = event;

    if (!over) return;

    const ticketId = active.id as number;
    const newStatus = over.id as string;

    const ticket = tickets.find((t) => t.id === ticketId);

    if (ticket && ticket.status !== newStatus) {
      // Optimistic update
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
      );

      try {
        await updateTicket(ticketId, { status: newStatus });
      } catch (error) {
        // Revert on failure
        setTickets((prev) =>
          prev.map((t) =>
            t.id === ticketId ? { ...t, status: ticket.status } : t
          )
        );
        alert("נכשל בעדכון סטטוס הקריאה");
      }
    }
  };

  const onDragStart = (event: DragStartEvent) => {
    const ticketId = event.active.id as number;
    const ticket = tickets.find((t) => t.id === ticketId);
    if (ticket) {
      setActiveDragTicket(ticket);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-6 p-8 bg-[#f4f8f8]" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#000000]">
            שירות לקוחות
          </h1>
          <p className="text-slate-600 mt-1 text-sm">
            ניהול קריאות שירות, שימור לקוחות ואוטומציות SLA במקום אחד.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/service/sla-breaches">
            <Button
              variant="outline"
              className="border-slate-200 hover:bg-slate-50 text-red-600 hover:text-red-700"
            >
              <AlertTriangle className="w-4 h-4 ml-2" />
              חריגות SLA
            </Button>
          </Link>
          <Link href="/service/automations">
            <Button
              variant="outline"
              className="border-slate-200 hover:bg-slate-50"
            >
              <Settings className="w-4 h-4 ml-2" />
              אוטומציות
            </Button>
          </Link>
          <Link href="/service/archive">
            <Button
              variant="outline"
              className="border-slate-200 hover:bg-slate-50"
            >
              <Archive className="w-4 h-4 ml-2" />
              ארכיון
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={() => setSlaModalOpen(true)}
            className="border-slate-200 hover:bg-slate-50"
          >
            <Clock className="w-4 h-4 ml-2" />
            הגדרות SLA
          </Button>
          <Button
            onClick={() => setTicketModalOpen(true)}
            className="bg-[#4f95ff] hover:bg-blue-600 text-white"
          >
            <Plus className="w-4 h-4 ml-2" />
            קריאה חדשה
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {/* Stats Cards - Bento Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="lg:col-span-2">
          <StatsCard
            title="קריאות פתוחות"
            value={ticketStats?.open || 0}
            icon={AlertCircle}
            color="text-[#4f95ff]"
            bgColor="bg-blue-50"
          />
        </div>
        <div className="lg:col-span-2">
          <StatsCard
            title="בטיפול"
            value={ticketStats?.inProgress || 0}
            icon={Clock}
            color="text-[#a24ec1]"
            bgColor="bg-purple-50"
          />
        </div>
        <div className="lg:col-span-2">
          <StatsCard
            title="תשומת לב דחופה"
            value={stats.urgent}
            icon={AlertTriangle}
            color="text-orange-500"
            bgColor="bg-orange-50"
          />
        </div>
        {/* New Cards */}
        <div className="lg:col-span-3">
          <Link href="/service/sla-breaches" className="block h-full">
            <StatsCard
              title="קריאות בחריגה"
              value={ticketStats?.breached || 0}
              icon={AlertTriangle}
              color="text-red-600"
              bgColor="bg-red-50"
              fullBackground
            />
          </Link>
        </div>
        <div className="lg:col-span-3">
          <Link href="/service/archive" className="block h-full">
            <StatsCard
              title="קריאות סגורות"
              value={ticketStats?.closed || 0}
              icon={CheckCircle}
              color="text-green-600"
              bgColor="bg-green-100"
              fullBackground
            />
          </Link>
        </div>
      </div>

      {/* Filters & View Toggle */}
      <div className="flex items-center justify-between gap-4 bg-white p-2 rounded-lg border shadow-sm">
        <div className="flex items-center gap-2 flex-1 relative">
          <Search className="w-4 h-4 absolute right-3 text-slate-400" />
          <Input
            placeholder="חיפוש קריאות..."
            className="pr-9 bg-transparent border-0 focus-visible:ring-0 max-w-sm text-right"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 border-r pr-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              viewMode === "kanban" && "bg-slate-100 text-[#000000]"
            )}
            onClick={() => setViewMode("kanban")}
          >
            <Kanban className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(viewMode === "list" && "bg-slate-100 text-[#000000]")}
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
            onDragEnd={handleDragEnd}
            onDragStart={onDragStart}
            activeDragTicket={activeDragTicket}
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
          clients={clients}
          currentUser={currentUser}
          onTicketUpdate={handleTicketUpdate}
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

function StatsCard({
  title,
  value,
  icon: Icon,
  color,
  bgColor,
  fullBackground,
}: any) {
  return (
    <div
      className={cn(
        "p-4 rounded-xl border shadow-sm flex items-center justify-between transition-all hover:shadow-md",
        fullBackground ? bgColor : "bg-white",
        fullBackground ? "border-transparent" : "border-slate-100"
      )}
    >
      <div>
        <p
          className={cn(
            "text-sm font-medium",
            fullBackground ? "text-slate-700" : "text-slate-500"
          )}
        >
          {title}
        </p>
        <h3 className="text-2xl font-bold mt-1 text-[#000000]">{value}</h3>
      </div>
      <div
        className={cn("p-3 rounded-lg", fullBackground ? "bg-white" : bgColor)}
      >
        <Icon className={cn("w-6 h-6", color)} />
      </div>
    </div>
  );
}

function TicketKanban({
  tickets,
  onSelect,
  onDragEnd,
  onDragStart,
  activeDragTicket,
}: {
  tickets: any[];
  onSelect: (t: any) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragStart: (event: DragStartEvent) => void;
  activeDragTicket: any;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const columns = [
    { id: "OPEN", label: "פתוח", color: "bg-[#4f95ff]" },
    { id: "IN_PROGRESS", label: "בטיפול", color: "bg-[#a24ec1]" },
    { id: "WAITING", label: "ממתין", color: "bg-orange-500" },
    { id: "RESOLVED", label: "טופל", color: "bg-green-500" },
  ];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
    >
      <div className="h-full overflow-x-auto pb-4">
        <div className="flex gap-4 h-full min-w-[1000px]">
          {columns.map((col) => (
            <DroppableColumn
              key={col.id}
              column={col}
              tickets={tickets.filter((t) => t.status === col.id)}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
      {createPortal(
        <DragOverlay>
          {activeDragTicket ? (
            <TicketCard
              ticket={activeDragTicket}
              onSelect={() => {}}
              isDragOverlay
            />
          ) : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}

function DroppableColumn({
  column,
  tickets,
  onSelect,
}: {
  column: { id: string; label: string; color: string };
  tickets: any[];
  onSelect: (t: any) => void;
}) {
  const { setNodeRef } = useDroppable({
    id: column.id,
  });

  return (
    <div className="flex-1 flex flex-col gap-3 min-w-[280px]">
      <div className="flex items-center justify-between p-1">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", column.color)} />
          <span className="font-semibold text-sm text-[#000000]">
            {column.label}
          </span>
          <span className="text-xs text-slate-500 font-medium px-2 py-0.5 bg-slate-100 rounded-full">
            {tickets.length}
          </span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className="flex-1 bg-slate-50/50 rounded-lg p-2 flex flex-col gap-2 overflow-y-auto"
      >
        {tickets.map((ticket) => (
          <DraggableTicketCard
            key={ticket.id}
            ticket={ticket}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function DraggableTicketCard({
  ticket,
  onSelect,
}: {
  ticket: any;
  onSelect: (t: any) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: ticket.id,
    });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "opacity-50 grayscale")}
    >
      <TicketCard
        ticket={ticket}
        onSelect={onSelect}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function TicketCard({
  ticket,
  onSelect,
  dragHandleProps,
  isDragOverlay,
}: {
  ticket: any;
  onSelect: (t: any) => void;
  dragHandleProps?: any;
  isDragOverlay?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-white p-3 rounded-lg border shadow-sm transition-all group relative",
        !isDragOverlay && "hover:shadow-md",
        isDragOverlay && "shadow-xl cursor-grabbing rotate-2 scale-105"
      )}
      onClick={() => onSelect(ticket)}
    >
      {/* Drag Handle */}
      {dragHandleProps && (
        <div
          {...dragHandleProps}
          className="absolute top-3 left-3 cursor-grab text-slate-300 hover:text-slate-500 p-1 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </div>
      )}

      <div className="flex justify-between items-center mb-2 pl-6">
        {" "}
        {/* Added padding for handle */}
        <Badge
          variant="outline"
          className={cn("text-xs", getPriorityColor(ticket.priority))}
        >
          {getPriorityLabel(ticket.priority)}
        </Badge>
        <span className="text-xs text-slate-400">#{ticket.id}</span>
      </div>
      <h4 className="font-medium text-sm text-[#000000] line-clamp-2 mb-2 text-right">
        {ticket.title}
      </h4>
      <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
        <div
          className="flex items-center gap-1.5"
          title={ticket.assignee?.name || "לא משויך"}
        >
          {ticket.assignee ? (
            <div className="w-5 h-5 rounded-full bg-indigo-50 text-[#4f95ff] flex items-center justify-center text-[10px] font-bold">
              {ticket.assignee.name.charAt(0)}
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full bg-slate-100 border border-dashed flex items-center justify-center">
              <UserIcon className="w-3 h-3 text-slate-400" />
            </div>
          )}
          <span>{ticket.assignee?.name.split(" ")[0] || "לא משויך"}</span>
        </div>
        {ticket.comments.length > 0 && (
          <div className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            <span>{ticket.comments.length}</span>
          </div>
        )}
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
    <div
      className="bg-white rounded-lg border shadow-sm overflow-hidden"
      dir="rtl"
    >
      <table className="w-full text-sm text-right">
        <thead className="bg-slate-50 text-slate-500 border-b">
          <tr>
            <th className="px-4 py-3 font-medium">קריאה</th>
            <th className="px-4 py-3 font-medium">סטטוס</th>
            <th className="px-4 py-3 font-medium">לקוח</th>
            <th className="px-4 py-3 font-medium">נציג מטפל</th>
            <th className="px-4 py-3 font-medium">עדיפות</th>
            <th className="px-4 py-3 font-medium">נוצר בתאריך</th>
            <th className="px-4 py-3 font-medium">עודכן בתאריך</th>
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
                <div className="font-medium text-[#000000]">{ticket.title}</div>
                <div className="text-xs text-slate-500">
                  #{ticket.id} • {getTypeLabel(ticket.type)}
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
                    <div className="w-6 h-6 rounded-full bg-blue-50 text-[#4f95ff] flex items-center justify-center text-xs font-bold">
                      {ticket.assignee.name.charAt(0)}
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                      <UserIcon className="w-3 h-3 text-slate-400" />
                    </div>
                  )}
                  <span className="text-slate-600 truncate max-w-[100px]">
                    {ticket.assignee?.name || "לא משויך"}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant="outline"
                  className={cn("text-xs", getPriorityColor(ticket.priority))}
                >
                  {getPriorityLabel(ticket.priority)}
                </Badge>
              </td>
              <td className="px-4 py-3 text-slate-500">
                {format(new Date(ticket.createdAt), "d MMM, yyyy", {
                  locale: he,
                })}
              </td>
              <td className="px-4 py-3 text-slate-500">
                {format(new Date(ticket.updatedAt), "d MMM, yyyy", {
                  locale: he,
                })}
              </td>
              <td className="px-4 py-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("האם אתה בטוח שברצונך למחוק קריאה זו?")) {
                      deleteTicket(ticket.id).catch(() =>
                        alert("שגיאה במחיקת הקריאה")
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
    OPEN: "bg-blue-100 text-[#4f95ff] border-blue-200",
    IN_PROGRESS: "bg-purple-100 text-[#a24ec1] border-purple-200",
    WAITING: "bg-orange-100 text-orange-600 border-orange-200",
    RESOLVED: "bg-green-100 text-green-600 border-green-200",
    CLOSED: "bg-slate-100 text-slate-600 border-slate-200",
  };

  const labels: Record<string, string> = {
    OPEN: "פתוח",
    IN_PROGRESS: "בטיפול",
    WAITING: "ממתין",
    RESOLVED: "טופל",
    CLOSED: "סגור",
  };

  return (
    <Badge
      variant="outline"
      className={cn("capitalize shadow-none", styles[status] || styles.CLOSED)}
    >
      {labels[status] || "סגור"}
    </Badge>
  );
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "CRITICAL":
      return "text-red-600 bg-red-50 border-red-200";
    case "HIGH":
      return "text-orange-600 bg-orange-50 border-orange-200";
    case "MEDIUM":
      return "text-[#4f95ff] bg-blue-50 border-blue-200";
    default:
      return "text-slate-600 bg-slate-50 border-slate-200";
  }
}

function getPriorityLabel(priority: string) {
  switch (priority) {
    case "CRITICAL":
      return "קריטי";
    case "HIGH":
      return "גבוה";
    case "MEDIUM":
      return "בינוני";
    case "LOW":
      return "נמוך";
    default:
      return priority;
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case "SERVICE":
      return "שירות";
    case "COMPLAINT":
      return "תלונה";
    case "RETENTION":
      return "שימור";
    case "OTHER":
      return "אחר";
    default:
      return type;
  }
}
