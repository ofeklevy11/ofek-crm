"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import DynamicViewCard from "./DynamicViewCard";
import DynamicViewRenderer from "./DynamicViewRenderer";
import type { ViewConfig } from "@/app/actions/views";
import { Loader2 } from "lucide-react";
import { getUserFriendlyError } from "@/lib/errors";
import { isRateLimitError, RateLimitError } from "@/lib/rate-limit-utils";

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
  const [error, setError] = useState<string | null>(null);
  const [rateLimitError, setRateLimitError] = useState(false);
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
            throw new RateLimitError(text || "Rate limit exceeded");
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
          const msg = getUserFriendlyError(err);
          if (isRateLimitError(msg)) {
            setRateLimitError(true);
            setTimeout(() => setRateLimitError(false), 10000);
          }
          if (!force) setError(msg);
          setLoading(false);
        }
      }
    },
    [tableId, view.config, onAfterRefresh],
  );

  // Only fetch on first mount, not on re-mounts (sidebar close/open)
  useEffect(() => {
    if (!hasFetched.current && view.isEnabled) {
      fetchData(false);
    } else {
      // Data already fetched, just make sure loading is false
      setLoading(false);
    }
  }, [fetchData, view.isEnabled]);

  const handleRefresh = async () => {
    await fetchData(true);
  };

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
      ) : rateLimitError ? (
        <div className="text-sm p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          יותר מדי בקשות. אנא נסה שוב בעוד 2 דקות והנתונים יוצגו.
        </div>
      ) : error ? (
        <div className="text-red-500 text-sm p-2">שגיאה בטעינת הנתונים</div>
      ) : (
        <DynamicViewRenderer viewData={data} />
      )}
    </DynamicViewCard>
  );
}
