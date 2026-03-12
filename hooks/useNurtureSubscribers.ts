"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getNurtureSubscribers,
  getSubscriberLastSentMap,
  type NurtureSubscriberFilter,
  type NurtureSubscriberResult,
} from "@/app/nurture-hub/actions";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";
import { isRateLimitError, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit-utils";

const PAGE_SIZE = 20;

export interface UseNurtureSubscribersReturn {
  customers: NurtureSubscriberResult[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  lastSentMap: Record<string, string>;
  selectedCustomerIds: Set<string>;
  search: string;
  filters: NurtureSubscriberFilter[];
  setSearch: (s: string) => void;
  setFilters: (f: NurtureSubscriberFilter[]) => void;
  toggleCustomerSelection: (id: string) => void;
  toggleAllCustomers: () => void;
  loadMore: () => void;
  refreshData: () => void;
}

export function useNurtureSubscribers(slug: string): UseNurtureSubscribersReturn {
  const [customers, setCustomers] = useState<NurtureSubscriberResult[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastSentMap, setLastSentMap] = useState<Record<string, string>>({});
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [search, setSearchState] = useState("");
  const [filters, setFiltersState] = useState<NurtureSubscriberFilter[]>([]);
  const fetchIdRef = useRef(0);

  const fetchSubscribers = useCallback(
    async (skip: number, append: boolean, currentSearch: string, currentFilters: NurtureSubscriberFilter[]) => {
      const fetchId = ++fetchIdRef.current;
      try {
        const result = await getNurtureSubscribers(slug, {
          skip,
          take: PAGE_SIZE,
          search: currentSearch || undefined,
          filters: currentFilters.length > 0 ? currentFilters : undefined,
        });
        // Ignore stale responses
        if (fetchId !== fetchIdRef.current) return;
        if (append) {
          setCustomers((prev) => [...prev, ...result.subscribers]);
        } else {
          setCustomers(result.subscribers);
        }
        setTotal(result.total);
        setHasMore(result.hasMore);
      } catch (err: any) {
        if (fetchId !== fetchIdRef.current) return;
        if (isRateLimitError(err)) toast.error(RATE_LIMIT_MESSAGE);
        else toast.error(getUserFriendlyError(err));
      }
    },
    [slug]
  );

  // Initial load + lastSentMap
  useEffect(() => {
    setIsLoading(true);
    fetchSubscribers(0, false, "", []).finally(() => setIsLoading(false));
    getSubscriberLastSentMap(slug).then(setLastSentMap).catch(() => {});
  }, [slug, fetchSubscribers]);

  // Re-fetch on search/filter change
  const setSearch = useCallback((s: string) => {
    setSearchState(s);
    setSelectedCustomerIds(new Set());
    setIsLoading(true);
    fetchSubscribers(0, false, s, filters).finally(() => setIsLoading(false));
  }, [filters, fetchSubscribers]);

  const setFilters = useCallback((f: NurtureSubscriberFilter[]) => {
    setFiltersState(f);
    setSelectedCustomerIds(new Set());
    setIsLoading(true);
    fetchSubscribers(0, false, search, f).finally(() => setIsLoading(false));
  }, [search, fetchSubscribers]);

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    fetchSubscribers(customers.length, true, search, filters).finally(() => setIsLoadingMore(false));
  }, [isLoadingMore, hasMore, customers.length, search, filters, fetchSubscribers]);

  const refreshData = useCallback(() => {
    setIsLoading(true);
    fetchSubscribers(0, false, search, filters).finally(() => setIsLoading(false));
    getSubscriberLastSentMap(slug).then(setLastSentMap).catch(() => {});
  }, [slug, search, filters, fetchSubscribers]);

  const toggleCustomerSelection = useCallback((id: string) => {
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllCustomers = useCallback(() => {
    setSelectedCustomerIds((prev) =>
      prev.size === customers.length ? new Set() : new Set(customers.map((c) => c.id))
    );
  }, [customers]);

  return {
    customers,
    total,
    hasMore,
    isLoading,
    isLoadingMore,
    lastSentMap,
    selectedCustomerIds,
    search,
    filters,
    setSearch,
    setFilters,
    toggleCustomerSelection,
    toggleAllCustomers,
    loadMore,
    refreshData,
  };
}
