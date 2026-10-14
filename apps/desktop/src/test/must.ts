/** The value, or a clear error when a test expected it to exist (instead of a `!`). */
export function must<T>(value: T | null | undefined, what = 'element'): T {
  if (value === null || value === undefined) throw new Error(`Missing ${what}`);
  return value;
}
