import { useEffect, useRef, useState } from 'react';
import { useAccessibility } from '../accessibility/AccessibilityProvider';

export default function FlippingBook() {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const { reducedMotion } = useAccessibility();
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return <span className="landing-source-mark" ref={ref} aria-hidden="true"><img src={`/images/landing/book-flip.${visible && !reducedMotion ? 'gif' : 'png'}`} width="96" height="96" alt="" /></span>;
}
