import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useAccessibility } from '../accessibility/AccessibilityProvider';
import { connectWaypoints } from './waypointGeometry';
import type { Locale } from '../i18n';
import { navigationCopy, routes, type PageId } from './routes';

export function WaypointSymbol() {
  return <svg viewBox="0 0 48 20" fill="none" aria-hidden="true"><path d="M6 14C17 14 18 6 28 6h14" stroke="currentColor" /><circle cx="6" cy="14" r="3" fill="var(--paper)" stroke="currentColor" /><circle cx="28" cy="6" r="2" fill="currentColor" /><circle cx="42" cy="6" r="3" fill="var(--paper)" stroke="currentColor" /></svg>;
}

type Props = { locale: Locale; page: PageId; busy: boolean; trigger: RefObject<HTMLButtonElement | null>; onClose: () => void; onNavigate: (page: PageId) => void };
export default function WaypointMenu({ locale, page, busy, trigger, onClose, onNavigate }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const routeRef = useRef<HTMLElement>(null);
  const [geometry, setGeometry] = useState({ width: 1, height: 1, paths: [] as string[] });
  const { preferences } = useAccessibility();
  useLayoutEffect(() => {
    const route = routeRef.current;
    if (!route) return;
    let frame = 0;
    let disposed = false;
    const measure = () => {
      const bounds = route.getBoundingClientRect();
      const dots = Array.from(route.querySelectorAll('.waypoint-dot')).map(dot => {
        const box = dot.getBoundingClientRect();
        return { x: box.left - bounds.left + box.width / 2, y: box.top - bounds.top + box.height / 2, radius: box.width / 2 };
      });
      if (!bounds.width || dots.length < 2) return;
      const vertical = window.matchMedia('(max-width: 700px)').matches;
      const paths = dots.slice(0, -1).map((dot, i) => connectWaypoints(dot, dots[i + 1], vertical, (i % 2 ? -1 : 1) * (locale === 'ar' ? -1 : 1)).path);
      setGeometry(old => old.width === bounds.width && old.height === bounds.height && old.paths.join() === paths.join() ? old : { width: bounds.width, height: bounds.height, paths });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(route);
    route.querySelectorAll('.waypoint, .waypoint-dot').forEach(node => observer.observe(node));
    window.addEventListener('resize', schedule);
    document.fonts?.addEventListener('loadingdone', schedule);
    void document.fonts?.ready.then(() => { if (!disposed) schedule(); });
    measure();
    return () => { disposed = true; observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); document.fonts?.removeEventListener('loadingdone', schedule); };
  }, [locale, preferences]);
  const restore = useRef(!busy);
  restore.current = !busy;
  const text = navigationCopy[locale];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>(window.matchMedia('(max-width: 700px)').matches ? '.menu-close' : '[aria-current="page"]')?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      if (restore.current) trigger.current?.focus({ preventScroll: true });
    };
  }, [trigger]);

  return <div className="waypoint-backdrop" dir={locale === 'ar' ? 'rtl' : 'ltr'} inert={busy} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} className="waypoint-menu" role="dialog" aria-modal="true" aria-labelledby="destination-title" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const items = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button, a[href]'));
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <button className="menu-close" aria-label={text.close} onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" /></svg></button>
      <p className="menu-eyebrow">{locale === 'ar' ? 'المكان · الزمان · الحكاية' : 'PLACE · TIME · STORY'}</p>
      <h2 id="destination-title">{text.choose}</h2>
      <nav ref={routeRef} className="waypoint-route" aria-label={text.choose} style={{ ['--stops' as string]: routes.length }}>
        <svg className="route-line" viewBox={`0 0 ${geometry.width} ${geometry.height}`} width={geometry.width} height={geometry.height} fill="none" aria-hidden="true">{geometry.paths.map((path, i) => <path key={i} pathLength="1" d={path} />)}</svg>
        {routes.map(route => <a key={route.id} className="waypoint" href={route.path} aria-current={page === route.id ? 'page' : undefined} onClick={event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault(); onNavigate(route.id);
        }}>
          <span className="waypoint-number"><span className="waypoint-chapter">{text.chapter}</span> <b>{route.number}</b></span>
          <span className="waypoint-dot" aria-hidden="true"><i /></span>
          <span className="waypoint-label"><strong>{route[locale].title}</strong><span>{route[locale].subtitle}</span></span>
        </a>)}
      </nav>
      <div className="menu-footnote"><WaypointSymbol /><span>{text.footnote}</span></div>
    </div>
  </div>;
}
