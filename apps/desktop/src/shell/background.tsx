import type { BackgroundMode } from '@personal-os/shared';
import type { CSSProperties } from 'react';

export interface BackgroundProps {
  mode: BackgroundMode;
  /** Uploaded image for Wallpaper mode. Without it the built-in gradient is used. */
  imageUrl?: string | null;
}

function styleFor(
  mode: BackgroundMode,
  imageUrl: string | null | undefined,
): CSSProperties | undefined {
  if (mode === 'transparent') return { background: 'var(--tint)' };
  if (mode === 'solid') return undefined;
  if (imageUrl) {
    return {
      backgroundImage: `url("${imageUrl.replaceAll('"', '%22')}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }
  return { background: 'var(--wallpaper-default)' };
}

/**
 * Layer behind the whole app (docs/DESIGN.md section 2).
 * Transparent: a tint over the see-through window. Wallpaper: an image or gradient.
 * Solid: the bg color.
 */
export function Background({ mode, imageUrl }: BackgroundProps) {
  return (
    <div
      aria-hidden
      data-testid="background"
      data-mode={mode}
      data-image={mode === 'wallpaper' && Boolean(imageUrl)}
      className="fixed inset-0 -z-10 bg-bg"
      style={styleFor(mode, imageUrl)}
    />
  );
}
