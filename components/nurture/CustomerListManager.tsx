"use client";

import React, { useState, useEffect } from "react";
import {
  Plus,
  Search,
  User,
  Database,
  Check,
  X,
  Loader2,
  Zap,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Pencil,
  ArrowLeft,
  Settings,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

import {
  getDataSources,
  getDataSourceRecords,
  getTableFields,
  getRawTableRecords,
  addNurtureSubscriberManual,
  getNurtureRules,
  DataSource,
  DataRecord,
  FieldDefinition,
} from "@/app/nurture-hub/actions";

import {
  createAutomationRule,
  deleteAutomationRule,
  toggleAutomationRule,
  updateAutomationRule,
} from "@/app/actions/automations";
import { getUsers } from "@/app/actions/users";
import { Badge } from "@/components/ui/badge";

// Types - Use shared types where possible or map them
interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  source: string;
}

interface CustomerListProps {
  onAddCustomers: (customers: Customer[]) => void;
  title?: string;
  description?: string;
  listSlug?: string; // e.g. "birthday", "referral"
}

export default function CustomerListManager({
  onAddCustomers,
  title = "ניהול רשימת לקוחות",
  description = "הוסף לקוחות ידנית או משוך מתוך מאגרי המידע הקיימים",
  listSlug = "birthday",
  automationOpenProp,
  onAutomationOpenChangeProp,
}: CustomerListProps & {
  automationOpenProp?: boolean;
  onAutomationOpenChangeProp?: (open: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("manual"); // manual, database
  const [loading, setLoading] = useState(false);

  // Automation State
  const [internalAutomationOpen, setInternalAutomationOpen] = useState(false);

  const automationOpen =
    automationOpenProp !== undefined
      ? automationOpenProp
      : internalAutomationOpen;
  const setAutomationOpen = (open: boolean) => {
    if (onAutomationOpenChangeProp) {
      onAutomationOpenChangeProp(open);
    } else {
      setInternalAutomationOpen(open);
    }
  };
  const [autoStep, setAutoStep] = useState(1);
  const [autoViewMode, setAutoViewMode] = useState<"list" | "create" | "edit">(
    "list"
  );
  const [existingRules, setExistingRules] = useState<any[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [autoConfig, setAutoConfig] = useState({
    trigger: "record_created", // record_created, status_changed
    tableId: "",
    fields: { name: "", email: "", phone: "" },
    condition: { field: "", fromValue: "", toValue: "" },
  });
  const [postAddActions, setPostAddActions] = useState({
    sendNotification: true,
    notifyUserId: "",
    notifyMessage: "לקוח חדש נוסף לרשימה!",
  });
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);
  const [tableFields, setTableFields] = useState<FieldDefinition[]>([]);
  const [fetchingFields, setFetchingFields] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Manual Form State
  const [manualForm, setManualForm] = useState({
    name: "",
    email: "",
    phone: "",
  });

  // Database Search State
  const [tables, setTables] = useState<DataSource[]>([]);

  // 3. Load Fields when Automation Table changes
  useEffect(() => {
    if (!autoConfig.tableId) return;

    // Only load for actual tables (numeric IDs usually)
    if (isNaN(parseInt(autoConfig.tableId))) {
      setTableFields([]);
      return;
    }

    const loadFields = async () => {
      setFetchingFields(true);
      try {
        const fields = await getTableFields(autoConfig.tableId);
        setTableFields(fields);
      } catch (e) {
        console.error(e);
      } finally {
        setFetchingFields(false);
      }
    };
    loadFields();
  }, [autoConfig.tableId]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dbResults, setDbResults] = useState<any[]>([]); // Raw records
  const [selectedDbCustomers, setSelectedDbCustomers] = useState<string[]>([]);

  // Field mapping for database import
  const [importFields, setImportFields] = useState<FieldDefinition[]>([]);
  const [importMapping, setImportMapping] = useState({
    name: "",
    email: "",
    phone: "",
  });

  // 1. Load Tables on Mount
  useEffect(() => {
    const loadTables = async () => {
      try {
        const sources = await getDataSources();
        setTables(sources);
      } catch (error) {
        console.error("Failed to load data sources:", error);
      }
    };
    const loadUsers = async () => {
      try {
        const result = await getUsers();
        if (result.success && result.data) {
          setUsers(result.data.map((u: any) => ({ id: u.id, name: u.name })));
        }
      } catch (error) {
        console.error("Failed to load users:", error);
      }
    };
    loadTables();
    loadUsers();
  }, []);

  // Load existing automation rules when modal opens
  useEffect(() => {
    if (automationOpen) {
      const loadRules = async () => {
        setLoadingRules(true);
        try {
          const rules = await getNurtureRules(listSlug);
          setExistingRules(rules);
        } catch (error) {
          console.error("Failed to load rules:", error);
        } finally {
          setLoadingRules(false);
        }
      };
      loadRules();
      // Reset to list view when opening
      setAutoViewMode("list");
      setAutoStep(1);
      setEditingRuleId(null);
    }
  }, [automationOpen, listSlug]);

  // Helper to get table name from ID
  const getTableName = (tableId: string) => {
    const table = tables.find((t) => t.id === tableId);
    return table?.name || `טבלה ${tableId}`;
  };

  // 2. Load fields when import table changes
  useEffect(() => {
    if (!selectedTable) {
      setImportFields([]);
      setImportMapping({ name: "", email: "", phone: "" });
      return;
    }

    // Only load fields for dynamic tables (numeric IDs)
    if (!isNaN(parseInt(selectedTable))) {
      const loadImportFields = async () => {
        try {
          const fields = await getTableFields(selectedTable);
          setImportFields(fields);
        } catch (e) {
          console.error(e);
        }
      };
      loadImportFields();
    } else {
      // For system tables (clients, users), use predefined mapping
      setImportFields([]);
      setImportMapping({ name: "name", email: "email", phone: "phone" });
    }
  }, [selectedTable]);

  // 3. Search in Database (only if mapping is set for dynamic tables)
  useEffect(() => {
    if (!selectedTable) return;

    const isDynamicTable = !isNaN(parseInt(selectedTable));

    // For dynamic tables, require at least name AND (email OR phone) mapping
    if (
      isDynamicTable &&
      (!importMapping.name || (!importMapping.email && !importMapping.phone))
    ) {
      setDbResults([]);
      return;
    }

    const fetchRecords = async () => {
      setLoading(true);
      try {
        let records: any[];

        if (isDynamicTable) {
          // Use raw records for dynamic tables (with custom field mapping)
          records = await getRawTableRecords(selectedTable);

          // Filter by search query if provided
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            records = records.filter((r: any) => {
              const name = String(r[importMapping.name] || "").toLowerCase();
              const email = String(r[importMapping.email] || "").toLowerCase();
              return name.includes(q) || email.includes(q);
            });
          }
        } else {
          // Use pre-mapped records for system tables (clients, users)
          records = await getDataSourceRecords(selectedTable, searchQuery);
        }

        setDbResults(records);
      } catch (error) {
        console.error("Failed to fetch records:", error);
        setDbResults([]);
      } finally {
        setLoading(false);
      }
    };

    // Debounce search
    const timer = setTimeout(() => {
      fetchRecords();
    }, 500);

    return () => clearTimeout(timer);
  }, [
    selectedTable,
    searchQuery,
    importMapping.name,
    importMapping.email,
    importMapping.phone,
  ]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validation: Name + (Email OR Phone)
    if (!manualForm.name || (!manualForm.email && !manualForm.phone)) {
      alert("חובה להזין שם ולפחות אמצעי קשר אחד (מייל או טלפון)");
      return;
    }

    setLoading(true);
    try {
      const result = await addNurtureSubscriberManual(listSlug, {
        name: manualForm.name,
        email: manualForm.email || undefined,
        phone: manualForm.phone || undefined,
      });

      if (result.success) {
        const newCustomer: Customer = {
          id: `man_${Date.now()}`,
          ...manualForm,
          source: "Manual",
        };
        onAddCustomers([newCustomer]);
        setManualForm({ name: "", email: "", phone: "" });
        setIsOpen(false);
      } else {
        alert(result.error || "שגיאה בהוספת הלקוח");
      }
    } catch (error) {
      console.error(error);
      alert("שגיאה לא צפויה");
    } finally {
      setLoading(false);
    }
  };

  const handleImportSelected = async () => {
    const recordsToImport = dbResults.filter((c) =>
      selectedDbCustomers.includes(c.id)
    );

    const isDynamic = importFields.length > 0;

    setLoading(true);
    try {
      for (const record of recordsToImport) {
        // Extract data using mapping
        const name = isDynamic
          ? record[importMapping.name] || `Record #${record.id}`
          : record.name;
        const email = isDynamic
          ? record[importMapping.email] || undefined
          : record.email || undefined;
        const phone = isDynamic
          ? record[importMapping.phone] || undefined
          : record.phone || undefined;

        await addNurtureSubscriberManual(listSlug, {
          name: String(name),
          email: email ? String(email) : undefined,
          phone: phone ? String(phone) : undefined,
        });
      }
      onAddCustomers([]);
      setIsOpen(false);
      setSelectedDbCustomers([]);
    } catch (error) {
      console.error(error);
      alert("שגיאה בייבוא הלקוחות");
    } finally {
      setLoading(false);
    }
  };

  const toggleCustomerSelection = (id: string) => {
    if (selectedDbCustomers.includes(id)) {
      setSelectedDbCustomers((prev) => prev.filter((cId) => cId !== id));
    } else {
      setSelectedDbCustomers((prev) => [...prev, id]);
    }
  };

  const handleSaveAutomation = async () => {
    // Validation: Name + (Email OR Phone)
    if (
      !autoConfig.fields.name ||
      (!autoConfig.fields.email && !autoConfig.fields.phone)
    ) {
      alert("חובה לבחור שדה שם ולפחות אמצעי קשר אחד (מייל או טלפון)");
      return;
    }

    setIsSaving(true);
    try {
      const ruleData = {
        name: `Nurture Auto-Add: ${
          autoConfig.trigger === "record_created" ? "רשומה חדשה" : "שינוי סטטוס"
        } - ${getTableName(autoConfig.tableId)}`,
        triggerType:
          autoConfig.trigger === "record_created"
            ? "NEW_RECORD"
            : "RECORD_FIELD_CHANGE",
        triggerConfig: {
          tableId: autoConfig.tableId,
          columnId:
            autoConfig.trigger === "status_changed"
              ? autoConfig.condition.field
              : undefined,
          fromValue:
            autoConfig.trigger === "status_changed"
              ? autoConfig.condition.fromValue
              : undefined,
          toValue:
            autoConfig.trigger === "status_changed"
              ? autoConfig.condition.toValue
              : undefined,
        },
        actionType: "ADD_TO_NURTURE_LIST",
        actionConfig: {
          listId: listSlug, // Use dynamic list slug
          mapping: {
            name: autoConfig.fields.name,
            email: autoConfig.fields.email,
            phone: autoConfig.fields.phone,
          },
          // Post-add actions
          sendNotification: postAddActions.sendNotification,
          notifyUserId: postAddActions.notifyUserId
            ? parseInt(postAddActions.notifyUserId)
            : undefined,
          notifyMessage: postAddActions.notifyMessage,
        },
      };

      let result;
      if (autoViewMode === "edit" && editingRuleId) {
        // Update existing rule
        result = await updateAutomationRule(editingRuleId, ruleData);
      } else {
        // Create new rule
        result = await createAutomationRule(ruleData);
      }

      if (result.success) {
        alert(
          autoViewMode === "edit"
            ? "האוטומציה עודכנה בהצלחה!"
            : "כלל אוטומציה נוצר בהצלחה!"
        );
        // Reload rules
        const rules = await getNurtureRules(listSlug);
        setExistingRules(rules);
        // Go back to list view
        setAutoViewMode("list");
        // Trigger refresh on parent
        onAddCustomers([]);
        // Reset state
        setAutoStep(1);
        setEditingRuleId(null);
        setAutoConfig({
          trigger: "record_created",
          tableId: "",
          fields: { name: "", email: "", phone: "" },
          condition: { field: "", fromValue: "", toValue: "" },
        });
      } else {
        alert("שגיאה בשמירת האוטומציה: " + result.error);
      }
    } catch (error) {
      console.error(error);
      alert("שגיאה לא צפויה");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditRule = (rule: any) => {
    const tc = rule.triggerConfig || {};
    const ac = rule.actionConfig || {};
    setEditingRuleId(rule.id);
    setAutoViewMode("edit");
    setAutoStep(1);
    setAutoConfig({
      trigger:
        rule.triggerType === "NEW_RECORD" ? "record_created" : "status_changed",
      tableId: String(tc.tableId || ""),
      fields: ac.mapping || { name: "", email: "", phone: "" },
      condition: {
        field: tc.columnId || "",
        fromValue: tc.fromValue || "",
        toValue: tc.toValue || "",
      },
    });
    // Load post-add actions configuration
    setPostAddActions({
      sendNotification: ac.sendNotification !== false,
      notifyUserId: ac.notifyUserId ? String(ac.notifyUserId) : "",
      notifyMessage: ac.notifyMessage || "לקוח חדש נוסף לרשימה!",
    });
  };

  const handleDeleteRule = async (ruleId: number) => {
    if (confirm("האם למחוק את חוק האוטומציה?")) {
      try {
        await deleteAutomationRule(ruleId);
        const rules = await getNurtureRules(listSlug);
        setExistingRules(rules);
        onAddCustomers([]); // Refresh parent
      } catch (error) {
        console.error(error);
        alert("שגיאה במחיקת האוטומציה");
      }
    }
  };

  const handleToggleRule = async (ruleId: number, currentStatus: boolean) => {
    try {
      await toggleAutomationRule(ruleId, !currentStatus);
      const rules = await getNurtureRules(listSlug);
      setExistingRules(rules);
      onAddCustomers([]); // Refresh parent
    } catch (error) {
      console.error(error);
      alert("שגיאה בעדכון סטטוס האוטומציה");
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Automation Button */}
      <Button
        onClick={() => setAutomationOpen(true)}
        variant="outline"
        className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
      >
        <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
        הוספה אוטומטית
      </Button>

      {/* Manual/Import Button */}
      <Button
        onClick={() => setIsOpen(true)}
        className="gap-2 bg-indigo-600 hover:bg-indigo-700"
      >
        <Plus className="w-4 h-4" />
        הוסף לקוחות
      </Button>

      {/* Automation Dialog */}
      <Dialog open={automationOpen} onOpenChange={setAutomationOpen}>
        <DialogContent className="sm:max-w-[550px]" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2">
              {autoViewMode !== "list" && (
                <button
                  onClick={() => {
                    setAutoViewMode("list");
                    setAutoStep(1);
                    setEditingRuleId(null);
                    setAutoConfig({
                      trigger: "record_created",
                      tableId: "",
                      fields: { name: "", email: "", phone: "" },
                      condition: { field: "", fromValue: "", toValue: "" },
                    });
                    setPostAddActions({
                      sendNotification: true,
                      notifyUserId: "",
                      notifyMessage: "לקוח חדש נוסף לרשימה!",
                    });
                  }}
                  className="p-1 rounded-md hover:bg-slate-100 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <span>
                {autoViewMode === "list"
                  ? "אוטומציות לרשימה זו"
                  : autoViewMode === "create"
                  ? "יצירת אוטומציה חדשה"
                  : "עריכת אוטומציה"}
              </span>
            </DialogTitle>
            <DialogDescription>
              {autoViewMode === "list"
                ? "צפייה וניהול של כל האוטומציות שמוסיפות לקוחות לרשימה זו"
                : "הגדר חוק להוספת לקוחות באופן אוטומטי"}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* List View - Shows existing rules */}
            {autoViewMode === "list" && (
              <div className="space-y-4">
                {loadingRules ? (
                  <div className="text-center py-8 text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    טוען אוטומציות...
                  </div>
                ) : existingRules.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed">
                    <Settings className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                    <p className="mb-1 font-medium">אין אוטומציות פעילות</p>
                    <p className="text-sm">
                      לחץ על "יצירת אוטומציה חדשה" כדי להתחיל
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[350px]">
                    <div className="space-y-2">
                      {existingRules.map((rule: any) => {
                        const triggerConfig = rule.triggerConfig || {};
                        const actionConfig = rule.actionConfig || {};
                        return (
                          <div
                            key={rule.id}
                            className={cn(
                              "p-3 rounded-lg border transition-colors",
                              rule.isActive
                                ? "bg-amber-50 border-amber-100"
                                : "bg-slate-50 border-slate-200"
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-900 truncate">
                                  {rule.name}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5">
                                  {rule.triggerType === "NEW_RECORD"
                                    ? `כאשר נוצרת רשומה חדשה בטבלה "${getTableName(
                                        triggerConfig.tableId
                                      )}"`
                                    : `כאשר משתנה ${
                                        triggerConfig.columnId || "שדה"
                                      } מ-"${
                                        triggerConfig.fromValue || "כל ערך"
                                      }" ל-"${
                                        triggerConfig.toValue || "כל ערך"
                                      }" בטבלה "${getTableName(
                                        triggerConfig.tableId
                                      )}"`}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {/* Edit */}
                                <button
                                  onClick={() => handleEditRule(rule)}
                                  className="p-1.5 rounded-md text-indigo-600 hover:bg-indigo-50 transition-colors"
                                  title="ערוך"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                {/* Toggle Active/Inactive */}
                                <button
                                  onClick={() =>
                                    handleToggleRule(rule.id, rule.isActive)
                                  }
                                  className={cn(
                                    "p-1.5 rounded-md transition-colors",
                                    rule.isActive
                                      ? "text-green-600 hover:bg-green-100"
                                      : "text-slate-400 hover:bg-slate-100"
                                  )}
                                  title={rule.isActive ? "השבת" : "הפעל"}
                                >
                                  {rule.isActive ? (
                                    <ToggleRight className="w-5 h-5" />
                                  ) : (
                                    <ToggleLeft className="w-5 h-5" />
                                  )}
                                </button>
                                {/* Delete */}
                                <button
                                  onClick={() => handleDeleteRule(rule.id)}
                                  className="p-1.5 rounded-md text-red-500 hover:bg-red-50 transition-colors"
                                  title="מחק"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center flex-wrap gap-2">
                              <Badge
                                className={cn(
                                  "text-[10px]",
                                  rule.isActive
                                    ? "bg-green-100 text-green-700 border-green-200"
                                    : "bg-slate-100 text-slate-500 border-slate-200"
                                )}
                              >
                                {rule.isActive ? "פעיל" : "מושבת"}
                              </Badge>
                              <Badge className="text-[10px] bg-indigo-100 text-indigo-700 border-indigo-200">
                                {rule.triggerType === "NEW_RECORD"
                                  ? "רשומה חדשה"
                                  : "שינוי סטטוס"}
                              </Badge>
                              {actionConfig.sendNotification &&
                                actionConfig.notifyUserId && (
                                  <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">
                                    🔔 שליחת התראה ל-
                                    {users.find(
                                      (u) => u.id === actionConfig.notifyUserId
                                    )?.name || "משתמש"}
                                  </Badge>
                                )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}

                {/* Create New Button */}
                <Button
                  onClick={() => {
                    setAutoViewMode("create");
                    setAutoStep(1);
                    setAutoConfig({
                      trigger: "record_created",
                      tableId: "",
                      fields: { name: "", email: "", phone: "" },
                      condition: { field: "", fromValue: "", toValue: "" },
                    });
                    setPostAddActions({
                      sendNotification: true,
                      notifyUserId: "",
                      notifyMessage: "לקוח חדש נוסף לרשימה!",
                    });
                  }}
                  className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700"
                >
                  <Plus className="w-4 h-4" />
                  יצירת אוטומציה חדשה
                </Button>
              </div>
            )}

            {/* Create/Edit View - Step 1: Trigger & Source */}
            {(autoViewMode === "create" || autoViewMode === "edit") &&
              autoStep === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>מתי להוסיף לקוח?</Label>
                    <Tabs
                      value={autoConfig.trigger}
                      onValueChange={(val) =>
                        setAutoConfig({ ...autoConfig, trigger: val })
                      }
                      dir="rtl"
                    >
                      <TabsList className="w-full grid grid-cols-2">
                        <TabsTrigger value="record_created">
                          כשנוצרת רשומה חדשה
                        </TabsTrigger>
                        <TabsTrigger value="status_changed">
                          כשסטטוס משתנה
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="space-y-2">
                    <Label>מקור הנתונים (טבלה)</Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={autoConfig.tableId}
                      onChange={(e) =>
                        setAutoConfig({
                          ...autoConfig,
                          tableId: e.target.value,
                        })
                      }
                    >
                      <option value="" disabled>
                        בחר טבלה...
                      </option>
                      {tables
                        .filter((t) => t.type === "table")
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

            {/* Create/Edit View - Step 2: Conditions & Mapping */}
            {(autoViewMode === "create" || autoViewMode === "edit") &&
              autoStep === 2 && (
                <div className="space-y-4">
                  {fetchingFields ? (
                    <div className="text-center py-8 text-slate-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      טוען שדות...
                    </div>
                  ) : (
                    <>
                      {autoConfig.trigger === "status_changed" && (
                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg space-y-3">
                          <Label className="text-amber-900">
                            תנאי הוספה (שינוי סטטוס)
                          </Label>

                          <div className="space-y-1">
                            <Label className="text-xs text-amber-800">
                              שדה הסטטוס
                            </Label>
                            <select
                              className="w-full h-9 rounded-md border border-amber-200 bg-white px-2 text-sm"
                              value={autoConfig.condition.field}
                              onChange={(e) =>
                                setAutoConfig({
                                  ...autoConfig,
                                  condition: {
                                    ...autoConfig.condition,
                                    field: e.target.value,
                                  },
                                })
                              }
                            >
                              <option value="">בחר שדה סטטוס...</option>
                              {tableFields
                                .filter(
                                  (f) =>
                                    f.type === "singleSelect" ||
                                    f.type.toLowerCase().includes("status")
                                )
                                .map((f) => (
                                  <option key={f.key} value={f.key}>
                                    {f.name}
                                  </option>
                                ))}
                            </select>
                          </div>

                          {/* Render From/To selects ONLY if a field is selected and has options */}
                          {autoConfig.condition.field && (
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs text-amber-800">
                                  מסטטוס (קודם)
                                </Label>
                                <select
                                  className="w-full h-9 rounded-md border border-amber-200 bg-white px-2 text-sm"
                                  value={autoConfig.condition.fromValue}
                                  onChange={(e) =>
                                    setAutoConfig({
                                      ...autoConfig,
                                      condition: {
                                        ...autoConfig.condition,
                                        fromValue: e.target.value,
                                      },
                                    })
                                  }
                                >
                                  <option value="">כל סטטוס...</option>
                                  {tableFields
                                    .find(
                                      (f) =>
                                        f.key === autoConfig.condition.field
                                    )
                                    ?.options?.map((opt: any) => {
                                      const val =
                                        typeof opt === "string"
                                          ? opt
                                          : opt.label || opt.name || opt.value;
                                      const id =
                                        typeof opt === "string"
                                          ? opt
                                          : opt.id || opt.value || opt.name;
                                      return (
                                        <option key={id} value={id}>
                                          {val}
                                        </option>
                                      );
                                    })}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-amber-800">
                                  לסטטוס (חדש)
                                </Label>
                                <select
                                  className="w-full h-9 rounded-md border border-amber-200 bg-white px-2 text-sm"
                                  value={autoConfig.condition.toValue}
                                  onChange={(e) =>
                                    setAutoConfig({
                                      ...autoConfig,
                                      condition: {
                                        ...autoConfig.condition,
                                        toValue: e.target.value,
                                      },
                                    })
                                  }
                                >
                                  <option value="">בחר יעד...</option>
                                  {tableFields
                                    .find(
                                      (f) =>
                                        f.key === autoConfig.condition.field
                                    )
                                    ?.options?.map((opt: any) => {
                                      const val =
                                        typeof opt === "string"
                                          ? opt
                                          : opt.label || opt.name || opt.value;
                                      const id =
                                        typeof opt === "string"
                                          ? opt
                                          : opt.id || opt.value || opt.name;
                                      return (
                                        <option key={id} value={id}>
                                          {val}
                                        </option>
                                      );
                                    })}
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-3">
                        <Label>מיפוי שדות (איזה מידע לשמור?)</Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-500">
                              שדה שם
                            </Label>
                            <select
                              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                              value={autoConfig.fields.name}
                              onChange={(e) =>
                                setAutoConfig({
                                  ...autoConfig,
                                  fields: {
                                    ...autoConfig.fields,
                                    name: e.target.value,
                                  },
                                })
                              }
                            >
                              <option value="">בחר שדה...</option>
                              {tableFields
                                .filter(
                                  (f) =>
                                    f.type === "text" ||
                                    f.name.includes("שם") ||
                                    f.name.toLowerCase().includes("name")
                                )
                                .map((f) => (
                                  <option key={f.key} value={f.key}>
                                    {f.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-500">
                              שדה אימייל (אופציונלי אם נבחר טלפון)
                            </Label>
                            <select
                              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                              value={autoConfig.fields.email}
                              onChange={(e) =>
                                setAutoConfig({
                                  ...autoConfig,
                                  fields: {
                                    ...autoConfig.fields,
                                    email: e.target.value,
                                  },
                                })
                              }
                            >
                              <option value="">בחר שדה...</option>
                              {tableFields
                                .filter(
                                  (f) =>
                                    f.type === "email" ||
                                    f.type === "text" ||
                                    f.name.includes("מייל")
                                )
                                .map((f) => (
                                  <option key={f.key} value={f.key}>
                                    {f.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-500">
                              שדה טלפון (אופציונלי אם נבחר אימייל)
                            </Label>
                            <select
                              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                              value={autoConfig.fields.phone}
                              onChange={(e) =>
                                setAutoConfig({
                                  ...autoConfig,
                                  fields: {
                                    ...autoConfig.fields,
                                    phone: e.target.value,
                                  },
                                })
                              }
                            >
                              <option value="">בחר שדה...</option>
                              {tableFields
                                .filter(
                                  (f) =>
                                    f.type === "phone" ||
                                    f.type === "text" ||
                                    f.name.includes("פון") ||
                                    f.name.includes("נייד")
                                )
                                .map((f) => (
                                  <option key={f.key} value={f.key}>
                                    {f.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Post-Add Actions Section */}
                      <div className="space-y-3 border-t pt-4 mt-4">
                        <Label className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-amber-500" />
                          פעולות לאחר הוספה
                        </Label>

                        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg space-y-3">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              id="sendNotification"
                              checked={postAddActions.sendNotification}
                              onChange={(e) =>
                                setPostAddActions({
                                  ...postAddActions,
                                  sendNotification: e.target.checked,
                                })
                              }
                              className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                            />
                            <Label
                              htmlFor="sendNotification"
                              className="text-sm text-blue-900 cursor-pointer"
                            >
                              שליחת התראה למשתמש
                            </Label>
                          </div>

                          {postAddActions.sendNotification && (
                            <div className="space-y-3 pr-7">
                              <div className="space-y-1">
                                <Label className="text-xs text-blue-800">
                                  למי לשלוח התראה?
                                </Label>
                                <select
                                  className="w-full h-9 rounded-md border border-blue-200 bg-white px-2 text-sm"
                                  value={postAddActions.notifyUserId}
                                  onChange={(e) =>
                                    setPostAddActions({
                                      ...postAddActions,
                                      notifyUserId: e.target.value,
                                    })
                                  }
                                >
                                  <option value="">בחר משתמש...</option>
                                  {users.length === 0 && (
                                    <option value="" disabled>
                                      אין משתמשים זמינים
                                    </option>
                                  )}
                                  {users.map((user) => (
                                    <option key={user.id} value={user.id}>
                                      {user.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-1">
                                <Label className="text-xs text-blue-800">
                                  תוכן ההתראה
                                </Label>
                                <input
                                  type="text"
                                  className="w-full h-9 rounded-md border border-blue-200 bg-white px-2 text-sm"
                                  value={postAddActions.notifyMessage}
                                  onChange={(e) =>
                                    setPostAddActions({
                                      ...postAddActions,
                                      notifyMessage: e.target.value,
                                    })
                                  }
                                  placeholder="לקוח חדש נוסף לרשימה!"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            {autoViewMode === "list" ? (
              <Button
                variant="outline"
                onClick={() => setAutomationOpen(false)}
              >
                סגור
              </Button>
            ) : autoStep === 1 ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAutoViewMode("list");
                    setAutoStep(1);
                    setEditingRuleId(null);
                    setPostAddActions({
                      sendNotification: true,
                      notifyUserId: "",
                      notifyMessage: "לקוח חדש נוסף לרשימה!",
                    });
                  }}
                >
                  ביטול
                </Button>
                <Button
                  onClick={() => setAutoStep(2)}
                  disabled={!autoConfig.tableId}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  המשך לשלב הבא
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setAutoStep(1)}>
                  חזור
                </Button>
                <Button
                  onClick={handleSaveAutomation}
                  className="bg-green-600 hover:bg-green-700"
                  disabled={
                    !autoConfig.fields.name ||
                    (!autoConfig.fields.email && !autoConfig.fields.phone) ||
                    isSaving ||
                    (autoConfig.trigger === "status_changed" &&
                      !autoConfig.condition.toValue)
                  }
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                      שומר...
                    </>
                  ) : autoViewMode === "edit" ? (
                    "שמור שינויים"
                  ) : (
                    "צור אוטומציה"
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className="sm:max-w-[600px] h-[80vh] flex flex-col p-0 gap-0 overflow-hidden"
          dir="rtl"
        >
          <div className="p-6 pb-2 border-b border-slate-100">
            <DialogHeader className="mb-2 text-right">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 bg-slate-50/50">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="h-full flex flex-col"
              dir="rtl"
            >
              <div className="px-6 border-b border-slate-200 bg-white">
                <TabsList className="w-full justify-start h-12 bg-transparent p-0 gap-6">
                  <TabsTrigger
                    value="manual"
                    className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 px-0 pb-0"
                  >
                    <User className="w-4 h-4 ml-2" />
                    הוספה ידנית
                  </TabsTrigger>
                  <TabsTrigger
                    value="database"
                    className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 px-0 pb-0"
                  >
                    <Database className="w-4 h-4 ml-2" />
                    ייבוא ממאגרים
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="manual"
                className="flex-1 p-6 space-y-4 focus-visible:ring-0"
              >
                <form onSubmit={handleManualSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>
                      שם מלא <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={manualForm.name}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, name: e.target.value })
                      }
                      placeholder="דניאל לוי"
                      required
                    />
                  </div>

                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
                    יש למלא לפחות אחד מאמצעי הקשר: אימייל או טלפון
                  </div>

                  <div className="space-y-2">
                    <Label>
                      כתובת אימייל
                      {!manualForm.phone && (
                        <span className="text-red-500"> *</span>
                      )}
                      {manualForm.phone && (
                        <span className="text-slate-400 text-xs mr-1">
                          (אופציונלי)
                        </span>
                      )}
                    </Label>
                    <Input
                      type="email"
                      value={manualForm.email}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, email: e.target.value })
                      }
                      placeholder="daniel@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      טלפון
                      {!manualForm.email && (
                        <span className="text-red-500"> *</span>
                      )}
                      {manualForm.email && (
                        <span className="text-slate-400 text-xs mr-1">
                          (אופציונלי)
                        </span>
                      )}
                    </Label>
                    <Input
                      type="tel"
                      value={manualForm.phone}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, phone: e.target.value })
                      }
                      placeholder="050-0000000"
                    />
                  </div>

                  <div className="pt-4 flex justify-end">
                    <Button
                      type="submit"
                      className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700"
                      disabled={
                        !manualForm.name ||
                        (!manualForm.email && !manualForm.phone) ||
                        loading
                      }
                    >
                      {loading ? "שומר..." : "שמור והוסף לרשימה"}
                    </Button>
                  </div>
                </form>
              </TabsContent>

              <TabsContent
                value="database"
                className="flex-1 flex flex-col p-6 gap-4 focus-visible:ring-0 overflow-hidden"
              >
                {/* Table Selection */}
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-slate-500 mb-1 block">
                      בחר טבלה
                    </Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={selectedTable}
                      onChange={(e) => setSelectedTable(e.target.value)}
                    >
                      <option value="" disabled>
                        בחר מקור...
                      </option>
                      {tables.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Field Mapping - Only for dynamic tables */}
                  {selectedTable && importFields.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg space-y-3">
                      <div className="text-sm font-medium text-amber-900">
                        מיפוי שדות
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-amber-800">
                            שדה שם <span className="text-red-500">*</span>
                          </Label>
                          <select
                            className="w-full h-9 rounded-md border border-amber-200 bg-white px-2 text-sm"
                            value={importMapping.name}
                            onChange={(e) =>
                              setImportMapping({
                                ...importMapping,
                                name: e.target.value,
                              })
                            }
                          >
                            <option value="">בחר שדה...</option>
                            {importFields.map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-amber-800">
                            שדה אימייל
                          </Label>
                          <select
                            className="w-full h-9 rounded-md border border-amber-200 bg-white px-2 text-sm"
                            value={importMapping.email}
                            onChange={(e) =>
                              setImportMapping({
                                ...importMapping,
                                email: e.target.value,
                              })
                            }
                          >
                            <option value="">בחר שדה...</option>
                            {importFields.map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-amber-800">
                            שדה טלפון
                          </Label>
                          <select
                            className="w-full h-9 rounded-md border border-amber-200 bg-white px-2 text-sm"
                            value={importMapping.phone}
                            onChange={(e) =>
                              setImportMapping({
                                ...importMapping,
                                phone: e.target.value,
                              })
                            }
                          >
                            <option value="">בחר שדה...</option>
                            {importFields.map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {!importMapping.email &&
                        !importMapping.phone &&
                        importMapping.name && (
                          <div className="text-xs text-red-600">
                            יש לבחור לפחות שדה אימייל או טלפון
                          </div>
                        )}
                    </div>
                  )}

                  {/* Search - Only show if mapping is done */}
                  {selectedTable &&
                    (importFields.length === 0 || importMapping.name) && (
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <Input
                          placeholder="חפש..."
                          className="pl-9"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                    )}
                </div>

                {/* Results List */}
                <div className="flex-1 border rounded-lg bg-white overflow-hidden relative">
                  {!selectedTable ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-sm">
                      <Database className="w-10 h-10 mb-2 opacity-20" />
                      בחר מקור נתונים כדי לראות רשומות
                    </div>
                  ) : importFields.length > 0 && !importMapping.name ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-amber-600 text-sm">
                      <Database className="w-10 h-10 mb-2 opacity-40" />
                      יש לבחור מיפוי שדות לפני הצגת הרשומות
                    </div>
                  ) : importFields.length > 0 &&
                    !importMapping.email &&
                    !importMapping.phone ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-amber-600 text-sm">
                      <Database className="w-10 h-10 mb-2 opacity-40" />
                      יש לבחור לפחות שדה אימייל או טלפון
                    </div>
                  ) : loading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                    </div>
                  ) : (
                    <ScrollArea className="h-[250px]" dir="rtl">
                      <div className="divide-y divide-slate-100">
                        {dbResults.map((record) => {
                          const isDynamic = importFields.length > 0;
                          const displayName = isDynamic
                            ? record[importMapping.name] ||
                              record.name ||
                              `Record #${record.id}`
                            : record.name;
                          const displayEmail = isDynamic
                            ? record[importMapping.email] || ""
                            : record.email;
                          const displayPhone = isDynamic
                            ? record[importMapping.phone] || ""
                            : record.phone;

                          const isSelected = selectedDbCustomers.includes(
                            record.id
                          );
                          return (
                            <div
                              key={record.id}
                              className={cn(
                                "p-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer transition-colors",
                                isSelected && "bg-indigo-50 hover:bg-indigo-50"
                              )}
                              onClick={() => toggleCustomerSelection(record.id)}
                            >
                              <div
                                className={cn(
                                  "w-5 h-5 rounded border flex items-center justify-center transition-all",
                                  isSelected
                                    ? "bg-indigo-600 border-indigo-600 text-white"
                                    : "border-slate-300 bg-white"
                                )}
                              >
                                {isSelected && <Check className="w-3 h-3" />}
                              </div>
                              <Avatar className="w-8 h-8">
                                <AvatarFallback className="bg-slate-200 text-xs">
                                  {String(displayName)?.slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 overflow-hidden">
                                <div className="text-sm font-medium truncate">
                                  {displayName}
                                </div>
                                <div className="text-xs text-slate-500 truncate">
                                  {displayEmail ||
                                    displayPhone ||
                                    "ללא פרטי קשר"}
                                </div>
                              </div>
                              <div className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500">
                                {record.source || selectedTable}
                              </div>
                            </div>
                          );
                        })}
                        {dbResults.length === 0 && (
                          <div className="p-8 text-center text-sm text-slate-400">
                            לא נמצאו תוצאות
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </div>

                {/* Action Footer for DB Tab */}
                <div className="flex items-center justify-between pt-2">
                  <div className="text-sm text-slate-500">
                    נבחרו {selectedDbCustomers.length} לקוחות
                  </div>
                  <Button
                    onClick={handleImportSelected}
                    disabled={selectedDbCustomers.length === 0}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    ייבא נבחרים
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
