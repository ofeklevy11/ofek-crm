import { useEffect, useState, useRef } from "react";

interface RealtimeMessage {
  channel: string;
  data: any;
}

export function useRealtime(
  userId: number,
  onMessage: (msg: RealtimeMessage) => void,
) {
  const [isConnected, setIsConnected] = useState(false);
  const onMessageRef = useRef(onMessage);

  // Always keep the ref current with the latest callback
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    if (!userId) return;

    // Create EventSource connection
    const eventSource = new EventSource(`/api/sse?userId=${userId}`);

    eventSource.onopen = () => {
      setIsConnected(true);
      console.log("SSE Connected");
    };

    eventSource.onmessage = (event) => {
      try {
        if (event.data === ":keepalive") return;

        const parsedData = JSON.parse(event.data);
        // Call the latest callback from the ref
        if (onMessageRef.current) {
          onMessageRef.current(parsedData);
        }
      } catch (e) {
        console.error("Failed to parse SSE message", event.data);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE Error", err);
      setIsConnected(false);
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [userId]); // Only re-run if userId changes, not on callback change

  return { isConnected };
}
