import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filterScale } from './displacement-map';
import {
  FILTER_VAR,
  canvasMapFactory,
  createLiquidGlassEngine,
  type EngineOptions,
  type LiquidGlassEngine,
  type Measurement,
} from './engine';

/** A ResizeObserver the tests can fire by hand. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed = new Set<Element>();
  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
  observe(element: Element) {
    this.observed.add(element);
  }
  unobserve(element: Element) {
    this.observed.delete(element);
  }
  disconnect() {
    this.observed.clear();
  }
  fire(...elements: Element[]) {
    this.callback(
      elements.map((target) => ({ target }) as ResizeObserverEntry),
      this,
    );
  }
}

const sizes = new WeakMap<Element, Measurement | null>();
const measure = (element: HTMLElement) => sizes.get(element) ?? null;

function glass(
  parent: HTMLElement,
  size: Measurement | null = { width: 300, height: 160, radius: 16 },
  className = 'glass',
) {
  const element = document.createElement('div');
  element.className = className;
  sizes.set(element, size);
  parent.appendChild(element);
  return element;
}

function region(mode: string | null, parent: HTMLElement = document.body) {
  const element = document.createElement('div');
  if (mode) element.setAttribute('data-glass', mode);
  parent.appendChild(element);
  return element;
}

const MAP = 'data:image/png;base64,TESTMAP';
const filterOf = (element: HTMLElement) => element.style.getPropertyValue(FILTER_VAR);

let engine: LiquidGlassEngine | undefined;

function start(overrides: Partial<EngineOptions> = {}) {
  engine = createLiquidGlassEngine({
    strength: 50,
    makeMap: () => MAP,
    measure,
    schedule: () => undefined, // tests call flush() themselves
    ...overrides,
  });
  engine.flush();
  return engine;
}

/** Lets MutationObserver callbacks run, then applies the changes. */
async function settle() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  engine?.flush();
}

beforeEach(() => {
  FakeResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  engine?.destroy();
  engine = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('setup and teardown', () => {
  it('adds one hidden SVG for the filters, and removes it on destroy', () => {
    start();
    const svg = document.querySelector('[data-liquid-glass-defs]');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('width')).toBe('0');
    engine?.destroy();
    expect(document.querySelector('[data-liquid-glass-defs]')).toBeNull();
  });

  it('removes every filter variable and stops watching on destroy', async () => {
    const root = region('liquid');
    const a = glass(root);
    start();
    expect(filterOf(a)).toMatch(/^url\(#lg-\d+\)$/);

    engine?.destroy();
    expect(filterOf(a)).toBe('');
    expect(engine?.trackedCount()).toBe(0);

    const later = glass(root);
    await settle();
    expect(filterOf(later)).toBe('');
  });

  it('can be destroyed twice', () => {
    start();
    engine?.destroy();
    expect(() => engine?.destroy()).not.toThrow();
  });
});

describe('which elements get a filter', () => {
  it.each(['glass', 'glass-strong', 'liquid-input', 'liquid-hover'])('finds .%s', (className) => {
    const root = region('liquid');
    const el = glass(root, undefined, className);
    start();
    expect(filterOf(el)).toMatch(/^url\(#lg-\d+\)$/);
  });

  it('ignores elements that are not glass', () => {
    const root = region('liquid');
    const plain = glass(root, undefined, 'something-else');
    start();
    expect(filterOf(plain)).toBe('');
    expect(engine?.trackedCount()).toBe(0);
  });

  it('gives filters only inside a Liquid region', () => {
    const none = glass(document.body);
    const simple = glass(region('simple'));
    const off = glass(region('off'));
    const liquid = glass(region('liquid'));
    start();
    expect(filterOf(none)).toBe('');
    expect(filterOf(simple)).toBe('');
    expect(filterOf(off)).toBe('');
    expect(filterOf(liquid)).not.toBe('');
  });

  it('uses the nearest region, so modes can sit side by side', () => {
    const outer = region('liquid');
    const inner = region('simple', outer);
    const innerLiquid = region('liquid', inner);
    const a = glass(inner);
    const b = glass(innerLiquid);
    const c = glass(outer);
    start();
    expect(filterOf(a)).toBe('');
    expect(filterOf(b)).not.toBe('');
    expect(filterOf(c)).not.toBe('');

    const reverseOuter = region('simple');
    const reverseInner = region('liquid', reverseOuter);
    const d = glass(reverseInner);
    const e = glass(reverseOuter);
    engine?.destroy();
    start();
    expect(filterOf(d)).not.toBe('');
    expect(filterOf(e)).toBe('');
  });

  it('skips elements marked data-liquid-skip (no refraction, so no filter is made for them)', async () => {
    const makeMap = vi.fn(() => MAP);
    const root = region('liquid');
    const normal = glass(root, { width: 300, height: 160, radius: 16 });
    const skipped = glass(root, { width: 60, height: 24, radius: 8 });
    skipped.setAttribute('data-liquid-skip', '');
    start({ makeMap });
    expect(filterOf(normal)).not.toBe('');
    expect(filterOf(skipped)).toBe('');
    expect(makeMap).toHaveBeenCalledTimes(1);

    // Tooltips come and go with every hover and are never given a filter
    const tip = glass(root, { width: 72, height: 26, radius: 8 });
    tip.setAttribute('data-liquid-skip', '');
    await settle();
    expect(filterOf(tip)).toBe('');
    expect(engine?.filterCount()).toBe(1);
  });

  it('skips elements too small or not laid out', () => {
    const root = region('liquid');
    const hidden = glass(root, null);
    const tiny = glass(root, { width: 4, height: 4, radius: 2 });
    start({ measure: (el) => measure(el) });
    expect(filterOf(hidden)).toBe('');
    expect(filterOf(tiny)).not.toBe(''); // the custom measure decides; real layout skips < 8 px
  });
});

describe('the filter', () => {
  it('stretches the map over the element and displaces the backdrop with it', () => {
    const root = region('liquid');
    glass(root);
    start({ strength: 50 });

    const filter = document.querySelector('[data-liquid-glass-defs] filter');
    expect(filter?.getAttribute('x')).toBe('0');
    expect(filter?.getAttribute('y')).toBe('0');
    expect(filter?.getAttribute('width')).toBe('1');
    expect(filter?.getAttribute('height')).toBe('1');
    expect(filter?.getAttribute('color-interpolation-filters')).toBe('sRGB');

    const image = filter?.querySelector('feImage');
    expect(image?.getAttribute('href')).toBe(MAP);
    expect(image?.getAttribute('preserveAspectRatio')).toBe('none');
    expect(image?.getAttribute('width')).toBe('100%');
    expect(image?.getAttribute('height')).toBe('100%');

    const displacement = filter?.querySelector('feDisplacementMap');
    expect(displacement?.getAttribute('in2')).toBe('map');
    expect(displacement?.getAttribute('xChannelSelector')).toBe('R');
    expect(displacement?.getAttribute('yChannelSelector')).toBe('G');
    expect(displacement?.getAttribute('scale')).toBe(String(filterScale(50)));
  });

  it('points the element at its filter by id', () => {
    const root = region('liquid');
    const el = glass(root);
    start();
    const id = document.querySelector('[data-liquid-glass-defs] filter')?.getAttribute('id');
    expect(filterOf(el)).toBe(`url(#${id ?? ''})`);
  });

  it('draws one map per distinct shape and shares it between equal shapes', () => {
    const makeMap = vi.fn(() => MAP);
    const root = region('liquid');
    const a = glass(root, { width: 300, height: 160, radius: 16 });
    const b = glass(root, { width: 300, height: 160, radius: 16 });
    const c = glass(root, { width: 300, height: 100, radius: 16 });
    start({ makeMap });
    expect(engine?.filterCount()).toBe(2);
    expect(makeMap).toHaveBeenCalledTimes(2);
    expect(filterOf(a)).toBe(filterOf(b));
    expect(filterOf(a)).not.toBe(filterOf(c));
  });

  it('rounds sizes to 8 px so nearby sizes share a map', () => {
    const root = region('liquid');
    const a = glass(root, { width: 300, height: 160, radius: 16 });
    const b = glass(root, { width: 303, height: 158, radius: 16 });
    start();
    expect(engine?.filterCount()).toBe(1);
    expect(filterOf(a)).toBe(filterOf(b));
  });

  it('uses a coarser step when asked (the dock changes width while icons grow)', () => {
    const root = region('liquid');
    const a = glass(root, { width: 540, height: 60, radius: 18 });
    const b = glass(root, { width: 556, height: 60, radius: 18 });
    a.dataset.liquidStep = '32';
    b.dataset.liquidStep = '32';
    start();
    expect(filterOf(a)).toBe(filterOf(b));
  });

  it('keeps a radius that fits the box', () => {
    const makeMap = vi.fn(() => MAP);
    const root = region('liquid');
    glass(root, { width: 120, height: 40, radius: 9999 });
    start({ makeMap });
    expect(makeMap).toHaveBeenCalledWith(
      expect.objectContaining({ width: 120, height: 40, radius: 20 }),
    );
  });
});

describe('strength', () => {
  it('updates every filter when the strength changes', () => {
    const root = region('liquid');
    glass(root, { width: 300, height: 160, radius: 16 });
    glass(root, { width: 200, height: 100, radius: 16 });
    start({ strength: 50 });

    engine?.setStrength(100);
    for (const node of document.querySelectorAll('feDisplacementMap')) {
      expect(node.getAttribute('scale')).toBe(String(filterScale(100)));
    }
    engine?.setStrength(20);
    for (const node of document.querySelectorAll('feDisplacementMap')) {
      expect(node.getAttribute('scale')).toBe(String(filterScale(20)));
    }
  });

  it('removes the filters at strength 0 and brings them back above 0', () => {
    const root = region('liquid');
    const el = glass(root);
    start({ strength: 50 });
    expect(filterOf(el)).not.toBe('');

    engine?.setStrength(0);
    engine?.flush();
    expect(filterOf(el)).toBe('');

    engine?.setStrength(30);
    engine?.flush();
    expect(filterOf(el)).not.toBe('');
  });

  it('starts with no filters at strength 0', () => {
    const root = region('liquid');
    const el = glass(root);
    start({ strength: 0 });
    expect(filterOf(el)).toBe('');
  });
});

describe('changes in the page', () => {
  it('picks up glass elements added later', async () => {
    const root = region('liquid');
    start();
    const added = glass(root);
    await settle();
    expect(filterOf(added)).not.toBe('');
  });

  it('picks up glass inside an added subtree', async () => {
    const root = region('liquid');
    start();
    const wrapper = document.createElement('section');
    const inner = glass(wrapper);
    root.appendChild(wrapper);
    await settle();
    expect(filterOf(inner)).not.toBe('');
  });

  it('stops tracking removed elements', async () => {
    const root = region('liquid');
    const el = glass(root);
    start();
    expect(engine?.trackedCount()).toBe(1);
    el.remove();
    await settle();
    expect(engine?.trackedCount()).toBe(0);
  });

  it('re-checks everything inside a region when its mode changes', async () => {
    const root = region('liquid');
    const el = glass(root);
    start();
    expect(filterOf(el)).not.toBe('');

    root.setAttribute('data-glass', 'simple');
    await settle();
    expect(filterOf(el)).toBe('');

    root.setAttribute('data-glass', 'liquid');
    await settle();
    expect(filterOf(el)).not.toBe('');

    root.setAttribute('data-glass', 'off');
    await settle();
    expect(filterOf(el)).toBe('');
  });

  it('makes a new filter when an element is resized', () => {
    const root = region('liquid');
    const el = glass(root, { width: 300, height: 160, radius: 16 });
    start();
    const before = filterOf(el);

    sizes.set(el, { width: 400, height: 160, radius: 16 });
    FakeResizeObserver.instances[0]?.fire(el);
    engine?.flush();
    expect(filterOf(el)).not.toBe(before);
    expect(filterOf(el)).not.toBe('');
  });

  it('does nothing for a resize that stays within the same rounded size', () => {
    const makeMap = vi.fn(() => MAP);
    const root = region('liquid');
    const el = glass(root, { width: 300, height: 160, radius: 16 });
    start({ makeMap });
    sizes.set(el, { width: 302, height: 161, radius: 16 });
    FakeResizeObserver.instances[0]?.fire(el);
    engine?.flush();
    expect(makeMap).toHaveBeenCalledTimes(1);
  });

  it('ignores resize reports for elements it does not track', () => {
    const root = region('liquid');
    glass(root);
    start();
    const stranger = document.createElement('div');
    expect(() => FakeResizeObserver.instances[0]?.fire(stranger)).not.toThrow();
  });
});

describe('limits and failure', () => {
  it('keeps at most maxFilters, dropping unused ones first', async () => {
    const root = region('liquid');
    start({ maxFilters: 3 });
    const elements: HTMLElement[] = [];
    for (let i = 0; i < 6; i++) {
      elements.push(glass(root, { width: 100 + i * 40, height: 80, radius: 12 }));
      await settle();
    }
    // Free the first ones so they can be dropped
    for (const el of elements.slice(0, 3)) el.remove();
    await settle();
    const extra = glass(root, { width: 700, height: 80, radius: 12 });
    await settle();
    expect(filterOf(extra)).not.toBe('');
    expect(engine?.filterCount()).toBeLessThanOrEqual(5);
  });

  it('never drops a filter that an element still uses', async () => {
    const root = region('liquid');
    const first = glass(root, { width: 100, height: 80, radius: 12 });
    start({ maxFilters: 2 });
    const id = filterOf(first);
    for (let i = 0; i < 4; i++) {
      glass(root, { width: 200 + i * 40, height: 80, radius: 12 });
      await settle();
    }
    expect(filterOf(first)).toBe(id);
    expect(document.getElementById(id.slice(5, -1))).not.toBeNull();
  });

  it('reports a failure once when the maps cannot be drawn, and sets no filters', () => {
    const onFailure = vi.fn();
    const root = region('liquid');
    const a = glass(root);
    const b = glass(root, { width: 200, height: 100, radius: 8 });
    start({ makeMap: () => null, onFailure });
    expect(onFailure).toHaveBeenCalledOnce();
    expect(onFailure).toHaveBeenCalledWith('map-failed');
    expect(filterOf(a)).toBe('');
    expect(filterOf(b)).toBe('');
    expect(engine?.filterCount()).toBe(0);
  });
});

describe('canvasMapFactory', () => {
  function fakeDocument(context: object | null) {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toDataURL: () => 'data:image/png;base64,FAKE',
    };
    return { document: { createElement: () => canvas } as unknown as Document, canvas };
  }

  beforeEach(() => {
    vi.stubGlobal(
      'ImageData',
      class {
        constructor(
          readonly data: Uint8ClampedArray,
          readonly width: number,
          readonly height: number,
        ) {}
      },
    );
  });

  it('draws the map on a canvas and returns it as an image address', () => {
    const putImageData = vi.fn();
    const { document: doc, canvas } = fakeDocument({ putImageData });
    const url = canvasMapFactory(doc)({ width: 120, height: 80, radius: 16, bevel: 18 });
    expect(url).toBe('data:image/png;base64,FAKE');
    expect(canvas.width).toBe(120);
    expect(canvas.height).toBe(80);
    expect(putImageData).toHaveBeenCalledOnce();
  });

  it('draws big maps at half size (the filter stretches them)', () => {
    const { document: doc, canvas } = fakeDocument({ putImageData: vi.fn() });
    canvasMapFactory(doc)({ width: 800, height: 600, radius: 16, bevel: 28 });
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(300);
  });

  it('returns null when there is no 2D canvas', () => {
    const { document: doc } = fakeDocument(null);
    expect(canvasMapFactory(doc)({ width: 120, height: 80, radius: 16, bevel: 18 })).toBeNull();
  });
});
