/**
 * `YYYY-MM-DD` in the device's LOCAL timezone.
 *
 * Deliberately not `toISOString().slice(0, 10)`, which is UTC and lands on the
 * wrong day for anyone west of Greenwich in the evening. Both the pushup
 * challenge's day keys and the Social screen's "did they train today?" gate
 * depend on this being the user's own calendar day.
 */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
