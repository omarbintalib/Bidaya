import { useEffect, useRef, useState } from 'react';
import { useAccessibility } from '../accessibility/AccessibilityProvider';

export default function FlippingBook() {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [finished, setFinished] = useState(false);
  const [started, setStarted] = useState(false);
  const { reducedMotion } = useAccessibility();
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (visible && !reducedMotion) setStarted(true);
  }, [visible, reducedMotion]);
  useEffect(() => {
    if (!started || finished) return;
    // Three 2.6-second flips, once per visit to the landing page.
    const timer = window.setTimeout(() => setFinished(true), 7800);
    return () => window.clearTimeout(timer);
  }, [started, finished]);
  return <span className="landing-source-mark" ref={ref} aria-hidden="true"><img src={`/images/landing/book-flip.${visible && !reducedMotion && !finished ? 'gif' : 'png'}`} width="96" height="96" alt="" onError={event => { event.currentTarget.hidden = true; }} /></span>;
}
