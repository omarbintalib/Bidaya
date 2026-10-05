import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { requestSummary } from './navigation/summaryRequest';
import { SpeedInsights } from '@vercel/speed-insights/react';
import BrandLogo from './components/BrandLogo';
import JourneyPage, { preloadJourney } from './pages/JourneyPage';
import { onIdle } from './idle';
import TitlePage from './pages/TitlePage';
import NotFoundPage from './pages/NotFoundPage';
import { PageBoundary } from './components/Recovery';
import WaypointMenu from './navigation/WaypointMenu';
import LogoTransition from './navigation/LogoTransition';
import { navigationCopy, routeFor } from './navigation/routes';
import { useNavigation } from './navigation/useNavigation';
import { useLanguageSwitch } from './navigation/useLanguageSwitch';
import { copy, type Locale } from './i18n';
import { AccessibilityProvider, useAccessibility } from './accessibility/AccessibilityProvider';
import AccessibilityPanel, { AccessibilityLauncher } from './accessibility/AccessibilityPanel';

function GeometricMark() {
  return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="m20 3 5 10 12 7-12 6-5 11-6-11L3 20l11-7Z" stroke="currentColor" /><path d="M8 8h24v24H8Z" stroke="currentColor" transform="rotate(45 20 20)" /><circle cx="20" cy="20" r="3" fill="currentColor" /></svg>;
}

export default function App() {
  return (
    <AccessibilityProvider>
      <Workspace />
      <SpeedInsights />
    </AccessibilityProvider>
  );
}

function Workspace() {
  const { reducedMotion } = useAccessibility();
  const [locale, setLocale] = useState<Locale>(() => {
    try { return localStorage.getItem('bidaya.locale') === 'en' ? 'en' : 'ar'; } catch { return 'ar'; }
  });
  useEffect(() => { try { localStorage.setItem('bidaya.locale', locale); } catch { /* Preferences remain usable without storage. */ } }, [locale]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const accessTrigger = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const navigation = useNavigation(closeMenu);
  const toggleLocale = useLanguageSwitch(locale, setLocale, reducedMotion, navigation.busy);
  const text = copy[locale], route = routeFor(navigation.page);
  useEffect(() => { if (navigation.busy) setAccessOpen(false); }, [navigation.busy]);
  const launcher = <AccessibilityLauncher locale={locale} open={accessOpen} buttonRef={accessTrigger} onClick={() => { setMenuOpen(false); setAccessOpen(value => !value); }} />;

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.title = `${route[locale].title} · ${text.title}`;
  }, [locale, route, text.title]);

  // Fetch the Journey ahead of time: its code once the browser is idle, its data as soon as a visitor heads for it
  // (pointing at, focusing or touching a Journey link), so both download during the page transition, not after it.
  useEffect(() => {
    const intent = (event: Event) => { if (event.target instanceof Element && event.target.closest('a[href="/journey"]')) preloadJourney(); };
    const kinds = ['pointerover', 'focusin', 'touchstart'] as const;
    kinds.forEach(kind => document.addEventListener(kind, intent, { passive: true }));
    const cancel = onIdle(() => preloadJourney(false), 3000);
    return () => { cancel(); kinds.forEach(kind => document.removeEventListener(kind, intent)); };
  }, []);
  // Opening the Journey (directly, or with Back/Forward): fetch the data alongside its code, not after it has loaded.
  useEffect(() => { if (navigation.page === 'journey') preloadJourney(); }, [navigation.page]);

  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      const height = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--viewport-height', `${height}px`);
      document.documentElement.style.setProperty('--keyboard-inset', `${Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0))}px`);
      document.documentElement.dataset.compactViewport = String(height < 600 && window.innerWidth <= 700);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const field = document.activeElement;
        if (field instanceof HTMLInputElement && field.classList.contains('mo-field')) field.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      });
    };
    update();
    viewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return <>
    <div className={`workspace ${navigation.busy ? 'page-transitioning' : 'page-ready'}`} dir={locale === 'ar' ? 'rtl' : 'ltr'} inert={menuOpen || accessOpen || navigation.busy}>
      <a className="skip-content" href="#main-content" onClick={event => {
        event.preventDefault(); const main = document.querySelector<HTMLElement>('.workspace main');
        if (main) { main.tabIndex = -1; main.focus({ preventScroll: true }); main.scrollIntoView({ block: 'start', behavior: 'instant' }); }
      }}>{locale === 'ar' ? 'تجاوز إلى المحتوى' : 'Skip to content'}</a>
      <header className="site-header">
        <a className="brand-home" href="/" aria-label={locale === 'ar' ? 'العودة إلى الصفحة الرئيسية' : 'Go to the home page'} aria-current={navigation.page === 'home' ? 'page' : undefined} onClick={event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault(); navigation.request('home');
        }}><BrandLogo className="brand-logo" aria-hidden="true" /></a>
        <button ref={trigger} className="destination-trigger" aria-label={`${navigationCopy[locale].open} — ${route[locale].title}`} aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          <svg className="destination-menu-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          <span>{locale === 'ar' ? 'القائمة' : 'Menu'}</span>
        </button>
        <div className="header-end">
          {/* The Sirah summary, from any page: it opens over the Journey (going there first if need be). */}
          <button className="summary-link" aria-label={locale === 'ar' ? 'ملخص السيرة' : 'Sirah summary'} title={locale === 'ar' ? 'ملخص السيرة على الخريطة' : 'The Sirah summary on the map'}
            onClick={() => { requestSummary(); if (navigation.page !== 'journey') navigation.request('journey'); }}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8.3 6.8v6.4l5-3.2z" fill="currentColor" /></svg>
            <span aria-hidden="true">{locale === 'ar' ? 'ملخص السيرة' : 'Sirah summary'}</span>
          </button>
          <button className="language-switch" onClick={toggleLocale} aria-label={text.language}>
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" /><ellipse cx="10" cy="10" rx="3" ry="7" stroke="currentColor" /><path d="M3 10h14" stroke="currentColor" /></svg>
            <span lang={locale === 'ar' ? 'en' : 'ar'}>{locale === 'ar' ? 'English' : 'العربية'}</span>
          </button>
        </div>
      </header>
      <PageBoundary key={navigation.page} locale={locale}>
        {navigation.page === 'not-found' ? <NotFoundPage locale={locale} onHome={() => navigation.request('home')} onBegin={() => navigation.request('journey')} />
          : navigation.page === 'journey' ? <JourneyPage locale={locale} /> : <TitlePage page="home" locale={locale} onBegin={() => navigation.request('journey')} />}
      </PageBoundary>
      <footer className="site-footer"><span>{text.footer}</span><GeometricMark /><span className="footer-edition">{route.number} / 2026</span></footer>
    </div>
    {menuOpen && <WaypointMenu locale={locale} page={navigation.page} trigger={trigger} busy={navigation.busy} onClose={closeMenu} onNavigate={navigation.request} />}
    {!navigation.busy && !menuOpen && !accessOpen && launcher}
    {accessOpen && !navigation.busy && <AccessibilityPanel locale={locale} busy={navigation.busy} trigger={accessTrigger} launcher={launcher} onClose={() => setAccessOpen(false)} />}
    {navigation.busy && <LogoTransition reducedMotion={reducedMotion} run={navigation.run} initial={navigation.run === 0} locale={locale} onCovered={navigation.commit} onFinish={navigation.finish} />}
  </>;
}
