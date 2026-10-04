import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { recoveryCopy } from '../components/Recovery';
import { useAccessibility } from '../accessibility/AccessibilityProvider';
import BrandLogo from '../components/BrandLogo';
import type { Locale } from '../i18n';
import { WaypointSymbol } from '../navigation/WaypointMenu';
import { landingCopy } from './copy';
import FlippingBook from './FlippingBook';
import './landing.css';

function Arrow({ down = false }: { down?: boolean }) {
  return <svg className={down ? 'landing-arrow is-down' : 'landing-arrow'} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function ScrollLink({ locale }: { locale: Locale }) {
  const { reducedMotion } = useAccessibility();
  return <a className="landing-scroll" href="#discover" onClick={event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const target = document.getElementById('discover');
    if (!target) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
  }}><span>{landingCopy[locale].discover}</span><Arrow down /></a>;
}

function Preview({ name, locale, alt, className = '', width = 800, height = 600 }: { name: string; locale: Locale; alt: string; className?: string; width?: number; height?: number }) {
  const [failedSource, setFailedSource] = useState('');
  const source = `/images/landing/${name}-${locale}.webp`;
  return failedSource === source ? <div className="landing-preview-fallback"><p>{alt}</p><p>{recoveryCopy[locale].preview}</p></div>
    : <img className={`landing-preview ${className}`} src={source} alt={alt} width={width} height={height} loading="lazy" decoding="async" onError={() => setFailedSource(source)} />;
}

export default function LandingTour({ locale, onBegin }: { locale: Locale; onBegin: () => void }) {
  const text = landingCopy[locale];
  const { reducedMotion } = useAccessibility();
  const root = useRef<HTMLDivElement>(null);
  // Progressive enhancement: nothing is hidden while waiting for JavaScript or an observer.
  // A one-time, short entrance only runs as each section reaches the viewport.
  useEffect(() => {
    if (reducedMotion || !root.current || !('IntersectionObserver' in window)) return;
    const animations = new Set<Animation>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        const el = entry.target as HTMLElement;
        el.dataset.landingEntered = 'true';
        // Stagger the text and image in each row, rather than moving one large block.
        const children = [...el.children].filter(child => !(child instanceof SVGElement));
        const targets = el.matches('figure') ? [el] : children;
        targets.forEach((target, index) => {
          if (typeof target.animate !== 'function') return;
          const animation = target.animate([
            { opacity: .15, transform: `translateY(${target.matches('figure') ? 30 : 20}px)` },
            { opacity: 1, transform: 'translateY(0)' },
          ], { duration: 720, delay: Math.min(index, 3) * 90, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
          animations.add(animation);
          animation.onfinish = () => animations.delete(animation);
        });
      });
    }, { threshold: .08 });
    root.current.querySelectorAll('[data-landing-reveal]').forEach(el => observer.observe(el));
    return () => { observer.disconnect(); animations.forEach(animation => animation.cancel()); };
  }, [reducedMotion]);

  const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onBegin();
  };
  const beginLink = (primary = false) => <a className={`landing-begin${primary ? ' is-primary' : ''}`} href="/journey" onClick={navigate}><span>{text.begin}</span><Arrow /></a>;
  const number = (n: number) => new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(n);

  return <div className="landing-tour" ref={root}>
    <section className="landing-overview landing-section" id="discover" tabIndex={-1} aria-labelledby="discover-title">
      <div className="landing-overview-heading" data-landing-reveal>
        <div><p className="landing-kicker"><span aria-hidden="true">{number(1)}</span>{text.overviewLabel}</p><h2 id="discover-title">{text.overviewTitle}</h2></div>
        <div className="landing-overview-copy"><p>{text.overviewBody}</p>{beginLink()}</div>
      </div>
      <figure className="landing-overview-figure" data-landing-reveal>
        <div className="landing-preview-label"><span className="landing-diamond" aria-hidden="true" />{text.preview}<WaypointSymbol /></div>
        <picture>
          <source media="(max-width: 600px)" srcSet={`/images/landing/overview-mobile-${locale}.webp`} width="537" height="1080" />
          <Preview name="overview" locale={locale} alt={text.overviewAlt} width={1600} height={908} />
        </picture>
        <figcaption><span>{text.overviewCaption}</span><span aria-hidden="true">01 — 03</span></figcaption>
      </figure>
    </section>

    <section className="landing-section landing-how" aria-labelledby="tour-title">
      <header className="landing-section-heading" data-landing-reveal><p className="landing-kicker"><span aria-hidden="true">{number(2)}</span>{text.tourLabel}</p><h2 id="tour-title">{text.tourTitle}</h2><p>{text.tourBody}</p></header>
      <ol className="landing-steps">
        {text.steps.map((step, index) => <li className="landing-step" key={index} data-landing-reveal>
          <div className="landing-step-copy"><p className="landing-step-label"><span>{number(index + 1)}</span>{step.label}</p><h3>{step.title}</h3><p>{step.body}</p><p className="landing-step-note"><WaypointSymbol />{step.note}</p></div>
          <figure className={`landing-step-figure landing-step-${index}`}>
            <div className="landing-step-image"><Preview name={['chapters', 'place', 'route'][index]} locale={locale} alt={step.alt} /></div>
            <figcaption>{step.caption}</figcaption>
          </figure>
        </li>)}
      </ol>
    </section>

    <section className="landing-section landing-deeper" aria-labelledby="deeper-title">
      <header className="landing-section-heading" data-landing-reveal><p className="landing-kicker"><span aria-hidden="true">{number(3)}</span>{text.deeperLabel}</p><h2 id="deeper-title">{text.deeperTitle}</h2><p>{text.deeperBody}</p></header>
      <div className="landing-features">
        {text.features.map((feature, index) => <article className="landing-feature" key={feature.image} data-landing-reveal>
          <div className="landing-feature-heading"><span aria-hidden="true">{number(index + 1)}</span><h3>{feature.title}</h3></div>
          <p>{feature.body}</p>
          <figure><div className={`landing-feature-image landing-feature-${feature.image}`}><Preview name={feature.image} locale={locale} alt={feature.alt} /></div><figcaption>{text.preview}</figcaption></figure>
        </article>)}
      </div>
    </section>

    <section className="landing-section landing-sources" aria-labelledby="sources-title">
      <div className="landing-source-copy" data-landing-reveal>
        <p className="landing-kicker"><span aria-hidden="true">{number(4)}</span>{text.sourcesLabel}</p><h2 id="sources-title">{text.sourcesTitle}</h2><p>{text.sourcesBody}</p>
        <dl>{text.sources.map(source => <div key={source.title}><dt>{source.title}</dt><dd>{source.body}</dd></div>)}</dl>
      </div>
      <div className="landing-source-aside" data-landing-reveal>
        <figure className="landing-source-example">
          <div className="landing-source-heading"><FlippingBook /><div><p className="landing-kicker">{text.sourceExample}</p><span className="landing-source-tag">{locale === 'ar' ? 'مرجع تاريخي' : 'Historical reference'}</span></div></div>
          <div className="landing-source-event"><span className="landing-source-number">{locale === 'ar' ? 'حدث ٤٢' : 'Event 42'}</span><h3>{text.sourceExampleTitle}</h3><p>{text.sourceExampleBody}</p></div>
          <figcaption className="landing-source-reference"><span>{locale === 'ar' ? 'المصدر' : 'Source'}</span><a href="https://dorar.net/history/event/42" target="_blank" rel="noreferrer"><span>{locale === 'ar' ? 'الموسوعة التاريخية — الدرر السنية' : 'Dorar Historical Encyclopedia'}<small>{locale === 'ar' ? 'اقرأ النص في مصدره' : 'Read the original source'}</small></span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 4h6v6m0-6-9 9M10 5H5v14h14v-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></a></figcaption>
        </figure>
        <p className="landing-precision"><span className="landing-diamond" aria-hidden="true" />{text.precision}</p>
      </div>
    </section>

    <section className="landing-closing" aria-labelledby="closing-title" data-landing-reveal>
      <BrandLogo className="landing-closing-watermark" aria-hidden="true" />
      <WaypointSymbol />
      <p className="landing-kicker">{text.closingLabel}</p><h2 id="closing-title">{text.closingTitle}</h2><p className="landing-closing-body">{text.closingBody}</p>
      {beginLink(true)}<p className="landing-closing-note">{text.closingNote}</p>
    </section>
  </div>;
}
