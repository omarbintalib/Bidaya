import { useEffect, useRef } from 'react';

/** Decorative route drawing; no geographical information is encoded in this ornament. */
export function HeroCartography() {
  return <svg className="hero-cartography" viewBox="0 0 1000 150" fill="none" aria-hidden="true">
    <path className="hero-route" pathLength="1" d="M40 110C200 15 285 145 460 80S700 25 960 96" />
    <g className="hero-waypoints"><circle cx="40" cy="110" r="5" /><circle cx="460" cy="80" r="4" /><circle cx="960" cy="96" r="5" /></g>
    <circle className="hero-traveller" r="3.5" />
  </svg>;
}

export function LandingProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = ref.current;
    const page = bar?.closest<HTMLElement>('.landing-page');
    if (!bar || !page) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const extent = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty('--landing-progress', String(extent > 0 ? Math.min(1, Math.max(0, window.scrollY / extent)) : 0));
    };
    const schedule = () => { if (!frame && !document.hidden) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    observer?.observe(page);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);
  return <div ref={ref} className="landing-progress" aria-hidden="true" />;
}
