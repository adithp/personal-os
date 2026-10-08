/**
 * Can this browser engine draw Liquid Glass? It needs backdrop-filter that accepts an SVG filter
 * (url(#id)), which only Chromium-based engines (Edge, Chrome, and WebView2 in Tauri) do, and a
 * canvas to build the displacement maps. Anything else gets the Simple glass automatically.
 */

export interface LiquidSupport {
  supported: boolean;
  /** Why it is not supported, for the Settings screen. */
  reason?: 'no-backdrop-filter' | 'no-svg-backdrop-filter' | 'not-chromium' | 'no-canvas';
}

export interface SupportEnvironment {
  /** CSS.supports(property, value) */
  cssSupports: (property: string, value: string) => boolean;
  userAgent: string;
  /** True when a 2D canvas can be created. */
  canvas: () => boolean;
}

function browserEnvironment(): SupportEnvironment {
  return {
    cssSupports: (property, value) =>
      typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
        ? CSS.supports(property, value)
        : false,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    canvas: () => {
      try {
        return document.createElement('canvas').getContext('2d') !== null;
      } catch {
        return false;
      }
    },
  };
}

export function detectLiquidGlassSupport(
  env: SupportEnvironment = browserEnvironment(),
): LiquidSupport {
  if (!env.cssSupports('backdrop-filter', 'blur(1px)')) {
    return { supported: false, reason: 'no-backdrop-filter' };
  }
  if (!env.cssSupports('backdrop-filter', 'url(#liquid-glass-test) blur(1px)')) {
    return { supported: false, reason: 'no-svg-backdrop-filter' };
  }
  // Firefox and Safari accept the syntax but do not apply an SVG filter to the backdrop.
  // "HeadlessChrome/154" counts too, so there is no word boundary before "Chrome"
  if (!/Chrom(e|ium)\/\d+/.test(env.userAgent)) {
    return { supported: false, reason: 'not-chromium' };
  }
  if (!env.canvas()) return { supported: false, reason: 'no-canvas' };
  return { supported: true };
}
