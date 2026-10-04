import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { LAND } from '../data/land';
import type { Sirah, SirahEvent } from '../data/types';
import type { Locale } from '../i18n';
import { mapCopy } from './copy';
import { centerOn, clampView, fit, HEIGHT, homeView, project, WIDTH, type View } from './projection';
import './map.css';

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
  /** Content drawn over the map (e.g. the story card). */
  children?: ReactNode;
  /** Hide the legend under the map. */
  legend?: boolean;
  /** Chapter question: these places become large tap targets; after an answer, the right one is marked. */
  quiz?: { options: string[]; answer: string; chosen: string | null; onPick: (key: string) => void } | null;
  /** Route walk: draw the route up to this stop and fly to it. */
  walk?: { routeId: string; lat: number; lon: number; key: string } | null;
  /** A place to fly to instead of the selected event (e.g. the whole map for the summary). */
  overview?: boolean;
  /** Caravans moving along the trade routes (the Makkan chapters). */
  caravans?: boolean;
  /** In a scrolling page the wheel scrolls; the map zooms with Ctrl/⌘ + wheel, pinch or the buttons. */
  scrollPage?: boolean;
}

// Decorative and approximate: the line of the Sarawat / Hijaz mountains.
const MOUNTAINS: [number, number][] = [[35.6, 28.0], [36.9, 26.5], [38.3, 25.0], [39.3, 23.5], [40.1, 22.0], [41.3, 20.0], [42.5, 18.3], [43.4, 16.5], [43.9, 15.0]];


interface PlaceLabel { key: string; x: number; y: number; name: string; priority: number; strong: boolean }

interface Pin { key: string; x: number; y: number; events: SirahEvent[]; emphasis: Emphasis; precision: SirahEvent['precision']; name: string }

const RANK: Record<Emphasis, number> = { hidden: 0, past: 1, active: 2, selected: 3 };

export default function HistoricMap({ data, locale, emphasis, selected, activeRoutes = [], onSelect, reducedMotion, focusKey, caption, now, inset = 0, children, legend = true, quiz = null, walk = null, overview = false, caravans = false, scrollPage = false }: Props) {
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
      svgRef.current?.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
      if (t < 1) anim.current = requestAnimationFrame(tick);
      else setView(target);
    };
    anim.current = requestAnimationFrame(tick);
  }, [reducedMotion]);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // Follow the selected event when the caller asks.
  useEffect(() => {
    if (focusKey === undefined) return;
    if (overview) { animateTo(homeView(size.w / size.h)); return; }
    if (quiz) {
      // Fit every answer choice in view.
      const pts = quiz.options.map(k => data.places.get(k)).filter(p => p !== undefined);
      if (pts.length) {
        const lons = pts.map(p => p.lon), lats = pts.map(p => p.lat);
        // With a panel over the inline-start side, fit the choices into the part of the map left uncovered.
        const W = frame.current?.clientWidth || size.w, cover = Math.min(inset, W * 0.6);
        const v = fit(Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats), (W - cover) / W * size.w / size.h, 0.3);
        const w = v.w * W / (W - cover);
        animateTo(clampView({ ...v, w, x: locale === 'ar' ? v.x : v.x - (w - v.w) }));
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
    const W = el?.clientWidth || 800, u = v.w / W, rtl = locale === 'ar';
    const cover = Math.min(inset, W * 0.6) * u;           // map units hidden under the overlay
    const left = rtl ? v.x : v.x + cover, right = rtl ? v.x + v.w - cover : v.x + v.w;
    const mx = (right - left) * 0.15, my = v.h * 0.15;
    const inside = x > left + mx && x < right - mx && y > v.y + my && y < v.y + v.h - my;
    // Fly closer when the whole peninsula is in view, so the story moves place to place.
    const w = walk ? 230 : quizCenter ? 330 : v.w > 480 ? 400 : v.w;
    if (!inside || w !== v.w) {
      const next = centerOn(v, target.lon, target.lat, w), tu = next.w / W;
      animateTo(clampView({ ...next, x: next.x + (rtl ? 1 : -1) * Math.min(inset, W * 0.6) / 2 * tu }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, selected, data, animateTo, inset, locale, overview, walk?.key, quiz?.options.join()]);

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

  const pins = useMemo(() => {
    const groups = new Map<string, Pin>();
    for (const e of data.events) {
      if (e.lat === null || e.lon === null) continue;
      const em = emphasis(e);
      if (em === 'hidden') continue;
      const key = e.place ?? `${e.lat},${e.lon}`;
      const [x, y] = project(e.lon, e.lat);
      const pin = groups.get(key);
      if (!pin) groups.set(key, { key, x, y, events: [e], emphasis: em, precision: e.precision, name: e.placeName[locale] });
      else {
        pin.events.push(e);
        if (RANK[em] > RANK[pin.emphasis]) { pin.emphasis = em; pin.precision = e.precision; }
      }
    }
    return [...groups.values()].sort((a, b) => RANK[a.emphasis] - RANK[b.emphasis]);
  }, [data, emphasis, locale]);

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
    for (const p of data.places.values()) if (p.events > 0) add(p.key, p.lon, p.lat, p.name[locale], Math.min(p.events, 20) + (reachedBy(p.reached) ? 120 : 0), reachedBy(p.reached));
    for (const pin of pins) {
      const pl = pin.events[0];
      if (pin.emphasis === 'past') continue;
      add(pin.key, pl.lon!, pl.lat!, data.places.get(pin.key)?.name[locale] ?? pin.name, pin.emphasis === 'selected' ? 1000 : 100, true);
    }
    return [...cand.values()].sort((a, b) => b.priority - a.priority);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, pins, locale, now]);
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
  const reachedKey = glowPlaces.map(p => reachedBy(p.reached) ? 1 : 0).join('') + data.labels.map(l => reachedBy(l.reached) ? 1 : 0).join('');
  const baseLayers = useMemo(() => <>
        <defs>
          <radialGradient id="hmap-glow"><stop offset="0" className="glow-0" /><stop offset=".55" className="glow-1" /><stop offset="1" className="glow-2" /></radialGradient>
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
        <g className="hmap-terrain" aria-hidden="true">
          <path className="hmap-mountains" d={mountainPath(unit)} strokeWidth={1.1 * unit} />
        </g>
        {/* Graticule every 5° — orientation only. */}
        <g className="hmap-grid" strokeWidth={0.6 * unit}>
          {[35, 40, 45, 50].map(lon => { const [x] = project(lon, 0); return <line key={lon} x1={x} x2={x} y1={0} y2={HEIGHT} />; })}
          {[15, 20, 25, 30].map(lat => { const [, y] = project(0, lat); return <line key={lat} x1={0} x2={WIDTH} y1={y} y2={y} />; })}
        </g>
  </>, [unit]);
  const glowLayer = useMemo(() => <>
        <g className="hmap-glows" aria-hidden="true">
          {glowPlaces.map(p => { const [x, y] = project(p.lon, p.lat); return <circle key={p.key} className={`hmap-glow-place${reachedBy(p.reached) ? ' is-lit' : ''}`} cx={x} cy={y} r={Math.max(18, 26 * unit)} fill="url(#hmap-glow)" />; })}
          {pulses.map(k => { const p = data.places.get(k); if (!p) return null; const [x, y] = project(p.lon, p.lat); return <circle key={`pulse-${k}-${now}`} className="hmap-pulse" cx={x} cy={y} r={30 * unit} strokeWidth={2 * unit} />; })}
        </g>
  </>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reachedKey, pulses, unit]);
  const labelLayer = useMemo(() => <>
        {data.labels.map(l => {
          const [x, y] = project(l.lon, l.lat);
          // A region the sources say Islam had reached is named in gold; its places glow at their own coordinates.
          return <text key={l.id} className={`hmap-label hmap-label-${l.kind}${reachedBy(l.reached) ? ' is-reached' : ''}`} x={x} y={y} fontSize={labelSize[l.size] * unit} transform={l.rotate ? `rotate(${l.rotate} ${x} ${y})` : undefined}>
            <title>{reachedBy(l.reached) && l.reachNote ? `${l.note} — ${l.reachNote}` : l.note}</title>{l.name[locale]}
          </text>;
        })}
  </>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reachedKey, locale, unit, data]);
  const nameLayer = useMemo(() => <>
        <g className="hmap-names" aria-hidden="true">
          {!quiz && placed.map(l => <text key={l.key} className={`hmap-name${l.priority >= 1000 ? ' is-selected' : l.strong ? ' is-strong' : ''}`} x={l.x} y={l.y - 7 * unit} fontSize={l.size}>{l.name}</text>)}
        </g>
  </>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placed, !!quiz]);
  const selectRef = useRef(select);
  selectRef.current = select;
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
            </g>;
          }
          if (on) return <path key={`${r.id}-${focusKey}`} className="hmap-route is-on is-drawing" d={routeD(r.coords)} strokeWidth={2.6 * unit} pathLength={1}><title>{`${r.name[locale]} — ${r.note[locale]}`}</title></path>;
          return <path key={r.id} className="hmap-route" d={routeD(r.coords)} strokeWidth={1.1 * unit} strokeDasharray={`${6 * unit} ${4 * unit}`}><title>{`${r.name[locale]} — ${r.note[locale]}`}</title></path>;
        })}

        {pins.map(pin => <PinMark key={pin.key} id={pin.key} x={pin.x} y={pin.y} emphasis={pin.emphasis} precision={pin.precision} unit={unit} onPick={pickPin} />)}

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
      <li><button type="button" className="lg-toggle" aria-pressed={showTrade} onClick={() => setShowTrade(v => !v)}><i className="lg-trade" />{text.trade}</button></li>
    </ul>}
  </section>;
}


/** Small peaks along the mountain line, spaced evenly on screen. */
function mountainPath(unit: number) {
  let d = '';
  const step = Math.max(14, 22 * unit), size = Math.max(4, 6 * unit);
  for (let i = 0; i < MOUNTAINS.length - 1; i++) {
    const [ax, ay] = project(...MOUNTAINS[i]), [bx, by] = project(...MOUNTAINS[i + 1]);
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.floor(len / step));
    for (let j = 0; j < n; j++) {
      const t = j / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      d += `M${(x - size).toFixed(1)} ${(y + size * 0.6).toFixed(1)}L${x.toFixed(1)} ${(y - size * 0.6).toFixed(1)}L${(x + size).toFixed(1)} ${(y + size * 0.6).toFixed(1)}`;
    }
  }
  return d;
}

/** Index of the route point nearest to a place. */
function nearestIndex(coords: [number, number][], lon: number, lat: number) {
  let best = 0, dist = Infinity;
  coords.forEach(([x, y], i) => { const d = (x - lon) ** 2 + (y - lat) ** 2; if (d < dist) { dist = d; best = i; } });
  return best;
}

/** One event pin; redraws only when its own state, place or the zoom changes. */
const PinMark = memo(function PinMark({ id, x, y, emphasis, precision, unit, onPick }: { id: string; x: number; y: number; emphasis: Emphasis; precision: SirahEvent['precision']; unit: number; onPick: (key: string) => void }) {
  const r = (emphasis === 'selected' ? 7 : emphasis === 'active' ? 5 : 3.2) * unit;
  return <g className={`hmap-pin is-${emphasis} prec-${precision}`} transform={`translate(${x} ${y})`}>
    {precision === 'region' && emphasis === 'selected' && <circle className="hmap-region" r={0.8 * 40} strokeWidth={unit} strokeDasharray={`${3 * unit} ${3 * unit}`} />}
    {precision === 'approx' && emphasis !== 'past' && <circle className="hmap-approx" r={r + 5 * unit} strokeWidth={unit} strokeDasharray={`${2 * unit} ${2 * unit}`} />}
    <circle className="hmap-dot" r={r} strokeWidth={1.4 * unit} />
    {emphasis === 'selected' && <circle className="hmap-halo" r={r + 7 * unit} strokeWidth={unit} />}
    <circle className="hmap-hit" r={Math.max(r, 14 * unit)} onClick={() => onPick(id)} />
  </g>;
});
