/** Clamps date to last day of month if day overflows (e.g., Feb 30 → Feb 28). */
export function getValidDate(y: number, m: number, d: number): Date {
  const date = new Date(y, m, d);
  if (date.getMonth() !== ((m % 12) + 12) % 12) {
    return new Date(y, m + 1, 0);
  }
  return date;
}
