import {
  bevelFor,
  clampRadius,
  computeDisplacementMap,
  filterScale,
  mapKey,
  parseRadius,
  quantize,
  type MapSpec,
} from './displacement-map';

/** Elements that get a refraction filter (when their nearest data-glass is "liquid"). */
export const LIQUID_SELECTOR = '.glass, .glass-strong, .liquid-input, .liquid-hover';

/** The CSS variable holding url(#filter) for an element. The glass CSS reads it. */
export const FILTER_VAR = '--lg-filter';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Sizes are rounded to this many px so nearby sizes share one map. Override with data-liquid-step. */
const DEFAULT_STEP = 8;

/** Maps for big elements are drawn at half size (the filter stretches them). */
const HALF_RES_AREA = 180_000;

export interface Measurement {
  width: number;
  height: number;
  radius: number;
}

export interface EngineOptions {
  /** Refraction strength 0–100. */
  strength: number;
  document?: Document;
  selector?: string;
  /** Returns an image address for the map, or null if it cannot be drawn. */
  makeMap?: (spec: MapSpec) => string | null;
  measure?: (element: HTMLElement) => Measurement | null;
  /** Runs work on the next frame. Defaults to requestAnimationFrame. */
  schedule?: (work: () => void) => void;
  /** Called once if maps cannot be drawn, so the app can fall back to Simple glass. */
  onFailure?: (reason: string) => void;
  /** Most filters kept at once; the least recently used are dropped. */
  maxFilters?: number;
}

export interface LiquidGlassEngine {
  setStrength: (strength: number) => void;
  /** Applies pending changes now instead of on the next frame. */
  flush: () => void;
  destroy: () => void;
  filterCount: () => number;
  trackedCount: () => number;
}

interface FilterEntry {
  id: string;
  node: SVGFilterElement;
  displacement: SVGElement;
  users: number;
  lastUsed: number;
}

/** Draws a map with a canvas (no WebGL, no page screenshots). */
export function canvasMapFactory(doc: Document): (spec: MapSpec) => string | null {
  return (spec) => {
    const scale = spec.width * spec.height > HALF_RES_AREA ? 0.5 : 1;
    const width = Math.max(2, Math.round(spec.width * scale));
    const height = Math.max(2, Math.round(spec.height * scale));
    const canvas = doc.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const pixels = computeDisplacementMap({
      width,
      height,
      radius: spec.radius * scale,
      bevel: spec.bevel * scale,
    });
    context.putImageData(new ImageData(pixels, width, height), 0, 0);
    return canvas.toDataURL('image/png');
  };
}

function defaultMeasure(element: HTMLElement): Measurement | null {
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  if (width < 8 || height < 8) return null;
  const radius = parseRadius(getComputedStyle(element).borderTopLeftRadius, width, height);
  return { width, height, radius };
}

/**
 * Watches the page for glass elements and gives each one an SVG displacement filter through the
 * FILTER_VAR custom property. Only elements whose nearest data-glass is "liquid" get a filter.
 * Filters are shared between elements of the same (rounded) size, and updated as elements are
 * added, removed, resized, or the glass mode changes.
 */
export function createLiquidGlassEngine(options: EngineOptions): LiquidGlassEngine {
  const doc = options.document ?? document;
  const selector = options.selector ?? LIQUID_SELECTOR;
  const makeMap = options.makeMap ?? canvasMapFactory(doc);
  const measure = options.measure ?? defaultMeasure;
  const schedule = options.schedule ?? ((work: () => void) => requestAnimationFrame(work));
  const maxFilters = options.maxFilters ?? 80;

  let strength = options.strength;
  let destroyed = false;
  let failed = false;
  let scheduled = false;
  let frame = 0;
  let nextId = 0;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('data-liquid-glass-defs', '');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  doc.body.appendChild(svg);

  const filters = new Map<string, FilterEntry>();
  /** Every tracked element and the key of the filter it uses (undefined = none). */
  const tracked = new Map<HTMLElement, string | undefined>();
  const dirty = new Set<HTMLElement>();

  function fail(reason: string) {
    if (failed) return;
    failed = true;
    options.onFailure?.(reason);
  }

  function release(element: HTMLElement) {
    const key = tracked.get(element);
    if (key === undefined) return;
    const entry = filters.get(key);
    if (entry) entry.users = Math.max(0, entry.users - 1);
    tracked.set(element, undefined);
  }

  function clear(element: HTMLElement) {
    element.style.removeProperty(FILTER_VAR);
    release(element);
  }

  function evictIfNeeded() {
    if (filters.size < maxFilters) return;
    const unused = [...filters.entries()]
      .filter(([, entry]) => entry.users === 0)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key, entry] of unused) {
      if (filters.size < maxFilters) break;
      entry.node.remove();
      filters.delete(key);
    }
  }

  function filterFor(spec: MapSpec): FilterEntry | null {
    const key = mapKey(spec);
    const existing = filters.get(key);
    if (existing) return existing;

    const href = makeMap(spec);
    if (href === null) {
      fail('map-failed');
      return null;
    }
    evictIfNeeded();

    const id = `lg-${String(nextId++)}`;
    const node = doc.createElementNS(SVG_NS, 'filter');
    node.setAttribute('id', id);
    node.setAttribute('x', '0');
    node.setAttribute('y', '0');
    node.setAttribute('width', '1');
    node.setAttribute('height', '1');
    node.setAttribute('color-interpolation-filters', 'sRGB');

    // The map is stretched over the element, so it always lines up with the edges.
    const image = doc.createElementNS(SVG_NS, 'feImage');
    image.setAttribute('href', href);
    image.setAttribute('x', '0%');
    image.setAttribute('y', '0%');
    image.setAttribute('width', '100%');
    image.setAttribute('height', '100%');
    image.setAttribute('preserveAspectRatio', 'none');
    image.setAttribute('result', 'map');

    const displacement = doc.createElementNS(SVG_NS, 'feDisplacementMap');
    displacement.setAttribute('in', 'SourceGraphic');
    displacement.setAttribute('in2', 'map');
    displacement.setAttribute('scale', String(filterScale(strength)));
    displacement.setAttribute('xChannelSelector', 'R');
    displacement.setAttribute('yChannelSelector', 'G');

    node.append(image, displacement);
    svg.appendChild(node);
    const entry: FilterEntry = { id, node, displacement, users: 0, lastUsed: frame };
    filters.set(key, entry);
    return entry;
  }

  function process(element: HTMLElement) {
    if (failed) return;
    if (!element.isConnected) {
      release(element);
      tracked.delete(element);
      return;
    }
    const mode = element.closest('[data-glass]')?.getAttribute('data-glass');
    // data-liquid-skip: keeps the rim and shine but no refraction (small, short-lived elements)
    if (mode !== 'liquid' || strength <= 0 || element.hasAttribute('data-liquid-skip')) {
      clear(element);
      return;
    }
    const size = measure(element);
    if (!size) {
      clear(element);
      return;
    }

    const step = Number(element.dataset.liquidStep) || DEFAULT_STEP;
    const width = quantize(size.width, step);
    const height = quantize(size.height, step);
    const radius = clampRadius(Math.round(size.radius), width, height);
    const spec: MapSpec = { width, height, radius, bevel: bevelFor(width, height) };
    const key = mapKey(spec);

    if (tracked.get(element) === key) {
      const entry = filters.get(key);
      if (entry) entry.lastUsed = frame;
      return;
    }
    const entry = filterFor(spec);
    if (!entry) return;
    release(element);
    entry.users += 1;
    entry.lastUsed = frame;
    tracked.set(element, key);
    element.style.setProperty(FILTER_VAR, `url(#${entry.id})`);
  }

  function flush() {
    scheduled = false;
    if (destroyed) return;
    frame += 1;
    const batch = [...dirty];
    dirty.clear();
    for (const element of batch) process(element);
  }

  function request() {
    if (scheduled || destroyed) return;
    scheduled = true;
    schedule(flush);
  }

  function track(element: HTMLElement) {
    if (!tracked.has(element)) {
      tracked.set(element, undefined);
      resizeObserver.observe(element);
    }
    dirty.add(element);
  }

  function collect(node: Node) {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches(selector)) track(node);
    for (const element of node.querySelectorAll<HTMLElement>(selector)) track(element);
  }

  function forget(node: Node) {
    if (!(node instanceof HTMLElement)) return;
    for (const element of [node, ...node.querySelectorAll<HTMLElement>('*')]) {
      if (!tracked.has(element)) continue;
      release(element);
      tracked.delete(element);
      dirty.delete(element);
      resizeObserver.unobserve(element);
    }
  }

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.target instanceof HTMLElement && tracked.has(entry.target)) dirty.add(entry.target);
    }
    request();
  });

  const mutationObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of record.removedNodes) if (!node.isConnected) forget(node);
        for (const node of record.addedNodes) collect(node);
      } else if (record.target instanceof HTMLElement) {
        // data-glass or class changed: re-check this element and everything inside it
        collect(record.target);
        for (const element of tracked.keys()) {
          if (record.target.contains(element)) dirty.add(element);
        }
      }
    }
    request();
  });
  mutationObserver.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-glass', 'class'],
  });

  collect(doc.body);
  request();

  return {
    setStrength(next) {
      const previous = strength;
      strength = next;
      for (const entry of filters.values()) {
        entry.displacement.setAttribute('scale', String(filterScale(next)));
      }
      // Going to or from "no refraction" changes which elements need a filter at all
      if (previous <= 0 !== next <= 0) {
        for (const element of tracked.keys()) dirty.add(element);
        request();
      }
    },
    flush,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      for (const element of tracked.keys()) element.style.removeProperty(FILTER_VAR);
      tracked.clear();
      dirty.clear();
      filters.clear();
      svg.remove();
    },
    filterCount: () => filters.size,
    trackedCount: () => tracked.size,
  };
}
