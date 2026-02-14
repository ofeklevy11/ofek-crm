import { useEffect, useState, useRef, useCallback } from "react";

interface RealtimeMessage {
  channel: string;
  data: any;
}

const MAX_RECONNECT_DELAY = 30000;
const INITIAL_RECONNECT_DELAY = 1000;
const RATE_LIMIT_BACKOFF = 5000; // Minimum backoff when errors happen rapidly (likely 429)
const RAPID_ERROR_THRESHOLD = 2000; // If errors are < 2s apart, assume rate-limited
const MAX_RETRIES = 20; // ~5 minutes at max backoff

interface UseRealtimeOptions {
  onReconnect?: () => void;
}

export function useRealtime(
  userId: number | undefined,
  onMessage: (msg: RealtimeMessage) => void,
  options?: UseRealtimeOptions,
) {
  const [isConnected, setIsConnected] = useState(false);
  const [hasGivenUp, setHasGivenUp] = useState(false);
  const onMessageRef = useRef(onMessage);
  const onReconnectRef = useRef(options?.onReconnect);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const lastErrorTimeRef = useRef(0);
  const mountedRef = useRef(true);
  const wasConnectedRef = useRef(false);

  // Always keep the refs current with the latest callbacks
  useEffect(() => {
    onMessageRef.current = onMessage;
  });
  useEffect(() => {
    onReconnectRef.current = options?.onReconnect;
  });

  const connect = useCallback((uid: number) => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const eventSource = new EventSource(`/api/sse`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      setHasGivenUp(false);
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
      retryCountRef.current = 0;
      lastErrorTimeRef.current = 0;

      // Fire reconnect callback if this isn't the initial connection
      if (wasConnectedRef.current && onReconnectRef.current) {
        onReconnectRef.current();
      }
      wasConnectedRef.current = true;

      console.log("SSE Connected");
    };

    eventSource.onmessage = (event) => {
      try {
        if (event.data === ":keepalive") return;

        const parsedData = JSON.parse(event.data);
        if (onMessageRef.current) {
          onMessageRef.current(parsedData);
        }
      } catch (e) {
        console.error("Failed to parse SSE message", event.data);
      }
    };

    eventSource.onerror = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      eventSource.close();
      eventSourceRef.current = null;

      // Check if we've exceeded max retries
      retryCountRef.current += 1;
      if (retryCountRef.current > MAX_RETRIES) {
        console.log("SSE: max retries exceeded, giving up");
        setHasGivenUp(true);
        return;
      }

      // Detect rapid errors (likely 429 rate limiting) and use longer backoff
      const now = Date.now();
      const timeSinceLastError = now - lastErrorTimeRef.current;
      lastErrorTimeRef.current = now;
      const isRapidError = timeSinceLastError < RAPID_ERROR_THRESHOLD;

      // Reconnect with exponential backoff, enforcing minimum for rapid errors
      const baseDelay = reconnectDelayRef.current;
      const delay = isRapidError ? Math.max(baseDelay, RATE_LIMIT_BACKOFF) : baseDelay;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
      console.log(`SSE disconnected, reconnecting in ${delay}ms (attempt ${retryCountRef.current}/${MAX_RETRIES})`);

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (mountedRef.current) {
          connect(uid);
        }
      }, delay);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    wasConnectedRef.current = false;

    if (!userId) return;

    connect(userId);

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [userId, connect]);

  return { isConnected, hasGivenUp };
}
