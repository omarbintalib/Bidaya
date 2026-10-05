import type { ReactNode } from 'react';
import { useSirah } from '../data/useSirah';
import type { Locale } from '../i18n';
import Story from './Story';
import './journey.css';
import './story.css';
import { Recovery } from '../components/Recovery';

/** The Journey's story, map and assistant. Loaded as its own chunk (see pages/JourneyPage.tsx), which also supplies the loading status. */
export default function JourneyContent({ locale, reducedMotion, loading }: { locale: Locale; reducedMotion: boolean; loading: ReactNode }) {
  const state = useSirah();
  return state.status === 'ready' ? <Story data={state.data} locale={locale} reducedMotion={reducedMotion} />
    : state.status === 'error' ? <Recovery locale={locale} onRetry={state.retry} />
      : loading;
}
