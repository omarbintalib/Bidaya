import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Locale } from '../i18n';
import { digits } from '../data/select';
import './mapTour.css';

export const MAP_TOUR_KEY = 'bidaya.map-tour.v1';
const selectors = ['.tb-chapters', '.scrolly-steps .step.is-on', '.scrolly-map .hmap-frame', '.story-timeline', '.ask-bar'];
function targetFor(step: number) {
  return Array.from(document.querySelectorAll<HTMLElement>(selectors[step])).find(node => {
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}
const copy = {
  en: {
    tour: 'Website tour', close: 'Close tour', next: 'Next', back: 'Back', skip: 'Skip', done: 'Done',
    steps: [
      ['Choose a chapter', 'These chapters follow the Prophet’s life in order. Select one to jump to that part of the story.'],
      ['Follow the story', 'Scroll through the cards to follow each event on the map. Press Play to hear a chapter or event, and choose your listening speed.'],
      ['Explore the map', 'Drag to move around, or use + and − to zoom. Select an event marker to read its story; the reset button brings the map back into focus.'],
      ['Move through time', 'Select an event on the timeline or use its arrows to move through the story. Play advances the story automatically; its pace is separate from narration speed.'],
      ['Ask the map', 'Ask a question about the Sirah. The assistant answers with sources and can guide you to related events and people. You can replay this tour anytime from the toolbar.'],
    ],
  },
  ar: {
    tour: 'جولة في الموقع', close: 'إغلاق الجولة', next: 'التالي', back: 'السابق', skip: 'تخطي', done: 'إنهاء',
    steps: [
      ['اختر فصلًا', 'تتبع هذه الفصول مراحل حياة النبي ﷺ بالترتيب. اختر فصلًا للانتقال إلى ذلك الجزء من الحكاية.'],
      ['اتبع الحكاية', 'مرّر بطاقات الأحداث لتتابع مواقعها على الخريطة. اضغط تشغيل للاستماع إلى الفصل أو الحدث، واختر سرعة القراءة التي تناسبك.'],
      ['استكشف الخريطة', 'اسحب الخريطة للتنقل، واستخدم + و− للتكبير والتصغير. اختر علامة حدث لقراءة حكايته، وزر إعادة التركيز للعودة إلى موضعه.'],
      ['تنقّل عبر الزمن', 'اختر حدثًا من الشريط الزمني أو استخدم الأسهم للتنقل في الحكاية. زر التشغيل يتابع الأحداث تلقائيًا، وسرعة المتابعة مستقلة عن سرعة التسجيل الصوتي.'],
      ['اسأل الخريطة', 'اطرح سؤالًا عن السيرة. يجيب المساعد بالمصادر، ويمكنه إرشادك إلى الأحداث والأشخاص المرتبطين بالسؤال. يمكنك إعادة هذه الجولة من شريط الأدوات في أي وقت.'],
    ],
  },
};

type Props = { locale: Locale; ready: boolean; open: boolean; onOpen: () => void; onClose: () => void };
type Box = { left: number; top: number; width: number; height: number };

/** A native modal keeps the map visible while preventing accidental navigation during the tour. */
export default function MapTour({ locale, ready, open, onOpen, onClose }: Props) {
  const text = copy[locale];
  const [offered, setOffered] = useState(() => { try { return localStorage.getItem(MAP_TOUR_KEY) === '1'; } catch { return false; } });
  const [step, setStep] = useState(0);
  const [spot, setSpot] = useState<Box | null>(null);
  const [position, setPosition] = useState({ left: 16, top: 16 });
  const [desktop, setDesktop] = useState(() => window.innerWidth > 1000);
  const dialog = useRef<HTMLDialogElement>(null), card = useRef<HTMLDivElement>(null), launch = useRef<HTMLButtonElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({ onOpen, onClose }); callbacks.current = { onOpen, onClose };
  const titleId = useId(), bodyId = useId();

  useEffect(() => {
    const resize = () => setDesktop(window.innerWidth > 1000);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    if (!desktop || !ready || open || offered) return;
    // Navigation restores heading focus in the first frame; the tour takes focus after that.
    const timer = window.setTimeout(() => { setOffered(true); setStep(0); callbacks.current.onOpen(); }, 80);
    return () => window.clearTimeout(timer);
  }, [desktop, ready, open, offered]);

  useEffect(() => { if (open && (!ready || !desktop)) callbacks.current.onClose(); }, [open, ready, desktop]);

  const dismiss = () => {
    setOffered(true);
    try { localStorage.setItem(MAP_TOUR_KEY, '1'); } catch { /* Dismissal still lasts for this visit. */ }
    callbacks.current.onClose();
  };

  useLayoutEffect(() => {
    if (!open || !desktop) return;
    const node = dialog.current!;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scroll = { top: window.scrollY, left: window.scrollX };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    node.showModal();
    next.current?.focus({ preventScroll: true });
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      window.scrollTo({ ...scroll, behavior: 'instant' });
      const target = previousFocus?.isConnected && !previousFocus.closest('[inert]') ? previousFocus : launch.current;
      target?.focus({ preventScroll: true });
    };
  }, [open, desktop]);

  useLayoutEffect(() => {
    if (!open || !desktop) return;
    const target = targetFor(step);
    // Freeze story selection in the parent before scrolling any target into view.
    target?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    next.current?.focus({ preventScroll: true });
    let frame = 0;
    const measure = () => {
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const r = targetFor(step)?.getBoundingClientRect();
      const timeline = step === 2 ? document.querySelector('.scrolly-map .story-timeline')?.getBoundingClientRect() : null;
      // The timeline overlays the canvas; end the map spotlight just above that overlay.
      const bottom = Math.min(r ? r.bottom + 6 : 8, timeline && timeline.height > 0 ? timeline.top - 4 : Infinity);
      const left = Math.max(8, r ? r.left - 6 : 8), top = Math.max(8, r ? r.top - 6 : 8);
      const box = r && r.width > 0 && r.height > 0 ? {
        left, top, width: Math.max(0, Math.min(vw - 8, r.right + 6) - left),
        height: Math.max(0, Math.min(vh - 8, bottom) - top),
      } : null;
      setSpot(box && box.width && box.height ? box : null);
      const cw = card.current?.offsetWidth ?? Math.min(380, vw - 32), ch = card.current?.offsetHeight ?? 280;
      let x = (vw - cw) / 2, y = (vh - ch) / 2;
      if (box) {
        if (vw > 700 && box.left + box.width + cw + 32 <= vw) { x = box.left + box.width + 16; y = box.top; }
        else if (vw > 700 && box.left >= cw + 32) { x = box.left - cw - 16; y = box.top; }
        else if (box.top >= ch + 32) { y = box.top - ch - 16; }
        else { y = box.top + box.height + 16; }
      }
      setPosition({ left: Math.max(16, Math.min(vw - cw - 16, x)), top: Math.max(16, Math.min(vh - ch - 16, y)) });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    const observer = new ResizeObserver(schedule);
    if (target) observer.observe(target);
    const timeline = step === 2 ? document.querySelector('.scrolly-map .story-timeline') : null;
    if (timeline) observer.observe(timeline);
    if (card.current) observer.observe(card.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, [open, step, locale, desktop]);

  return <>
    {desktop && <button ref={launch} type="button" className="tb-btn tb-tour" disabled={!ready} aria-label={text.tour} aria-haspopup="dialog" onClick={() => { setOffered(true); setStep(0); callbacks.current.onOpen(); }} title={text.tour}>
      <span aria-hidden="true">?</span><span className="tb-long">{locale === 'ar' ? 'جولة' : 'Tour'}</span><span className="sr-only">{text.tour}</span>
    </button>}
    {desktop && open && createPortal(<dialog ref={dialog} className="map-tour" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale}
      onCancel={event => { event.preventDefault(); dismiss(); }} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
        if (event.key !== 'Tab') return;
        const buttons = Array.from(card.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      {spot ? <div className="map-tour-spot" aria-hidden="true" style={spot} /> : <div className="map-tour-shade" aria-hidden="true" />}
      <div ref={card} className="map-tour-card" style={position}>
        <p className="map-tour-count">{text.tour} · {digits(step + 1, locale)} / {digits(text.steps.length, locale)}</p>
        <button type="button" className="map-tour-close" aria-label={text.close} onClick={dismiss}>×</button>
        <div aria-live="polite" aria-atomic="true"><h2 id={titleId}>{text.steps[step][0]}</h2><p id={bodyId}>{text.steps[step][1]}</p></div>
        <div className="map-tour-actions">
          <button type="button" className="btn-quiet" onClick={dismiss}>{text.skip}</button>
          <button type="button" className="btn-quiet" disabled={step === 0} onClick={() => setStep(s => s - 1)}>{text.back}</button>
          <button ref={next} type="button" className="btn-primary" onClick={() => step === text.steps.length - 1 ? dismiss() : setStep(s => s + 1)}>{step === text.steps.length - 1 ? text.done : text.next}</button>
        </div>
      </div>
    </dialog>, document.body)}
  </>;
}
