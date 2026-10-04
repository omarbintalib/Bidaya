import BrandLogo from '../components/BrandLogo';
import { copy, type Locale } from '../i18n';
import { navigationCopy, routeFor, type PageId } from '../navigation/routes';
import { WaypointSymbol } from '../navigation/WaypointMenu';
import LandingTour, { ScrollLink } from '../landing/LandingTour';
import { HeroCartography, LandingProgress } from '../landing/LandingAtmosphere';
import { recoveryCopy } from '../components/Recovery';

export default function TitlePage({ page, locale, onBegin }: { page: Extract<PageId, 'home'>; locale: Locale; onBegin: () => void }) {
  const route = routeFor(page), text = route[locale];
  return <main className="landing-page" data-chapter={route.number}>
    <LandingProgress />
    <section className="title-page landing-hero">
      <BrandLogo className="title-watermark" aria-hidden="true" />
      <div className="title-axis" aria-hidden="true"><span /><i /><span /></div>
      <section className="title-composition">
        <p className="eyebrow"><span />{navigationCopy[locale].chapter} <b>{route.number}</b><i />{copy[locale].eyebrow}</p>
        <h1 data-page-heading tabIndex={-1}>{text.title}</h1>
        <p className="title-subtitle">{page === 'home' ? copy[locale].heading : text.subtitle}</p>
        <a className="explore-link" href="/journey" onClick={event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); onBegin();
        }}><span>{recoveryCopy[locale].begin}</span><WaypointSymbol /></a>
        <HeroCartography />
      </section>
      <span className="title-coordinate" aria-hidden="true">{route.number} — 03</span>
      <ScrollLink locale={locale} />
    </section>
    <LandingTour locale={locale} onBegin={onBegin} />
  </main>;
}
