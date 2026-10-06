export interface WallpaperProps {
  enabled: boolean;
}

/** Full-window background behind the glass panels. Off shows the solid bg color. */
export function Wallpaper({ enabled }: WallpaperProps) {
  return (
    <div
      aria-hidden
      data-testid="wallpaper"
      data-enabled={enabled}
      className="fixed inset-0 -z-10 bg-bg"
      style={enabled ? { background: 'var(--wallpaper-default)' } : undefined}
    />
  );
}
