import type { GlassEffect } from '@personal-os/shared';
import { useEffect, useRef, useState } from 'react';
import { createLiquidGlassEngine, type LiquidGlassEngine } from './engine';
import { detectLiquidGlassSupport, type LiquidSupport } from './support';

export interface LiquidGlassState {
  /** What is actually shown. "liquid" falls back to "simple" when it cannot be drawn. */
  effective: GlassEffect;
  /** True when Liquid was chosen but is not available, so Simple is shown instead. */
  unavailable: boolean;
  support: LiquidSupport;
}

/**
 * Applies a glass effect to the whole page: sets data-glass on <html> for the CSS and, for
 * "liquid", runs the refraction engine. Falls back to "simple" automatically if the engine
 * cannot be used (an unsupported browser) or fails to draw its maps.
 */
export function useLiquidGlass(
  chosen: GlassEffect,
  strength: number,
  detect: () => LiquidSupport = detectLiquidGlassSupport,
): LiquidGlassState {
  const [support] = useState(detect);
  const [failed, setFailed] = useState(false);

  const canLiquid = support.supported && !failed;
  const effective: GlassEffect = chosen === 'liquid' && !canLiquid ? 'simple' : chosen;

  useEffect(() => {
    document.documentElement.dataset.glass = effective;
  }, [effective]);

  const engine = useRef<LiquidGlassEngine | null>(null);
  const latestStrength = useRef(strength);
  useEffect(() => {
    latestStrength.current = strength;
  });

  useEffect(() => {
    if (effective !== 'liquid') return;
    const created = createLiquidGlassEngine({
      strength: latestStrength.current,
      onFailure: () => {
        setFailed(true);
      },
    });
    engine.current = created;
    return () => {
      created.destroy();
      engine.current = null;
    };
  }, [effective]);

  useEffect(() => {
    engine.current?.setStrength(strength);
  }, [strength]);

  return { effective, unavailable: chosen === 'liquid' && effective !== 'liquid', support };
}
