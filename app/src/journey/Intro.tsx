import { HEIGHT, LAND, WIDTH } from '../data/land';
import BrandLogo from '../components/BrandLogo';
import type { Locale } from '../i18n';
import { journeyCopy } from './copy';

/** Opening scene: the coastline of Arabia draws itself, then the title, and the story from the start or its summary. */
export default function Intro({ locale, reducedMotion, onBegin, onSummary }: { locale: Locale; reducedMotion: boolean; onBegin: () => void; onSummary: () => void }) {
  const text = journeyCopy[locale];
  return <div className={`intro-scene${reducedMotion ? ' is-still' : ''}`} role="region" aria-label={text.introLabel}>
    <svg className="intro-land" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d={LAND} pathLength={1} />
    </svg>
    <div className="intro-content">
      <BrandLogo className="intro-logo" aria-hidden="true" />
      <p className="intro-kicker">{text.introKicker}</p>
      <h2 className="intro-title">{text.introTitle}</h2>
      <p className="intro-sub">{text.introSub}</p>
      <div className="intro-actions">
        <button type="button" className="btn-primary intro-begin" onClick={onBegin}>{text.fromStart}</button>
        <button type="button" className="btn-quiet" title={text.filmHint} onClick={onSummary}>{text.film}</button>
      </div>
    </div>
  </div>;
}
