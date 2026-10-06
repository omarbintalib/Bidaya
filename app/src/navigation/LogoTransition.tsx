import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { LOGO, LogoGeometry } from '../components/BrandLogo';
import type { Locale } from '../i18n';
import { navigationCopy } from './routes';

// A centered rectangle inside the logo's central vertical bar is solid ink.
// At this scale every viewport corner falls in that rectangle, including
// extreme portrait/landscape screens. Units are original SVG drawing units.
export function expansionScale(width: number, height: number) {
  return Math.max(width / 99, height / 147) * 1.04;
}
const ease = (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const transform = (width: number, height: number, scale: number) => `translate(${width / 2} ${height / 2}) scale(${scale}) translate(${-LOGO.cx} ${-LOGO.cy})`;

function tween(duration: number, update: (progress: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let frame = 0;
    const start = performance.now();
    const abort = () => { cancelAnimationFrame(frame); reject(new DOMException('Cancelled', 'AbortError')); };
    const tick = (now: number) => {
      if (signal.aborted) return;
      const progress = Math.min(1, (now - start) / duration);
      try { update(progress); } catch (error) { signal.removeEventListener("abort", abort); reject(error); return; }
      if (progress < 1) frame = requestAnimationFrame(tick);
      else { signal.removeEventListener('abort', abort); resolve(); }
    };
    signal.addEventListener('abort', abort, { once: true });
    update(0);
    frame = requestAnimationFrame(tick);
  });
}

export const RECONSTRUCTION_BANDS = [0, 206, 340, 514, 650, 786, 1300, 1407].slice(0, -1).map((x, i) => ({ x, width: [206, 340, 514, 650, 786, 1300, 1407][i] - x })).reverse();
export const reconstructionOpacity = (index: number, elapsed: number) => Math.min(1, Math.max(0, (elapsed - index * 60) / 140));

type Props = { reducedMotion?: boolean; run: number; initial: boolean; locale: Locale; onCovered: () => void; onFinish: () => void };
export default function LogoTransition({ run, initial, locale, reducedMotion, onCovered, onFinish }: Props) {
  const maskId = useId().replace(/:/g, '');
  const svg = useRef<SVGSVGElement>(null);
  const cover = useRef<SVGGElement>(null);
  const loading = useRef<SVGGElement>(null);
  const aperture = useRef<SVGGElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState(initial ? 'loading' : 'cover');
  const emergencyFinish = useRef<(() => void) | null>(null);
  const previousReduced = useRef(reducedMotion);
  useEffect(() => {
    if (reducedMotion && !previousReduced.current) emergencyFinish.current?.();
    previousReduced.current = reducedMotion;
  }, [reducedMotion]);

  useLayoutEffect(() => {
    const controller = new AbortController();
    const reduced = reducedMotion ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    emergencyFinish.current = () => { controller.abort(); onCovered(); onFinish(); };
    let watchdog = 0;
    const size = () => {
      const width = window.innerWidth, height = window.innerHeight;
      svg.current?.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.current?.querySelectorAll('[data-field]').forEach(node => { node.setAttribute('width', String(width)); node.setAttribute('height', String(height)); });
      return { width, height, small: Math.min(220, width * .4) / LOGO.width };
    };
    const place = (node: SVGGElement | null, progress: number) => {
      const { width, height, small } = size();
      node?.setAttribute('transform', transform(width, height, small + (expansionScale(width, height) - small) * ease(progress)));
    };
    async function play() {
      try {
        // A failed browser animation must never leave navigation blocked.
        watchdog = window.setTimeout(() => { if (!controller.signal.aborted) { onCovered(); onFinish(); controller.abort(); } }, 5000);
        setPhase(reduced ? 'crossfade' : initial ? 'loading' : 'cover');
        // Size the opaque overlay before its first paint, then hand off the HTML cover.
        size();
        if (initial) document.getElementById('startup-cover')?.remove();
        if (reduced) {
          if (!initial) await tween(100, t => { if (overlay.current) overlay.current.style.opacity = String(t); }, controller.signal);
          onCovered();
          await tween(120, t => { if (overlay.current) overlay.current.style.opacity = String(1 - t); }, controller.signal);
        } else {
          if (!initial) {
            place(cover.current, 0);
            await tween(600, t => { place(cover.current, t); cover.current?.setAttribute('opacity', String(Math.min(1, t * 8))); }, controller.signal);
          }
          setPhase('loading');
          onCovered();
          const { width, height, small } = size();
          loading.current?.setAttribute('transform', transform(width, height, small));
          const sections = Array.from(loading.current?.querySelectorAll<SVGGElement>('[data-logo-section]') ?? []);
          await tween(600, progress => {
            const viewport = size();
            loading.current?.setAttribute('transform', transform(viewport.width, viewport.height, viewport.small));
            sections.forEach((section, index) => section.setAttribute('opacity', String(reconstructionOpacity(index, progress * 600))));
          }, controller.signal);
          onCovered(); // apply any Back/Forward request received while opaque
          place(aperture.current, 0);
          setPhase('reveal');
          await tween(800, t => place(aperture.current, t), controller.signal);
        }
        onFinish();
      } catch (error) {
        if (!controller.signal.aborted) { console.warn('Transition recovered', error); onCovered(); onFinish(); }
      } finally { window.clearTimeout(watchdog); emergencyFinish.current = null; }
    }
    void play();
    return () => { controller.abort(); window.clearTimeout(watchdog); emergencyFinish.current = null; };
  }, [run, initial, onCovered, onFinish]);

  return <div ref={overlay} className={`logo-transition ${initial ? 'initial-transition' : ''}`} data-phase={phase} role="status" aria-live="polite">
    <span className="sr-only">{navigationCopy[locale].loading}</span>
    <svg ref={svg} width="100%" height="100%" aria-hidden="true">
      <defs>
        {RECONSTRUCTION_BANDS.map((band, i) => <clipPath id={`${maskId}-section-${i}`} key={i}><rect x={band.x} y="0" width={band.width} height={LOGO.height} /></clipPath>)}
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%" style={{ maskType: 'luminance' }}>
        <rect data-field fill="white" />
        <g ref={aperture} color="black"><LogoGeometry /></g>
      </mask></defs>
      <rect className="transition-backdrop" data-field fill="var(--paper)" />
      <g className="transition-cover" ref={cover} color="var(--ink)" opacity="0"><LogoGeometry /></g>
      <rect className="transition-field" data-field fill="var(--ink)" />
      <g className="transition-loading" ref={loading} color="var(--paper)">{RECONSTRUCTION_BANDS.map((_, i) => <g key={i} data-logo-section={i} opacity="0" clipPath={`url(#${maskId}-section-${i})`}><LogoGeometry /></g>)}</g>
      <rect className="transition-reveal" data-field fill="var(--ink)" mask={`url(#${maskId})`} />
    </svg>
  </div>;
}
