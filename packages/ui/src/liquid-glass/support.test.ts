// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { detectLiquidGlassSupport, type SupportEnvironment } from './support';

const EDGE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0';
const FIREFOX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0';
const SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

function env(overrides: Partial<SupportEnvironment> = {}): SupportEnvironment {
  return {
    cssSupports: () => true,
    userAgent: EDGE_UA,
    canvas: () => true,
    ...overrides,
  };
}

describe('detectLiquidGlassSupport', () => {
  it('is supported in Chromium (Edge, Chrome, and WebView2 in Tauri)', () => {
    expect(detectLiquidGlassSupport(env())).toEqual({ supported: true });
    expect(
      detectLiquidGlassSupport(env({ userAgent: EDGE_UA.replace(' Edg/154.0.0.0', '') })).supported,
    ).toBe(true);
  });

  it('is supported in headless Chrome and Edge too (their user agent says HeadlessChrome)', () => {
    const headless = EDGE_UA.replace('Chrome/', 'HeadlessChrome/');
    expect(detectLiquidGlassSupport(env({ userAgent: headless })).supported).toBe(true);
  });

  it('is not supported without backdrop-filter', () => {
    expect(detectLiquidGlassSupport(env({ cssSupports: () => false }))).toEqual({
      supported: false,
      reason: 'no-backdrop-filter',
    });
  });

  it('is not supported when backdrop-filter cannot take an SVG filter', () => {
    const cssSupports = (_: string, value: string) => !value.includes('url(');
    expect(detectLiquidGlassSupport(env({ cssSupports }))).toEqual({
      supported: false,
      reason: 'no-svg-backdrop-filter',
    });
  });

  it.each([
    ['Firefox', FIREFOX_UA],
    ['Safari', SAFARI_UA],
    ['an empty user agent', ''],
  ])('is not supported in %s, even if it accepts the CSS', (_name, userAgent) => {
    expect(detectLiquidGlassSupport(env({ userAgent }))).toEqual({
      supported: false,
      reason: 'not-chromium',
    });
  });

  it('is not supported without a canvas to draw the maps', () => {
    expect(detectLiquidGlassSupport(env({ canvas: () => false }))).toEqual({
      supported: false,
      reason: 'no-canvas',
    });
  });

  it('asks about the exact CSS it needs', () => {
    const asked: string[] = [];
    detectLiquidGlassSupport(
      env({
        cssSupports: (property, value) => {
          asked.push(`${property}: ${value}`);
          return true;
        },
      }),
    );
    expect(asked).toEqual([
      'backdrop-filter: blur(1px)',
      'backdrop-filter: url(#liquid-glass-test) blur(1px)',
    ]);
  });

  it('is not supported in a plain jsdom-like environment with no real CSS support', () => {
    expect(detectLiquidGlassSupport().supported).toBe(false);
  });
});
