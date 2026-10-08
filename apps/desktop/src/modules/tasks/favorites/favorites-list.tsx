/**
 * CONTRACT STUB for Feature 5 (the side panel's Favorites list). Until then it shows only the
 * "Favorites" title and a disabled + button.
 */
export function FavoritesList({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) return null;
  return (
    <div className="flex items-center justify-between px-3 text-small text-fg-muted">
      <span>Favorites</span>
      <button type="button" disabled aria-label="Add favorite" className="opacity-50">
        +
      </button>
    </div>
  );
}
