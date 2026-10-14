/** Placeholder: the real hook comes from the daily-notes agent and replaces this file at merge. */
export function useOpenDaily(): { open: () => Promise<void>; isPending: boolean } {
  return { open: () => Promise.resolve(), isPending: false };
}
