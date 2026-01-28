"use client";

import { useState } from "react";
import { toggleView, deleteView, ViewConfig } from "@/app/actions/views";
import { useRouter } from "next/navigation";
import EditViewModal from "./EditViewModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2, Power, PowerOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface DynamicViewCardProps {
  viewId: number;
  viewName: string;
  viewSlug: string;
  title: string;
  isEnabled: boolean;
  config: ViewConfig;
  tableSlug: string;
  schema: Array<{
    name: string;
    type: string;
    label: string;
    options?: string[];
  }>;
  children: React.ReactNode;
  onDelete?: () => void;
  onRefresh?: () => Promise<void>;
}

export default function DynamicViewCard({
  viewId,
  viewName,
  viewSlug,
  title,
  isEnabled: initialIsEnabled,
  config,
  tableSlug,
  schema,
  children,
  onDelete,
  onRefresh,
}: DynamicViewCardProps) {
  const router = useRouter();
  const [isEnabled, setIsEnabled] = useState(initialIsEnabled);
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const handleToggle = async () => {
    setIsToggling(true);
    const result = await toggleView(viewId);

    if (result.success) {
      setIsEnabled(result.view!.isEnabled);
      router.refresh();
    } else {
      alert(`שגיאה בשינוי מצב התצוגה: ${result.error}`);
    }

    setIsToggling(false);
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `האם אתה בטוח שברצונך למחוק את התצוגה "${title}"? פעולה זו בלתי הפיכה.`,
      )
    ) {
      return;
    }

    setIsDeleting(true);
    const result = await deleteView(viewId);

    if (result.success) {
      router.refresh();
      if (onDelete) onDelete();
    } else {
      alert(`שגיאה במחיקת התצוגה: ${result.error}`);
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden border-border/60 shadow-sm transition-all hover:shadow-md">
        <CardHeader className="flex flex-col gap-2 p-4 bg-muted/30 border-b border-border/40">
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowEditModal(true)}
              className="h-8 w-8 text-muted-foreground hover:text-primary"
              title="ערוך תצוגה"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  if (onRefresh) {
                    setIsRefreshing(true);
                    await onRefresh();
                    setIsRefreshing(false);
                  }
                }}
                disabled={isRefreshing}
                className="h-8 w-8 text-muted-foreground hover:text-blue-500"
                title="רענן נתונים"
              >
                <RefreshCw
                  className={cn("h-4 w-4", isRefreshing && "animate-spin")}
                />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggle}
              disabled={isToggling}
              className={cn(
                "h-8 w-8 transition-colors",
                isEnabled
                  ? "text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title={isEnabled ? "הסתר" : "הצג"}
            >
              {isToggling ? (
                <span className="animate-spin">⟳</span>
              ) : isEnabled ? (
                <Power className="h-4 w-4" />
              ) : (
                <PowerOff className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              disabled={isDeleting}
              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="מחק תצוגה"
            >
              {isDeleting ? (
                <span className="animate-spin">⟳</span>
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
          <CardTitle
            className="text-sm font-bold text-foreground"
            title={title}
          >
            {title.length > 50 ? title.slice(0, 50) + "..." : title}
          </CardTitle>
        </CardHeader>
        {isEnabled && <CardContent className="p-6">{children}</CardContent>}
      </Card>

      {showEditModal && (
        <EditViewModal
          viewId={viewId}
          currentConfig={{
            name: viewName,
            slug: viewSlug,
            config,
            isEnabled,
          }}
          tableSlug={tableSlug}
          schema={schema}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  );
}
