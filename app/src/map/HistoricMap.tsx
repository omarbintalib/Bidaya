import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { COS, K, LAND } from '../data/land';
import { LAKES, MAP_IMAGES, RIVERS } from '../data/terrain';
import type { MapArc, RouteStop, Sirah, SirahEvent } from '../data/types';
import type { Locale } from '../i18n';
import { mapCopy } from './copy';
import { eventPlaceName, placeNameAt } from '../data/select';
import { centerOn, clampView, fit, HEIGHT, homeView, project, WIDTH, type View } from './projection';
import './map.css';

/** How far a region's gold wash reaches, in degrees of latitude, by the label's size. */
const REGION_REACH = { l: 3.4, m: 2.6, s: 1.8 } as const;
/** The Year of Delegations (Dorar event 135, 9 AH): «بادر كل قوم بإسلامهم». Until then a reached region only has its
 * name in gold, since early on Islam was in a few of its towns, not across it; from then on the region is washed in gold. */
const DELEGATIONS = 135;

export type Emphasis = 'selected' | 'active' | 'past' | 'hidden';

interface Props {
  data: Sirah;
  locale: Locale;
  emphasis: (event: SirahEvent) => Emphasis;
  selected: number | null;
  /** Route IDs to draw strongly; Sirah routes whose events are hidden are not drawn. */
  activeRoutes?: string[];
  onSelect: (n: number) => void;
  reducedMotion: boolean;
  /** Changing this key re-centres on the selected event. */
  focusKey?: string | number;
  caption?: string;
  /** Current point in the story (ترتيب_العرض): places and regions Islam had reached by then glow. */
  now?: number;
  /** Width in px covered by an overlay on the inline-start side; the map centres events in the rest. */
  inset?: number;
  /** Height (px) of controls laid over the bottom of the map; the focus keeps places above them. */
  insetBottom?: number;
  /** Content drawn over the map (e.g. the story card). */
  children?: ReactNode;
  /** Hide the legend under the map. */
  legend?: boolean;
  /** Chapter question: these places become large tap targets; after an answer, the right one is marked. */
  quiz?: { options: string[]; answer: string; chosen: string | null; onPick: (key: string) => void } | null;
  /** Route walk: draw the route up to this stop and fly to it. */
  walk?: { routeId: string; lat: number; lon: number; key: string; name?: string } | null;
  /** A place to fly to instead of the selected event (e.g. the whole map for the summary). */
  overview?: boolean;
  /** Caravans moving along the trade routes (the Makkan chapters). */
  caravans?: boolean;
  /** In a scrolling page the wheel scrolls; the map zooms with Ctrl/⌘ + wheel, pinch or the buttons. */
  scrollPage?: boolean;
}

// Decorative and approximate: the line of the Sarawat / Hijaz mountains.


interface PlaceLabel { key: string; x: number; y: number; name: string; priority: number; strong: boolean }

interface Pin { key: string; x: number; y: number; events: SirahEvent[]; emphasis: Emphasis; precision: SirahEvent['precision']; name: string }

/** A file in public/, wherever the site is served from. */
const img = (file: string) => `${import.meta.env.BASE_URL}${file}`;

const RANK: Record<Emphasis, number> = { hidden: 0, past: 1, active: 2, selected: 3 };

export default function HistoricMap({ data, locale, emphasis, selected, activeRoutes = [], onSelect, reducedMotion, focusKey, caption, now, inset = 0, insetBottom = 0, children, legend = true, quiz = null, walk = null, overview = false, caravans = false, scrollPage = false }: Props) {
  const text = mapCopy[locale];
  const frame = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>(() => homeView(4 / 3));
  const viewRef = useRef(view);
  const scrollPageRef = useRef(scrollPage);
  scrollPageRef.current = scrollPage;
  useLayoutEffect(() => { viewRef.current = view; }, [view]); // a glide updates the ref directly between renders
  const anim = useRef(0);
  const [showTrade, setShowTrade] = useState(true);
  const [nameTip, setNameTip] = useState<{ key: string; x: number; y: number; text: string } | null>(null);
  useEffect(() => setNameTip(null), [now, locale]); // the story moved on: the name may have changed

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth || 800, h = el.clientHeight || 600;
      setSize(prev => {
        if (prev.w === w && prev.h === h) return prev;
        const v = viewRef.current, cx = v.x + v.w / 2, cy = v.y + v.h / 2, nh = v.w * h / w;
        setView(clampView({ x: cx - v.w / 2, y: cy - nh / 2, w: v.w, h: nh }));
        return { w, h };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const animateTo = useCallback((target: View) => {
    cancelAnimationFrame(anim.current);
    if (reducedMotion) { setView(target); return; }
    const from = viewRef.current, start = performance.now(), D = 650;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    // Glide by moving the SVG's viewBox directly; React re-renders once, when the glide ends.
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / D), k = ease(t);
      const v = { x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k, w: from.w + (target.w - from.w) * k, h: from.h + (target.h - from.h) * k };
      viewRef.current = v;
      const svg = svgRef.current;
      if (svg) {
        svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
        // Names and pins were drawn for the zoom of the last render; rescale them every frame so they keep
        // their size on screen during the glide instead of snapping when it ends.
        const u = Math.min(v.w / size.w, v.h / size.h); // the measured size: reading the layout each frame would force a reflow
        svg.style.setProperty('--k', (u / unitRef.current).toFixed(4));
      }
      if (t < 1) anim.current = requestAnimationFrame(tick);
      else setView(target);
    };
    anim.current = requestAnimationFrame(tick);
  }, [reducedMotion, size]);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // Letters sent from Madinah and delegations that came to it, drawn while their event is selected.
  const arcsHere = useMemo(() => selected === null ? [] : data.arcs.filter(a => a.event === selected), [data, selected]);
  // Everything to keep in view for the selected event: both ends of its letters or delegations, and its routes,
  // so a journey is seen whole rather than only the place where it is told.
  const activeKey = activeRoutes.join();
  // During a walk the whole route stays in view and the current stop is highlighted on it, rather than the map
  // zooming in on each stop and losing the rest of the journey.
  const walkRoute = walk?.routeId;
  const fitPoints = useMemo(() => walkRoute ? (data.routes.find(r => r.id === walkRoute)?.coords ?? []).map(([lon, lat]) => ({ lon, lat })) : [
    // Each end's name is drawn under its dot and centred on it: leave room for it to either side and below.
    ...arcsHere.flatMap(a => [a.from, a.to, ...[a.kind === 'letter' ? a.to : a.from].flatMap(p => [{ lon: p.lon - 1.4, lat: p.lat - 0.9 }, { lon: p.lon + 1.4, lat: p.lat - 0.9 }])]),
    ...data.routes.filter(r => r.kind === 'sirah' && activeRoutes.includes(r.id)).flatMap(r => r.coords.map(([lon, lat]) => ({ lon, lat }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [arcsHere, data, activeKey, walkRoute]);

  // Follow the selected event when the caller asks.
  useEffect(() => {
    if (focusKey === undefined) return;
    if (overview) { animateTo(homeView(size.w / size.h)); return; }
    if (quiz || fitPoints.length > 1) {
      // Fit every answer choice, or the event's routes and letters, in view.
      const pts = quiz ? quiz.options.map(k => data.places.get(k)).filter(p => p !== undefined) : fitPoints;
      if (pts.length) {
        const lons = pts.map(p => p.lon), lats = pts.map(p => p.lat);
        // Fit the choices into the part of the map left uncovered by a side panel and the bottom controls.
        const W = frame.current?.clientWidth || size.w, H = frame.current?.clientHeight || size.h;
        const cover = Math.min(inset, W * 0.6), coverB = Math.min(insetBottom, H * 0.5);
        const coverT = quiz ? 0 : 64; // the period badge over the top of the map
        const v = fit(Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats), (W - cover) / (H - coverB - coverT), quiz ? 0.3 : 0.1);
        const s = v.w / (W - cover);
        const fv = clampView({ x: locale === 'ar' ? v.x : v.x - cover * s, y: v.y - coverT * s, w: W * s, h: H * s });
        // When the map is too short to hold the whole fit, keep the southernmost point above the bottom controls.
        const u = fv.w / W, south = project(0, Math.min(...lats))[1] + 14 * u, over = south - (fv.y + fv.h - coverB * u);
        animateTo(over > 0 ? clampView({ ...fv, y: fv.y + over }) : fv);
        return;
      }
    }
    const quizCenter = quiz ? (() => {
      const pts = quiz.options.map(k => data.places.get(k)).filter(p => p !== undefined);
      return pts.length ? { lon: pts.reduce((a, p) => a + p.lon, 0) / pts.length, lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length } : null;
    })() : null;
    const e = selected === null ? null : data.byNumber.get(selected);
    const target = walk ?? quizCenter ?? (e && e.lat !== null && e.lon !== null ? { lon: e.lon, lat: e.lat } : null);
    if (!target) return;
    const v = viewRef.current, [x, y] = project(target.lon, target.lat), el = frame.current;
    const W = el?.clientWidth || 800, H = el?.clientHeight || 600, u = v.w / W, rtl = locale === 'ar';
    const cover = Math.min(inset, W * 0.6) * u;           // map units hidden under the overlay
    const coverB = Math.min(insetBottom, H * 0.5);        // px hidden under the bottom controls
    const left = rtl ? v.x : v.x + cover, right = rtl ? v.x + v.w - cover : v.x + v.w;
    const bottom = v.y + v.h - coverB * u;
    const mx = (right - left) * 0.15, my = (bottom - v.y) * 0.15;
    const inside = x > left + mx && x < right - mx && y > v.y + my && y < bottom - my;
    // Fly closer when the whole peninsula is in view, so the story moves place to place.
    const w = walk ? 230 : quizCenter ? 330 : v.w > 480 ? 400 : v.w;
    if (!inside || w !== v.w) {
      const next = centerOn(v, target.lon, target.lat, w), tu = next.w / W;
      // Centre the place in the visible part: beside a side panel, above the bottom controls.
      animateTo(clampView({ ...next, x: next.x + (rtl ? 1 : -1) * Math.min(inset, W * 0.6) / 2 * tu, y: next.y + coverB / 2 * tu }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, selected, data, animateTo, inset, insetBottom, locale, overview, walk?.key, quiz?.options.join(), fitPoints]);

  // A place that lights up while you watch sends out one pulse.
  const [pulses, setPulses] = useState<string[]>([]);
  const litBefore = useRef<Set<string> | null>(null);
  useEffect(() => {
    const lit = new Set([...data.places.values()].filter(p => p.reached !== null && (data.byNumber.get(p.reached)?.order ?? Infinity) <= (now ?? -Infinity)).map(p => p.key));
    const prev = litBefore.current;
    litBefore.current = lit;
    // Only a place lighting up as the story moves forward pulses; any other change clears old pulses.
    const fresh = prev && !reducedMotion ? [...lit].filter(k => !prev.has(k)) : [];
    setPulses(fresh);
    if (!fresh.length) return;
    const id = window.setTimeout(() => setPulses([]), 2600);
    return () => window.clearTimeout(id);
  }, [now, data, reducedMotion]);

  // SVG units per screen pixel (the SVG uses "slice", so the larger scale wins).
  const unit = Math.min(view.w / size.w, view.h / size.h);
  const unitRef = useRef(unit);
  useLayoutEffect(() => { unitRef.current = unit; svgRef.current?.style.setProperty('--k', '1'); }, [unit]);

  const pins = useMemo(() => {
    const groups = new Map<string, Pin>();
    for (const e of data.events) {
      if (e.lat === null || e.lon === null) continue;
      const em = emphasis(e);
      if (em === 'hidden') continue;
      const key = e.place ?? `${e.lat},${e.lon}`;
      const [x, y] = project(e.lon, e.lat);
      const pin = groups.get(key);
      if (!pin) groups.set(key, { key, x, y, events: [e], emphasis: em, precision: e.precision, name: eventPlaceName(data, e, locale) });
      else {
        pin.events.push(e);
        if (RANK[em] > RANK[pin.emphasis]) { pin.emphasis = em; pin.precision = e.precision; }
      }
    }
    return [...groups.values()].sort((a, b) => RANK[a.emphasis] - RANK[b.emphasis]);
  }, [data, emphasis, locale]);

  // The first event at each place, in story order: its name appears on the map from then on.
  const firstOrder = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data.events) if (e.place && e.order < (m.get(e.place) ?? Infinity)) m.set(e.place, e.order);
    return m;
  }, [data]);
  // How many Muslims the sources count at a place by now (islam_growth.csv; a lower bound), 0 when none is given.
  const countAt = (key: string) => {
    let c = 0;
    for (const g of data.growth.get(key) ?? []) if ((data.byNumber.get(g.event)?.order ?? Infinity) <= (now ?? -Infinity)) c = Math.max(c, g.count);
    return c;
  };

  // Spread of Islam: places and regions whose sourced "Islam reached" event is at or before `now`.
  const reachedBy = (n: number | null) => n !== null && now !== undefined && (data.byNumber.get(n)?.order ?? Infinity) <= now;
  const glowPlaces = useMemo(() => [...data.places.values()].filter(p => p.reached !== null), [data]);

  // Place names that stay readable at every zoom: the selected place first, then places Islam had reached,
  // then this stage's places, then the busiest; a name is skipped where it would overlap one already placed.
  const labels = useMemo(() => {
    const cand = new Map<string, PlaceLabel>();
    const add = (key: string, lon: number, lat: number, name: string, priority: number, strong: boolean) => {
      const old = cand.get(key);
      if (old && old.priority >= priority) return;
      const [x, y] = project(lon, lat);
      cand.set(key, { key, x, y, name, priority, strong });
    };
    // Names appear as the story reaches them (a place is named from its first event on), and as they were then:
    // Yathrib until the Hijrah, then al-Madinah.
    const nameNow = (key: string) => { const p = data.places.get(key); return p ? placeNameAt(data, key, now, locale) ?? p.name[locale] : null; };
    for (const p of data.places.values()) {
      if (p.events === 0) continue;
      if (now !== undefined && (firstOrder.get(p.key) ?? Infinity) > now && !reachedBy(p.reached)) continue;
      add(p.key, p.lon, p.lat, nameNow(p.key)!, Math.min(p.events, 20) + (reachedBy(p.reached) ? 120 : 0), reachedBy(p.reached));
    }
    for (const pin of pins) {
      const pl = pin.events[0];
      if (pin.emphasis === 'past') continue;
      add(pin.key, pl.lon!, pl.lat!, nameNow(pin.key) ?? pin.name, pin.emphasis === 'selected' ? 1000 : 100, true);
    }
    return [...cand.values()].sort((a, b) => b.priority - a.priority);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, pins, locale, now, firstOrder]);
  const placed = useMemo(() => {
    const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [], out: (PlaceLabel & { size: number })[] = [];
    for (const l of labels) {
      const size = (l.priority >= 1000 ? 15 : l.strong ? 13 : 12) * unit, w = l.name.length * size * 0.52 + 6 * unit, h = size * 1.35;
      const box = { x0: l.x - w / 2, y0: l.y - h - 7 * unit, x1: l.x + w / 2, y1: l.y - 4 * unit };
      if (box.x1 < view.x || box.x0 > view.x + view.w || box.y1 < view.y || box.y0 > view.y + view.h) continue;
      if (boxes.some(b => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
      boxes.push(box); out.push({ ...l, size });
      if (out.length > 28) break;
    }
    return out;
  }, [labels, unit, view]);

  // Drag to pan, wheel / pinch to zoom.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ view: View; dist: number; cx: number; cy: number; moved: boolean } | null>(null);
  const toLocal = (clientX: number, clientY: number) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };
  const startGesture = () => {
    const pts = [...pointers.current.values()];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { view: viewRef.current, dist, cx, cy, moved: gesture.current?.moved ?? false };
  };
  const onPointerDown = (ev: ReactPointerEvent) => {
    if ((ev.target as Element).closest('button, a, [data-map-overlay]')) return;
    cancelAnimationFrame(anim.current);
    setView(viewRef.current); // keep a glide's position if a drag interrupts it
    pointers.current.set(ev.pointerId, toLocal(ev.clientX, ev.clientY));
    // Capture only once a drag begins (below), so a plain tap still reaches the pin or place under it.
    gesture.current = null;
    startGesture();
  };
  const onPointerMove = (ev: ReactPointerEvent) => {
    if (!pointers.current.has(ev.pointerId) || !gesture.current) return;
    pointers.current.set(ev.pointerId, toLocal(ev.clientX, ev.clientY));
    const g = gesture.current, pts = [...pointers.current.values()];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    let scale = 1;
    if (pts.length > 1 && g.dist > 0) scale = g.dist / Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const u = g.view.w / size.w, w = g.view.w * scale, h = g.view.h * scale;
    if (!g.moved && (Math.abs(cx - g.cx) + Math.abs(cy - g.cy) > 4 || scale !== 1)) {
      g.moved = true;
      try { (ev.currentTarget as Element).setPointerCapture(ev.pointerId); } catch { /* pointer already released */ }
    }
    // Keep the world point under the gesture's start centre under the current centre.
    const wx = g.view.x + g.cx * u, wy = g.view.y + g.cy * u, nu = w / size.w;
    setView(clampView({ x: wx - cx * nu, y: wy - cy * nu, w, h }));
  };
  const onPointerUp = (ev: ReactPointerEvent) => {
    pointers.current.delete(ev.pointerId);
    if (pointers.current.size) startGesture();
  };
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      if ((ev.target as Element).closest?.('[data-map-overlay]')) return; // let overlays scroll
      if (scrollPageRef.current && !ev.ctrlKey && !ev.metaKey) return; // let the page scroll
      ev.preventDefault();
      cancelAnimationFrame(anim.current);
      const v = viewRef.current, { x: px, y: py } = toLocal(ev.clientX, ev.clientY);
      const u = v.w / el.clientWidth, scale = Math.exp(Math.max(-0.5, Math.min(0.5, ev.deltaY * 0.0015)));
      const wx = v.x + px * u, wy = v.y + py * u, w = v.w * scale, h = v.h * scale, nu = w / el.clientWidth;
      setView(clampView({ x: wx - px * nu, y: wy - py * nu, w, h }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomBy = (f: number) => {
    const v = viewRef.current, cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    animateTo(clampView({ x: cx - v.w * f / 2, y: cy - v.h * f / 2, w: v.w * f, h: v.h * f }));
  };
  const reset = () => animateTo(homeView(size.w / size.h));
  const select = (pin: Pin) => {
    if (gesture.current?.moved) return;
    const current = pin.events.findIndex(e => e.n === selected);
    const pool = pin.events.filter(e => emphasis(e) !== 'past');
    const list = pool.length ? pool : pin.events;
    onSelect(list[(Math.max(current, -1) + 1) % list.length]?.n ?? pin.events[0].n);
  };

  const sel = selected === null ? null : data.byNumber.get(selected) ?? null;
  const routeD = (coords: [number, number][]) => coords.map(([lon, lat], i) => { const [x, y] = project(lon, lat); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('');
  const labelSize = { l: 15, m: 12.5, s: 11 };

  // Layers are memoised so moving through the story only redraws what changed.
  const reachedKey = glowPlaces.map(p => reachedBy(p.reached) ? countAt(p.key) + 1 : 0).join(',') + data.labels.map(l => reachedBy(l.reached) ? 1 : 0).join('');
  const baseLayers = useMemo(() => <>
        <defs>
          <radialGradient id="hmap-glow"><stop offset="0" className="glow-0" /><stop offset=".55" className="glow-1" /><stop offset="1" className="glow-2" /></radialGradient>
          <radialGradient id="hmap-region-glow"><stop offset="0" className="region-glow-0" /><stop offset=".6" className="region-glow-1" /><stop offset="1" className="glow-2" /></radialGradient>
          {/* Region washes stay on land, so a lit region never spills into the sea. */}
          <clipPath id="hmap-land-clip"><path d={LAND} /></clipPath>
          <pattern id="hmap-hatch" width={6 * unit} height={6 * unit} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2={6 * unit} className="hmap-hatch-line" strokeWidth={unit} />
          </pattern>
        </defs>
        <rect className="hmap-sea" x={-WIDTH} y={-HEIGHT} width={WIDTH * 3} height={HEIGHT * 3} />
        {/* Water lines: thin rings following the coast, as on engraved maps. Each ring is a wide coast-coloured
            stroke with a slightly narrower sea-coloured stroke on top; the land drawn after covers the inner half. */}
        <g className="hmap-water" aria-hidden="true">
          {[[6, 0.4]].map(([d, o]) => <g key={d} style={{ opacity: o }}>
            <path className="hmap-water-ring" d={LAND} strokeWidth={2 * d * unit} />
            <path className="hmap-water-gap" d={LAND} strokeWidth={(2 * d - 1.4) * unit} />
          </g>)}
        </g>
        <path className="hmap-land" d={LAND} strokeWidth={1.1 * unit} />
        {/* Terrain from Natural Earth (scripts/build-terrain.py): the shaded relief as soft shadows only, so the land and sea
            keep their own colours, then lakes and rivers. The relief is an image: cheap to move while the map glides. */}
        <g className="hmap-terrain" aria-hidden="true" clipPath="url(#hmap-land-clip)">
          <image className="hmap-relief" href={img(MAP_IMAGES.relief)} x={0} y={0} width={MAP_IMAGES.width} height={MAP_IMAGES.height} preserveAspectRatio="none" />
          <path className="hmap-lake" d={LAKES} strokeWidth={0.8 * unit} />
          <path className="hmap-river" d={RIVERS} strokeWidth={1.1 * unit} />
        </g>
        {/* Graticule every 5° — orientation only. */}
        <g className="hmap-grid" strokeWidth={0.6 * unit}>
          {[30, 35, 40, 45, 50, 55].map(lon => { const [x] = project(lon, 0); return <line key={lon} x1={x} x2={x} y1={0} y2={HEIGHT} />; })}
          {[5, 10, 15, 20, 25, 30, 35].map(lat => { const [, y] = project(0, lat); return <line key={lat} x1={0} x2={WIDTH} y1={y} y2={y} />; })}
        </g>
  </>, [unit]);
  const glowLayer = useMemo(() => <>
        {/* A region the sources say Islam had reached is washed in gold, so the whole territory reads as reached, not
            only its few named places. Powers (Abyssinia, Byzantium, Persia) keep just their gold name. */}
        <g className="hmap-region-glows" aria-hidden="true" clipPath="url(#hmap-land-clip)">
          {data.labels.filter(l => l.kind === 'region' && l.reached !== null).map(l => {
            const [x, y] = project(l.lon, l.lat), deg = REGION_REACH[l.size];
            return <ellipse key={l.id} className={`hmap-glow-region${reachedBy(l.reached) && reachedBy(DELEGATIONS) ? ' is-lit' : ''}`} cx={x} cy={y} rx={deg * K * COS} ry={deg * K} fill="url(#hmap-region-glow)" />;
          })}
        </g>
        <g className="hmap-glows" aria-hidden="true">
          {glowPlaces.map(p => {
            // Brighter and wider where the sources count more Muslims: from a faint glow for a place with no count given
            // up to full strength at 30,000 (the army of Tabuk).
            const [x, y] = project(p.lon, p.lat), c = countAt(p.key), level = c ? Math.min(1, Math.log10(c) / Math.log10(30000)) : 0;
            return <g key={p.key} style={{ opacity: 0.45 + 0.55 * level }}>
              <circle className={`hmap-glow-place${reachedBy(p.reached) ? ' is-lit' : ''}`} cx={x} cy={y} r={Math.max(18, 26 * unit) * (0.85 + 1.1 * level)} fill="url(#hmap-glow)" />
            </g>;
          })}
          {pulses.map(k => { const p = data.places.get(k); if (!p) return null; const [x, y] = project(p.lon, p.lat); return <circle key={`pulse-${k}-${now}`} className="hmap-pulse" cx={x} cy={y} r={30 * unit} strokeWidth={2 * unit} />; })}
        </g>
  </>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reachedKey, pulses, unit]);
  const labelLayer = useMemo(() => <>
        {data.labels.map(l => {
          const [x, y] = project(l.lon, l.lat);
          // A region the sources say Islam had reached is named in gold; its places glow at their own coordinates.
          // Pointing at (or tapping) a region explains what its name meant then: al-Bahrayn was the whole east coast.
          const note = [l.note[locale], reachedBy(l.reached) ? l.reachNote[locale] : ''].filter(Boolean).join(' — ');
          const tip = { key: `label-${l.id}`, x, y: y - labelSize[l.size] * unit, text: note };
          return <text key={l.id} className={`hmap-label hmap-label-${l.kind}${reachedBy(l.reached) ? ' is-reached' : ''}${note ? ' is-explained' : ''}`} x={x} y={y} fontSize={labelSize[l.size] * unit} style={l.rotate ? { rotate: `${l.rotate}deg` } : undefined}
            onPointerEnter={note ? ev => { if (ev.pointerType === 'mouse') setNameTip(tip); } : undefined}
            onPointerLeave={note ? ev => { if (ev.pointerType === 'mouse') setNameTip(null); } : undefined}
            onClick={note ? () => setNameTip(t => t?.key === tip.key ? null : tip) : undefined}>{l.name[locale]}</text>;
        })}
  </>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reachedKey, locale, unit, data]);
  const nameLayer = useMemo(() => <>
        <g className="hmap-names" aria-hidden="true">
          {!quiz && placed.map(l => {
            // A name shown as it was then (Yathrib) explains itself when pointed at or tapped.
            const note = placeNameAt(data, l.key, now, locale) ? data.places.get(l.key)?.nameNote?.[locale] : undefined;
            return <text key={l.key} className={`hmap-name${l.priority >= 1000 ? ' is-selected' : l.strong ? ' is-strong' : ''}${note ? ' is-renamed' : ''}`} x={l.x} y={l.y - 7 * unit} fontSize={l.size}
              onPointerEnter={note ? ev => { if (ev.pointerType === 'mouse') setNameTip({ key: l.key, x: l.x, y: l.y - 7 * unit - l.size, text: note }); } : undefined}
              onPointerLeave={note ? ev => { if (ev.pointerType === 'mouse') setNameTip(null); } : undefined}
              onClick={note ? () => setNameTip(t => t?.key === l.key ? null : { key: l.key, x: l.x, y: l.y - 7 * unit - l.size, text: note }) : undefined}>{l.name}</text>;
          })}
        </g>
  </>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placed, !!quiz, now, locale]);
  // Where the explanation box sits on screen: the SVG point mapped through the view ("slice" centres the overflow).
  const tipAt = nameTip && { left: Math.min(Math.max((nameTip.x - view.x) / unit + (size.w - view.w / unit) / 2, 160), size.w - 160), top: (nameTip.y - view.y) / unit + (size.h - view.h / unit) / 2 };
  const selectRef = useRef(select);
  selectRef.current = select;
  // Pointing at a dot names the place (as it was then) and what happened there.
  const hoverPin = useCallback((key: string | null) => {
    if (!key) { setNameTip(t => (t?.key.startsWith('pin-') ? null : t)); return; }
    const pin = pins.find(p => p.key === key);
    if (!pin) return;
    const name = (placeNameAt(data, key, now, locale) ?? data.places.get(key)?.name[locale]) || pin.name;
    const titles = pin.events.map(e => e.title[locale] || e.title.ar), more = titles.length > 2 ? ` (+${titles.length - 2})` : '';
    setNameTip({ key: `pin-${key}`, x: pin.x, y: pin.y - 10 * unit, text: `${name} — ${titles.slice(0, 2).join(locale === 'ar' ? '؛ ' : '; ')}${more}` });
  }, [pins, data, now, locale, unit]);
  const pickPin = useCallback((key: string) => { const pin = pins.find(p => p.key === key); if (pin) selectRef.current(pin); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pins]);

  return <section className="hmap" aria-label={text.label}>
    <div className={`hmap-frame${scrollPage ? ' is-in-page' : ''}`} ref={frame} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <svg ref={svgRef} className="hmap-svg" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={text.label}>
        {baseLayers}
        {glowLayer}
        {labelLayer}

        {showTrade && data.routes.filter(r => r.kind === 'trade').map(r => <g key={r.id}>
          <path className="hmap-trade" d={routeD(r.coords)} strokeWidth={1.3 * unit} strokeDasharray={`${1 * unit} ${4 * unit}`}><title>{`${r.name[locale]} — ${r.note[locale]}`}</title></path>
          {caravans && !reducedMotion && [0, 1].map(i => <circle key={i} className="hmap-caravan" r={2.6 * unit}>
            <animateMotion dur="22s" begin={`${-i * 11}s`} repeatCount="indefinite" path={routeD(r.coords)} />
          </circle>)}
        </g>)}
        {data.routes.filter(r => r.kind === 'sirah').map(r => {
          const on = activeRoutes.includes(r.id);
          const seen = r.events.some(n => { const e = data.byNumber.get(n); return e && emphasis(e) !== 'hidden'; });
          if (!on && !seen) return null;
          if (walk?.routeId === r.id) {
            const cut = nearestIndex(r.coords, walk.lon, walk.lat);
            return <g key={r.id}>
              <path className="hmap-route" d={routeD(r.coords)} strokeWidth={1.4 * unit} strokeDasharray={`${6 * unit} ${4 * unit}`} />
              <path key={walk.key} className="hmap-route is-on is-drawing" d={routeD(r.coords.slice(0, cut + 1))} strokeWidth={3 * unit} pathLength={1} />
              {(() => { const [sx, sy] = project(walk.lon, walk.lat); return <g className="hmap-walk-stop" transform={`translate(${sx} ${sy})`}>
                <circle r={9 * unit} strokeWidth={1.6 * unit} /><circle className="hmap-walk-dot" r={4 * unit} />
                {walk.name && <text y={-15 * unit} fontSize={14 * unit}>{walk.name}</text>}
              </g>; })()}
            </g>;
          }
          if (on) {
            // The route being told: drawn, its start, end and farthest point (the turn of a round trip) marked and
            // named as they were then, and a dot that travels it so its direction reads. A name the map already shows
            // there is not repeated.
            const d = routeD(r.coords), shown = new Set(placed.map(l => l.key));
            return <g key={`${r.id}-${focusKey}`} className="hmap-route-on">
              <path className="hmap-route is-on is-drawing" d={d} strokeWidth={2.6 * unit} pathLength={1}><title>{`${r.name[locale]} — ${r.note[locale]}`}</title></path>
              {routeMarks(r).map(([lon, lat], i) => {
                const [x, y] = project(lon, lat), place = nearestPlace(data, lon, lat);
                const name = place ? (shown.has(place.key) ? null : placeNameAt(data, place.key, now, locale) ?? place.name[locale]) : nearestStop(data.stops.get(r.id), lon, lat)?.name[locale] ?? null;
                return <g key={i} className="hmap-route-end" transform={`translate(${x} ${y})`}>
                  <circle r={5 * unit} strokeWidth={1.6 * unit} />
                  {name && <text y={-10 * unit} fontSize={13 * unit}>{name}</text>}
                </g>;
              })}
              {!reducedMotion && <circle className="hmap-arc-runner" r={3.2 * unit}><animateMotion dur="2.6s" fill="freeze" path={d} /></circle>}
            </g>;
          }
          return <path key={r.id} className="hmap-route" d={routeD(r.coords)} strokeWidth={1.1 * unit} strokeDasharray={`${6 * unit} ${4 * unit}`}><title>{`${r.name[locale]} — ${r.note[locale]}`}</title></path>;
        })}

        {arcsHere.length > 0 && <g className="hmap-arcs" key={`arcs-${selected}-${focusKey}`}>
          {arcsHere.map((a, i) => {
            const d = arcPath(a), far = a.kind === 'letter' ? a.to : a.from, [fx, fy] = project(far.lon, far.lat);
            return <g key={a.id} className={`hmap-arc is-${a.kind} out-${a.outcome}`} style={{ ['--i' as string]: i }}>
              {/* A dashed line cannot draw itself with its own dashes, so it is revealed through a mask that does. */}
              {a.outcome === 'declined' && <mask id={`arc-reveal-${a.id}`} maskUnits="userSpaceOnUse" x={-WIDTH} y={-HEIGHT} width={WIDTH * 3} height={HEIGHT * 3}>
                <path className="hmap-arc-reveal" d={d} stroke="#fff" strokeWidth={8 * unit} fill="none" pathLength={1} />
              </mask>}
              <path className="hmap-arc-line" d={d} strokeWidth={2 * unit} pathLength={1} mask={a.outcome === 'declined' ? `url(#arc-reveal-${a.id})` : undefined}><title>{`${a.name[locale]} — ${a.summary[locale]}`}</title></path>
              <circle className="hmap-arc-end" cx={fx} cy={fy} r={4.5 * unit} strokeWidth={1.4 * unit} />
              {/* The far end is named (the king, or the people), and pointing at it or tapping it says what came of it. */}
              <text className="hmap-arc-name" x={Math.min(Math.max(fx, (a.end[locale].length * 3.6 + 8) * unit), WIDTH - (a.end[locale].length * 3.6 + 8) * unit)} y={fy + 16 * unit} fontSize={12.5 * unit}
                onPointerEnter={ev => { if (ev.pointerType === 'mouse') setNameTip({ key: a.id, x: fx, y: fy - 6 * unit, text: `${a.name[locale]} — ${a.summary[locale]}` }); }}
                onPointerLeave={ev => { if (ev.pointerType === 'mouse') setNameTip(null); }}
                onClick={() => setNameTip(t => t?.key === a.id ? null : { key: a.id, x: fx, y: fy - 6 * unit, text: `${a.name[locale]} — ${a.summary[locale]}` })}>{a.end[locale]}</text>
              <circle className="hmap-arc-hit" cx={fx} cy={fy} r={14 * unit}
                onPointerEnter={ev => { if (ev.pointerType === 'mouse') setNameTip({ key: a.id, x: fx, y: fy - 6 * unit, text: `${a.name[locale]} — ${a.summary[locale]}` }); }}
                onPointerLeave={ev => { if (ev.pointerType === 'mouse') setNameTip(null); }}
                onClick={() => setNameTip(t => t?.key === a.id ? null : { key: a.id, x: fx, y: fy - 6 * unit, text: `${a.name[locale]} — ${a.summary[locale]}` })} />
              {!reducedMotion && <circle className="hmap-arc-runner" r={3 * unit}><animateMotion dur="2.4s" begin={`${0.6 + i * 0.2}s`} fill="freeze" path={d} /></circle>}
            </g>;
          })}
        </g>}

        {pins.map(pin => <PinMark key={pin.key} id={pin.key} x={pin.x} y={pin.y} emphasis={pin.emphasis} precision={pin.precision} unit={unit} onPick={pickPin} onHover={hoverPin} />)}

        {quiz && <g className="hmap-quiz">
          {quiz.options.map(k => {
            const p = data.places.get(k);
            if (!p) return null;
            const [x, y] = project(p.lon, p.lat);
            const state = quiz.chosen === null ? '' : k === quiz.answer ? ' is-right' : k === quiz.chosen ? ' is-wrong' : ' is-out';
            return <g key={k} className={`hmap-quiz-target${state}`} transform={`translate(${x} ${y})`} role="button" tabIndex={quiz.chosen === null ? 0 : -1}
              aria-label={p.name[locale]} onClick={() => quiz.chosen === null && !gesture.current?.moved && quiz.onPick(k)}
              onKeyDown={ev => { if ((ev.key === 'Enter' || ev.key === ' ') && quiz.chosen === null) { ev.preventDefault(); quiz.onPick(k); } }}>
              <circle className="hmap-quiz-ring" r={16 * unit} strokeWidth={2 * unit} />
              <circle className="hmap-quiz-dot" r={6 * unit} />
              <text className="hmap-quiz-name" y={-22 * unit} fontSize={15 * unit}>{p.name[locale]}</text>
            </g>;
          })}
        </g>}

        {nameLayer}
      </svg>
      <div className="hmap-grain" aria-hidden="true" />
      {nameTip && tipAt && (size.w < 600
        // A small map (phones) cannot hold the box: it opens as a sheet at the bottom of the screen instead.
        ? createPortal(<div className="hmap-name-tip is-sheet" role="note" dir={locale === 'ar' ? 'rtl' : 'ltr'} onClick={() => setNameTip(null)}>{nameTip.text}</div>, document.body)
        : <div className={`hmap-name-tip${tipAt.top < size.h * 0.45 ? ' is-below' : ''}`} role="note" data-map-overlay style={{ left: tipAt.left, top: tipAt.top }} onClick={() => setNameTip(null)}>{nameTip.text}</div>)}
      {children}

      <div className="hmap-controls">
        <button type="button" onClick={() => zoomBy(0.7)} aria-label={text.zoomIn}>+</button>
        <button type="button" onClick={() => zoomBy(1 / 0.7)} aria-label={text.zoomOut}>−</button>
        <button type="button" onClick={reset} aria-label={text.reset}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" /><circle cx="10" cy="10" r="1.6" fill="currentColor" /></svg></button>
      </div>
      <div className="hmap-north" aria-hidden="true"><span>{text.north}</span><svg viewBox="0 0 24 40" fill="none"><path d="M12 3 19 28 12 23 5 28Z" stroke="currentColor" /><path d="m12 3 7 25-7-5Z" fill="currentColor" opacity=".22" /></svg></div>
      {caption && <p className="hmap-caption">{caption}</p>}
      {sel && sel.lat === null && <p className="hmap-nopin">{text.noPin}</p>}
    </div>

    {legend && <ul className="hmap-legend" aria-label={text.legend}>
      <li><i className="lg-dot is-selected" />{text.selected}</li>
      <li><i className="lg-dot" />{text.stage}</li>
      <li><i className="lg-dot is-past" />{text.past}</li>
      <li><i className="lg-approx" />{text.approx}</li>
      <li><i className="lg-route" />{text.route}</li>
      {now !== undefined && <li><i className="lg-glow" />{text.reached}</li>}
      {arcsHere.length > 0 && <>
        <li><i className="lg-arc out-accepted" />{text.arcAccepted}</li>
        <li><i className="lg-arc out-declined" />{text.arcDeclined}</li>
        {arcsHere.some(a => a.outcome === 'honoured' || a.outcome === 'treaty') && <li><i className="lg-arc out-honoured" />{text.arcOther}</li>}
      </>}
      <li><button type="button" className="lg-toggle" aria-pressed={showTrade} onClick={() => setShowTrade(v => !v)}><i className="lg-trade" />{text.trade}</button></li>
    </ul>}
  </section>;
}


/** Small peaks along the mountain line, spaced evenly on screen. */
/** A gentle curve from one end of a letter or delegation to the other, bowing to the same side each time. */
function arcPath(a: MapArc) {
  const [x0, y0] = project(a.from.lon, a.from.lat), [x1, y1] = project(a.to.lon, a.to.lat);
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, k = 0.18;
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}Q${(mx - (y1 - y0) * k).toFixed(1)} ${(my + (x1 - x0) * k).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/** The points of a route worth naming: its start, its end, and its farthest point from the start (so a round trip
 * such as Makkah → al-Ta'if → Makkah names al-Ta'if). Points within about 20 km of one another count once. */
function routeMarks(r: { coords: [number, number][] }) {
  const c = r.coords, first = c[0], last = c[c.length - 1];
  const far = c.reduce((best, p) => ((p[0] - first[0]) ** 2 + (p[1] - first[1]) ** 2 > (best[0] - first[0]) ** 2 + (best[1] - first[1]) ** 2 ? p : best), first);
  const out: [number, number][] = [];
  for (const p of [first, far, last]) if (!out.some(q => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 < 0.04)) out.push(p);
  return out;
}

/** The route stop nearest a point, within about 60 km (for route ends with no place on file, such as Yemen). */
function nearestStop(stops: RouteStop[] | undefined, lon: number, lat: number) {
  let best: RouteStop | null = null, dist = 0.3;
  for (const s of stops ?? []) { const d = (s.lon - lon) ** 2 + (s.lat - lat) ** 2; if (d < dist) { dist = d; best = s; } }
  return best;
}

/** The named place at a route's end, if one lies within about 25 km of it. */
function nearestPlace(data: Sirah, lon: number, lat: number) {
  let best = null as ReturnType<typeof data.places.get> | null, dist = 0.06;
  for (const p of data.places.values()) { const d = (p.lon - lon) ** 2 + (p.lat - lat) ** 2; if (d < dist) { dist = d; best = p; } }
  return best;
}

/** Index of the route point nearest to a place. */
function nearestIndex(coords: [number, number][], lon: number, lat: number) {
  let best = 0, dist = Infinity;
  coords.forEach(([x, y], i) => { const d = (x - lon) ** 2 + (y - lat) ** 2; if (d < dist) { dist = d; best = i; } });
  return best;
}

/** One event pin; redraws only when its own state, place or the zoom changes. */
const PinMark = memo(function PinMark({ id, x, y, emphasis, precision, unit, onPick, onHover }: { id: string; x: number; y: number; emphasis: Emphasis; precision: SirahEvent['precision']; unit: number; onPick: (key: string) => void; onHover: (key: string | null) => void }) {
  const r = (emphasis === 'selected' ? 7 : emphasis === 'active' ? 5 : 3.2) * unit;
  return <g className={`hmap-pin is-${emphasis} prec-${precision}`} transform={`translate(${x} ${y})`}>
    {/* An event the sources place only in an area ("Najd", "the lands of Banu Asad") is drawn as that area, not a point. */}
    {precision === 'region' && emphasis !== 'past' && <circle className={`hmap-region${emphasis === 'selected' ? ' is-on' : ''}`} r={0.8 * 40} strokeWidth={unit} strokeDasharray={`${3 * unit} ${3 * unit}`} />}
    {precision === 'approx' && emphasis !== 'past' && <circle className="hmap-approx" r={r + 5 * unit} strokeWidth={unit} strokeDasharray={`${2 * unit} ${2 * unit}`} />}
    <circle className="hmap-dot" r={r} strokeWidth={1.4 * unit} />
    {emphasis === 'selected' && <circle className="hmap-halo" r={r + 7 * unit} strokeWidth={unit} />}
    <circle className="hmap-hit" r={Math.max(r, 14 * unit)} onClick={() => onPick(id)}
      onPointerEnter={ev => { if (ev.pointerType === 'mouse') onHover(id); }} onPointerLeave={ev => { if (ev.pointerType === 'mouse') onHover(null); }} />
  </g>;
});
