import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import type { Locale } from '../i18n';
import { useAccessibility, type Preferences } from './AccessibilityProvider';
import PreferenceSelect from './PreferenceSelect';

export const accessCopy = {
  ar: { title: 'إمكانية الوصول', open: 'فتح إعدادات إمكانية الوصول', close: 'إغلاق إعدادات إمكانية الوصول', intro: 'اضبط القراءة بما يناسبك.', textSize: 'حجم النص', lineSpacing: 'تباعد الأسطر', characterSpacing: 'تباعد الكلمات', contrast: 'ألوان العرض', font: 'خط القراءة', motion: 'الحركة', standard: 'قياسي', spacious: 'واسع', brand: 'ألوان الموقع', light: 'تباين عالٍ — فاتح', dark: 'تباين عالٍ — داكن', saudi: 'الخط السعودي', plex: 'IBM Plex — واضح للقراءة', system: 'اتباع إعداد الجهاز', reduced: 'تقليل الحركة', links: 'تمييز الروابط', focus: 'تقوية مؤشر التركيز', reset: 'إعادة الإعدادات الافتراضية', saved: 'تُحفظ تفضيلاتك في هذا المتصفح.', resetDone: 'أُعيدت الإعدادات الافتراضية.' },
  en: { title: 'Accessibility', open: 'Open accessibility settings', close: 'Close accessibility settings', intro: 'Make reading comfortable for you.', textSize: 'Text size', lineSpacing: 'Line spacing', characterSpacing: 'Letter spacing', contrast: 'Display colors', font: 'Reading font', motion: 'Motion', standard: 'Standard', spacious: 'Spacious', brand: 'Brand colors', light: 'High contrast — light', dark: 'High contrast — dark', saudi: 'Saudi', plex: 'IBM Plex — readable', system: 'Follow device settings', reduced: 'Reduce motion', links: 'Highlight links', focus: 'Stronger focus indicators', reset: 'Reset all settings', saved: 'Preferences are saved in this browser.', resetDone: 'Default settings restored.' },
};

export function AccessibilityLauncher({ locale, open, buttonRef, onClick }: { locale: Locale; open: boolean; buttonRef: RefObject<HTMLButtonElement | null>; onClick: () => void }) {
  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    let frame = 0;
    const measure = () => {
      const viewport = window.visualViewport;
      const bottom = (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0);
      const box = button.getBoundingClientRect();
      const baseTop = bottom - 16 - box.height;
      let top = baseTop;
      const blockers = Array.from(document.querySelectorAll<HTMLElement>('.mo-actor, .mo-reset, .mo-cancel')).filter(node => {
        const style = getComputedStyle(node);
        return style.visibility !== 'hidden' && Number(style.opacity) > .1 && !node.closest('[inert]');
      }).map(node => node.getBoundingClientRect()).filter(rect => rect.right > box.left - 12 && rect.left < box.right + 12);
      for (let i = 0; i < blockers.length; i++) {
        const collision = blockers.find(rect => top + box.height > rect.top - 12 && top < rect.bottom + 12);
        if (!collision) break;
        top = collision.top - box.height - 12;
      }
      const lift = Math.max(0, baseTop - Math.max(16, top));
      const value = `${Math.round(lift)}px`;
      if (button.style.getPropertyValue('--launcher-lift') !== value) button.style.setProperty('--launcher-lift', value);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    const root = document.querySelector('.mo-root');
    if (root) { observer.observe(root); mutations.observe(root, { attributes: true, subtree: true }); }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    measure();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); mutations.disconnect(); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('resize', schedule); };
  }, [buttonRef, locale, open]);
  return <button ref={buttonRef} className="accessibility-launcher" dir={locale === 'ar' ? 'rtl' : 'ltr'} aria-label={accessCopy[locale].open} aria-haspopup="dialog" aria-expanded={open} onClick={onClick}>
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.4" /><circle cx="16" cy="9" r="2" fill="currentColor" /><path d="M9 13c5 2 9 2 14 0M16 15v6m0-2-4 6m4-6 4 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
  </button>;
}

export default function AccessibilityPanel({ locale, onClose, launcher, trigger, busy }: { locale: Locale; onClose: () => void; launcher: ReactNode; trigger: RefObject<HTMLButtonElement | null>; busy: boolean }) {
  const { preferences, update, reset } = useAccessibility();
  const dialog = useRef<HTMLDivElement>(null);
  const restore = useRef(!busy); restore.current = !busy;
  const text = accessCopy[locale];
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>('.accessibility-close')?.focus());
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = overflow; if (restore.current) trigger.current?.focus({ preventScroll: true }); };
  }, [trigger]);
  const select = <K extends keyof Preferences>(key: K, label: string, choices: [Preferences[K], string][]) => <PreferenceSelect key={key} label={label} value={String(preferences[key])} choices={choices.map(([value, title]) => [String(value), title])} onChange={value => update(key, (key === 'textSize' ? Number(value) : value) as Preferences[K])} />;
  return <div className="accessibility-backdrop" dir={locale === 'ar' ? 'rtl' : 'ltr'} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} className="accessibility-panel" role="dialog" aria-modal="true" aria-labelledby="accessibility-title" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const items = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button, select, input'));
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <header><div><h2 id="accessibility-title">{text.title}</h2><p>{text.intro}</p></div><button className="accessibility-close" aria-label={text.close} onClick={onClose}>×</button></header>
      <div className="accessibility-fields">
        {select('textSize', text.textSize, [[100,'100%'],[125,'125%'],[150,'150%']])}
        {select('lineSpacing', text.lineSpacing, [['standard',text.standard],['spacious',text.spacious]])}
        {select('characterSpacing', text.characterSpacing, [['standard',text.standard],['spacious',text.spacious]])}
        {select('contrast', text.contrast, [['brand',text.brand],['light',text.light],['dark',text.dark]])}
        {select('font', text.font, [['saudi',text.saudi],['plex',text.plex]])}
        {select('motion', text.motion, [['system',text.system],['reduced',text.reduced]])}
        <label className="accessibility-toggle"><input type="checkbox" checked={preferences.highlightLinks} onChange={event => update('highlightLinks', event.target.checked)} /><span>{text.links}</span></label>
        <label className="accessibility-toggle"><input type="checkbox" checked={preferences.strongFocus} onChange={event => update('strongFocus', event.target.checked)} /><span>{text.focus}</span></label>
      </div>
      <button className="accessibility-reset" onClick={() => { reset(); const status = dialog.current?.querySelector('[role="status"]'); if (status) status.textContent = text.resetDone; }}>{text.reset}</button>
      <p className="accessibility-notice" role="status" aria-live="polite">{text.saved}</p>
      {launcher}
    </div>
  </div>;
}
