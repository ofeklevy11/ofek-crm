import { CalendarEvent } from "@/lib/types";

export function eventsOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

/**
 * Computes column layout for overlapping calendar events.
 * Uses a sweep-line approach: O(n log n) total (dominated by sort).
 *
 * 1. Sort events by start time (longer duration first on ties).
 * 2. Build overlap groups in a single pass — events are added to the
 *    current group as long as they start before the group's latest end time.
 * 3. Within each group, greedily assign columns (first-fit).
 */
export function getEventLayout(
  dayEvents: CalendarEvent[],
): Map<string, { columnIndex: number; totalColumns: number }> {
  const layout = new Map<
    string,
    { columnIndex: number; totalColumns: number }
  >();

  if (dayEvents.length === 0) return layout;

  // Sort events by start time, then by duration (longer first)
  const sortedEvents = [...dayEvents].sort((a, b) => {
    const startDiff = a.startTime.getTime() - b.startTime.getTime();
    if (startDiff !== 0) return startDiff;
    const aDuration = a.endTime.getTime() - a.startTime.getTime();
    const bDuration = b.endTime.getTime() - b.startTime.getTime();
    return bDuration - aDuration;
  });

  // Build overlap groups using sweep-line (O(n) after sort)
  const groups: CalendarEvent[][] = [];
  let currentGroup: CalendarEvent[] = [];
  let groupEnd = -Infinity;

  for (const event of sortedEvents) {
    const eventStart = event.startTime.getTime();
    const eventEnd = event.endTime.getTime();

    if (eventStart < groupEnd) {
      // Overlaps with current group
      currentGroup.push(event);
      groupEnd = Math.max(groupEnd, eventEnd);
    } else {
      // New group
      if (currentGroup.length > 0) groups.push(currentGroup);
      currentGroup = [event];
      groupEnd = eventEnd;
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  // Assign columns within each group (greedy first-fit)
  for (const group of groups) {
    const columns: CalendarEvent[][] = [];

    for (const event of group) {
      let placed = false;
      for (let colIdx = 0; colIdx < columns.length; colIdx++) {
        const column = columns[colIdx];
        const overlapsWithColumn = column.some((e) => eventsOverlap(e, event));
        if (!overlapsWithColumn) {
          column.push(event);
          layout.set(event.id, { columnIndex: colIdx, totalColumns: 0 });
          placed = true;
          break;
        }
      }

      if (!placed) {
        columns.push([event]);
        layout.set(event.id, {
          columnIndex: columns.length - 1,
          totalColumns: 0,
        });
      }
    }

    // Update totalColumns for all events in this group
    const totalColumns = columns.length;
    for (const event of group) {
      const info = layout.get(event.id)!;
      info.totalColumns = totalColumns;
    }
  }

  return layout;
}
