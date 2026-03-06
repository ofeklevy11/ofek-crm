/**
 * Inngest test utilities for integration tests.
 * Provides mock step/event objects that execute synchronously.
 */

/** Creates a mock step object that runs fn() directly (no queue). */
export function createMockStep() {
  const sentEvents: Array<{ name: string; data: unknown }> = [];

  return {
    run: async <T>(_name: string, fn: () => T | Promise<T>): Promise<T> => {
      return fn();
    },
    sleep: async (_duration: string): Promise<void> => {
      // no-op
    },
    sleepUntil: async (_timestamp: string | Date): Promise<void> => {
      // no-op
    },
    sendEvent: async (event: { name: string; data: unknown } | { name: string; data: unknown }[]) => {
      const events = Array.isArray(event) ? event : [event];
      sentEvents.push(...events);
    },
    invoke: async <T>(_id: string, _opts: unknown): Promise<T> => {
      return undefined as T;
    },
    waitForEvent: async <T>(_id: string, _opts: unknown): Promise<T | null> => {
      return null;
    },
    /** Retrieve all events sent via step.sendEvent() for assertions. */
    getSentEvents: () => sentEvents,
  };
}

/** Wraps event data in the Inngest event envelope shape. */
export function createMockEvent<T extends Record<string, unknown>>(
  name: string,
  data: T,
) {
  return {
    name,
    data,
    id: "test-event-id",
    ts: Date.now(),
    v: "1",
  };
}
