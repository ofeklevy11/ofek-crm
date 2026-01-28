"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import DynamicViewCard from "./DynamicViewCard";
import DynamicViewRenderer from "./DynamicViewRenderer";
import type { ViewConfig } from "@/app/actions/views";
import { Loader2 } from "lucide-react";

interface AsyncViewWrapperProps {
  view: {
    id: number;
    name: string;
    slug: string;
    config: any;
    isEnabled: boolean;
  };
  tableId: number;
  tableSlug: string;
  schema: any[];
  onAfterRefresh?: () => void;
}

export default function AsyncViewWrapper({
  view,
  tableId,
  tableSlug,
  schema,
  onAfterRefresh,
}: AsyncViewWrapperProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMounted = useRef(true);
  const hasFetched = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchData = useCallback(
    async (force: boolean = false) => {
      try {
        setLoading(true);
        const url =
          `/api/tables/${tableId}/process-view` + (force ? "?force=true" : "");

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: view.config, viewId: view.id }),
        });

        if (!res.ok) {
          if (res.status === 429) {
            const text = await res.text();
            throw new Error(text || "Rate limit exceeded");
          }
          throw new Error("Failed to fetch view data");
        }

        const result = await res.json();
        if (isMounted.current) {
          setData(result);
          setLoading(false);
          hasFetched.current = true;
          // If force refresh was successful, call callback to update global usage stats
          if (force && onAfterRefresh) {
            onAfterRefresh();
          }
        }
      } catch (err: any) {
        if (isMounted.current) {
          // If it was a force refresh (manual), we might want to show a toast or alert.
          // For now, we set error state, but distinct handling for 429 might be good.
          if (force) {
            alert(err.message); // Simple alert for user feedback on rate limit
          }
          // Don't clear data on refresh error, just show toast?
          // Current logic replaces data/error.
          // If we fail to refresh, we probably want to keep old data if possible?
          // But logic sets error and loading=false.
          // Let's just set Error.

          // Actually, improve UX: if force=true and error, don't kill existing data if we have it.
          if (!force) setError(err.message);
          setLoading(false);
        }
      }
    },
    [tableId, view.config, onAfterRefresh],
  );

  // Only fetch on first mount, not on re-mounts (sidebar close/open)
  useEffect(() => {
    if (!hasFetched.current) {
      fetchData(false);
    } else {
      // Data already fetched, just make sure loading is false
      setLoading(false);
    }
  }, [fetchData]);

  const handleRefresh = async () => {
    await fetchData(true);
  };

  if (!view.isEnabled) return null;

  return (
    <DynamicViewCard
      viewId={view.id}
      viewName={view.name}
      viewSlug={view.slug}
      title={view.name}
      isEnabled={view.isEnabled}
      config={view.config as ViewConfig}
      tableSlug={tableSlug}
      schema={schema}
      onRefresh={handleRefresh}
    >
      {loading ? (
        <div className="flex justify-center items-center h-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-red-500 text-sm p-2">Error loading data</div>
      ) : (
        <DynamicViewRenderer viewData={data} />
      )}
    </DynamicViewCard>
  );
}
