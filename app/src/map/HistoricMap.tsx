import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { LAND } from '../data/land';
import type { Sirah, SirahEvent } from '../data/types';
import type { Locale } from '../i18n';
import { mapCopy } from './copy';
import { centerOn, clampView, HEIGHT, homeView, project, WIDTH, type View } from './projection';
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
}

interface Pin { key: string; x: number; y: number; events: SirahEvent[]; emphasis: Emphasis; precision: SirahEvent['precision']; name: string }

const RANK: Record<Emphasis, number> = { hidden: 0, past: 1, active: 2, selected: 3 };

export default function HistoricMap({ data, locale, emphasis, selected, activeRoutes = [], onSelect, reducedMotion, focusKey, caption }: Props) {
  const text = mapCopy[locale];
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>(() => homeView(4 / 3));
  const viewRef = useRef(view);
  viewRef.current = view;
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
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / D), k = ease(t);
      setView({ x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k, w: from.w + (target.w - from.w) * k, h: from.h + (target.h - from.h) * k });
      if (t < 1) anim.current = requestAnimationFrame(tick);
    };
    anim.current = requestAnimationFrame(tick);
  }, [reducedMotion]);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // Follow the selected event when the caller asks.
  useEffect(() => {
    if (focusKey === undefined || selected === null) return;
    const e = data.byNumber.get(selected);
    if (!e || e.lat === null || e.lon === null) return;
    const v = viewRef.current, [x, y] = project(e.lon, e.lat);
    const margin = 0.18;
    const inside = x > v.x + v.w * margin && x < v.x + v.w * (1 - margin) && y > v.y + v.h * margin && y < v.y + v.h * (1 - margin);
    if (!inside) animateTo(centerOn(v, e.lon, e.lat));
  }, [focusKey, selected, data, animateTo]);

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
    if ((ev.target as Element).closest('button, a')) return;
    cancelAnimationFrame(anim.current);
    pointers.current.set(ev.pointerId, toLocal(ev.clientX, ev.clientY));
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
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
    if (Math.abs(cx - g.cx) + Math.abs(cy - g.cy) > 4 || scale !== 1) g.moved = true;
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
  const zoomedOut = view.w > 420;

  return <section className="hmap" aria-label={text.label}>
    <div className="hmap-frame" ref={frame} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <svg className="hmap-svg" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={text.label}>
        <defs>
          <pattern id="hmap-hatch" width={6 * unit} height={6 * unit} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2={6 * unit} className="hmap-hatch-line" strokeWidth={unit} />
          </pattern>
        </defs>
        <rect className="hmap-sea" x={-WIDTH} y={-HEIGHT} width={WIDTH * 3} height={HEIGHT * 3} />
        <path className="hmap-land" d={LAND} strokeWidth={1.1 * unit} />
        {/* Graticule every 5° — orientation only. */}
        <g className="hmap-grid" strokeWidth={0.6 * unit}>
          {[35, 40, 45, 50].map(lon => { const [x] = project(lon, 0); return <line key={lon} x1={x} x2={x} y1={0} y2={HEIGHT} />; })}
          {[15, 20, 25, 30].map(lat => { const [, y] = project(0, lat); return <line key={lat} x1={0} x2={WIDTH} y1={y} y2={y} />; })}
        </g>

        {data.labels.map(l => {
          const [x, y] = project(l.lon, l.lat);
          return <text key={l.id} className={`hmap-label hmap-label-${l.kind}`} x={x} y={y} fontSize={labelSize[l.size] * unit} transform={l.rotate ? `rotate(${l.rotate} ${x} ${y})` : undefined}>
            <title>{l.note}</title>{l.name[locale]}
          </text>;
        })}

        {showTrade && data.routes.filter(r => r.kind === 'trade').map(r => <path key={r.id} className="hmap-trade" d={routeD(r.coords)} strokeWidth={1.3 * unit} strokeDasharray={`${1 * unit} ${4 * unit}`}><title>{`${r.name[locale]} — ${r.note[locale]}`}</title></path>)}
        {data.routes.filter(r => r.kind === 'sirah').map(r => {
          const on = activeRoutes.includes(r.id);
          const seen = r.events.some(n => { const e = data.byNumber.get(n); return e && emphasis(e) !== 'hidden'; });
          if (!on && !seen) return null;
          return <path key={r.id} className={`hmap-route${on ? ' is-on' : ''}`} d={routeD(r.coords)} strokeWidth={(on ? 2.4 : 1.1) * unit} strokeDasharray={`${6 * unit} ${4 * unit}`}><title>{`${r.name[locale]} — ${r.note[locale]}`}</title></path>;
        })}

        {pins.map(pin => {
          const r = (pin.emphasis === 'selected' ? 7 : pin.emphasis === 'active' ? 5 : 3.2) * unit;
          const many = pin.events.length > 1 && pin.emphasis !== 'past';
          return <g key={pin.key} className={`hmap-pin is-${pin.emphasis} prec-${pin.precision}`} transform={`translate(${pin.x} ${pin.y})`}>
            {pin.precision === 'region' && pin.emphasis !== 'past' && <circle className="hmap-region" r={0.8 * 40} />}
            {pin.precision === 'approx' && pin.emphasis !== 'past' && <circle className="hmap-approx" r={r + 5 * unit} strokeWidth={unit} strokeDasharray={`${2 * unit} ${2 * unit}`} />}
            <circle className="hmap-dot" r={r} strokeWidth={1.4 * unit} />
            {pin.emphasis === 'selected' && <circle className="hmap-halo" r={r + 7 * unit} strokeWidth={unit} />}
            {(pin.emphasis === 'selected' || (pin.emphasis === 'active' && !zoomedOut)) && <text className="hmap-place" y={-(r + 6 * unit)} fontSize={(pin.emphasis === 'selected' ? 13 : 11) * unit}>{pin.name}{many ? ` · ${pin.events.length}` : ''}</text>}
            <circle className="hmap-hit" r={Math.max(r, 14 * unit)} onClick={() => select(pin)} />
          </g>;
        })}
      </svg>

      <div className="hmap-controls">
        <button type="button" onClick={() => zoomBy(0.7)} aria-label={text.zoomIn}>+</button>
        <button type="button" onClick={() => zoomBy(1 / 0.7)} aria-label={text.zoomOut}>−</button>
        <button type="button" onClick={reset} aria-label={text.reset}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" /><circle cx="10" cy="10" r="1.6" fill="currentColor" /></svg></button>
      </div>
      <div className="hmap-north" aria-hidden="true"><span>{text.north}</span><svg viewBox="0 0 24 40" fill="none"><path d="M12 3 19 28 12 23 5 28Z" stroke="currentColor" /><path d="m12 3 7 25-7-5Z" fill="currentColor" opacity=".22" /></svg></div>
      {caption && <p className="hmap-caption">{caption}</p>}
      {sel && sel.lat === null && <p className="hmap-nopin">{text.noPin}</p>}
    </div>

    <ul className="hmap-legend" aria-label={text.legend}>
      <li><i className="lg-dot is-selected" />{text.selected}</li>
      <li><i className="lg-dot" />{text.stage}</li>
      <li><i className="lg-dot is-past" />{text.past}</li>
      <li><i className="lg-approx" />{text.approx}</li>
      <li><i className="lg-route" />{text.route}</li>
      <li><button type="button" className="lg-toggle" aria-pressed={showTrade} onClick={() => setShowTrade(v => !v)}><i className="lg-trade" />{text.trade}</button></li>
    </ul>
  </section>;
}
