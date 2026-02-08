"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import {
  Search,
  ArrowRight,
  Plus,
  MoreHorizontal,
  Power,
  PowerOff,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Edit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import SlaAutomationModal from "@/components/SlaAutomationModal";
import {
  toggleAutomationRule,
  deleteAutomationRule,
} from "@/app/actions/automations";
import { useRouter, useSearchParams } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ServiceAutomationsClientProps {
  initialAutomations: any[];
  users: any[];
}

export default function ServiceAutomationsClient({
  initialAutomations,
  users,
}: ServiceAutomationsClientProps) {
  const [automations, setAutomations] = useState(initialAutomations);
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Sync local state when initialAutomations changes (after router.refresh())
  useEffect(() => {
    setAutomations(initialAutomations);
  }, [initialAutomations]);

  // Handle editId from URL parameter (when navigating from other automation page)
  useEffect(() => {
    const editId = searchParams.get("editId");
    if (editId) {
      const ruleToEdit = initialAutomations.find(
        (r) => r.id === Number(editId),
      );
      if (ruleToEdit) {
        setEditingRule(ruleToEdit);
        setModalOpen(true);
        // Clear the URL parameter after opening the modal
        router.replace("/service/automations", { scroll: false });
      }
    }
  }, [searchParams, initialAutomations, router]);

  // Filter only Service related automations (TICKET_STATUS_CHANGE, SLA_BREACH)
  const filteredAutomations = automations.filter((rule) => {
    const isServiceRule =
      rule.triggerType === "TICKET_STATUS_CHANGE" ||
      rule.triggerType === "SLA_BREACH";
    const matchesSearch = rule.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());

    return isServiceRule && matchesSearch;
  });

  const handleToggle = async (id: number, currentStatus: boolean) => {
    // Optimistic
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isActive: !currentStatus } : a)),
    );

    try {
      await toggleAutomationRule(id, !currentStatus);
      router.refresh();
    } catch (error) {
      console.error("Failed to toggle rule");
      // Revert
      setAutomations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isActive: currentStatus } : a)),
      );
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק אוטומציה זו?")) return;

    const prev = [...automations];
    setAutomations((prev) => prev.filter((a) => a.id !== id));

    try {
      await deleteAutomationRule(id);
      router.refresh();
    } catch (error) {
      console.error("Failed to delete rule");
      setAutomations(prev);
    }
  };

  const handleEdit = (rule: any) => {
    setEditingRule(rule);
    setModalOpen(true);
  };

  const handleCreateNew = () => {
    setEditingRule(null);
    setModalOpen(true);
  };

  return (
    <div className="h-full flex flex-col space-y-6 p-8 bg-[#f4f8f8]" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/service"
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <ArrowRight className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold text-[#000000]">
              אוטומציות שירות
            </h1>
          </div>
          <p className="text-slate-600 text-sm">
            ניהול תהליכים אוטומטיים עבור קריאות שירות ו-SLA.
          </p>
        </div>
        <Button
          onClick={handleCreateNew}
          className="bg-[#4f95ff] hover:bg-blue-600 text-white"
        >
          <Plus className="w-4 h-4 ml-2" />
          אוטומציה חדשה
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 bg-white p-2 rounded-lg border shadow-sm">
        <div className="flex items-center gap-2 flex-1 relative">
          <Search className="w-4 h-4 absolute right-3 text-slate-400" />
          <Input
            placeholder="חיפוש אוטומציות..."
            className="pr-9 bg-transparent border-0 focus-visible:ring-0 max-w-sm text-right"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAutomations.map((rule) => (
          <AutomationCard
            key={rule.id}
            rule={rule}
            onToggle={() => handleToggle(rule.id, rule.isActive)}
            onDelete={() => handleDelete(rule.id)}
            onEdit={() => handleEdit(rule)}
          />
        ))}
        {filteredAutomations.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500 bg-white rounded-lg border border-dashed">
            לא נמצאו אוטומציות. צור את הראשונה שלך!
          </div>
        )}
      </div>

      <SlaAutomationModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setEditingRule(null);
            router.refresh();
          }
        }}
        users={users}
        initialData={editingRule}
      />
    </div>
  );
}

function AutomationCard({
  rule,
  onToggle,
  onDelete,
  onEdit,
}: {
  rule: any;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  // Calculate number of actions
  const getActionCount = () => {
    if (rule.actionType === "MULTI_ACTION") {
      return rule.actionConfig?.actions?.length || 0;
    }
    return rule.actionType ? 1 : 0;
  };

  const getActionSummary = () => {
    const actionLabels: Record<string, string> = {
      SEND_NOTIFICATION: "התראה",
      SEND_WHATSAPP: "WhatsApp",
      WEBHOOK: "Webhook",
      CREATE_TASK: "משימה",
    };

    if (rule.actionType === "MULTI_ACTION") {
      const actions = rule.actionConfig?.actions || [];
      const types = actions.map((a: any) => actionLabels[a.type] || a.type);
      return types.join(", ");
    }
    return actionLabels[rule.actionType] || rule.actionType;
  };

  const actionCount = getActionCount();

  return (
    <div
      className={`bg-white p-5 rounded-xl border shadow-sm transition-all hover:shadow-md relative overflow-hidden group ${
        !rule.isActive && "opacity-75 grayscale-[0.5]"
      }`}
    >
      <div
        className={`absolute top-0 right-0 w-1 h-full ${
          rule.isActive
            ? rule.triggerType === "SLA_BREACH"
              ? "bg-red-500"
              : "bg-blue-500"
            : "bg-slate-300"
        }`}
      />

      <div className="flex justify-between items-start mb-3 pl-2">
        <div className="flex items-center gap-2">
          <div
            className={`p-2 rounded-lg ${
              rule.triggerType === "SLA_BREACH"
                ? "bg-red-50 text-red-600"
                : "bg-blue-50 text-blue-600"
            }`}
          >
            {rule.triggerType === "SLA_BREACH" ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
          </div>
          {actionCount > 0 && (
            <Badge
              variant="outline"
              className="text-xs bg-purple-50 text-purple-600 border-purple-200"
            >
              {actionCount} פעולות
            </Badge>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-slate-600"
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Edit className="w-4 h-4 ml-2" />
              ערוך
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-red-600">
              <Trash2 className="w-4 h-4 ml-2" />
              מחק
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <h3
        className="font-bold text-[#000000] mb-2 pl-2 line-clamp-1"
        title={rule.name}
      >
        {rule.name}
      </h3>

      <div className="text-sm text-slate-500 mb-2 line-clamp-2">
        {getTriggerDescription(rule)}
      </div>

      {actionCount > 0 && (
        <div className="text-xs text-slate-400 mb-3 line-clamp-1">
          ← {getActionSummary()}
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t mt-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={rule.isActive}
            onCheckedChange={onToggle}
            dir="ltr"
          />
          <span className="text-xs font-medium text-slate-500">
            {rule.isActive ? "פועל" : "כבוי"}
          </span>
        </div>
        <div className="text-xs text-slate-400">
          {new Date(rule.createdAt).toLocaleDateString("he-IL")}
        </div>
      </div>
    </div>
  );
}

function getTriggerDescription(rule: any) {
  if (rule.triggerType === "SLA_BREACH") {
    const breachType = rule.triggerConfig?.breachType;
    const priority = rule.triggerConfig?.priority;

    const breachTypeLabels: any = {
      RESPONSE: "זמן תגובה",
      RESOLVE: "זמן פתרון",
    };

    const priorityLabels: any = {
      CRITICAL: "קריטי",
      HIGH: "גבוה",
      MEDIUM: "בינוני",
      LOW: "נמוך",
    };

    let description = "חריגת ";
    if (breachType && breachType !== "any") {
      description += breachTypeLabels[breachType] || breachType;
    } else {
      description += "SLA";
    }

    if (priority && priority !== "any") {
      description += ` עבור עדיפות ${priorityLabels[priority] || priority}`;
    }

    return description;
  }
  if (rule.triggerType === "TICKET_STATUS_CHANGE") {
    const from = rule.triggerConfig?.fromStatus || "any";
    const to = rule.triggerConfig?.toStatus || "any";

    // Simple translation for display
    const statusMap: any = {
      OPEN: "פתוח",
      IN_PROGRESS: "בטיפול",
      WAITING: "ממתין",
      RESOLVED: "טופל",
      CLOSED: "סגור",
      any: "כל סטטוס",
    };
    return `כאשר סטטוס משתנה מ-${statusMap[from] || from} ל-${
      statusMap[to] || to
    }`;
  }
  return "טריגר מותאם אישית";
}
