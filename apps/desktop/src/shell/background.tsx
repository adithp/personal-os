import type { BackgroundMode } from '@personal-os/shared';

export interface BackgroundProps {
  mode: BackgroundMode;
}

/**
 * Layer behind the whole app (docs/DESIGN.md section 2).
 * Transparent: a tint over the see-through window. Wallpaper: a gradient. Solid: the bg color.
 */
export function Background({ mode }: BackgroundProps) {
  const style =
    mode === 'transparent'
      ? { background: 'var(--tint)' }
      : mode === 'wallpaper'
        ? { background: 'var(--wallpaper-default)' }
        : undefined;

  return (
    <div
      aria-hidden
      data-testid="background"
      data-mode={mode}
      className="fixed inset-0 -z-10 bg-bg"
      style={style}
    />
  );
}
