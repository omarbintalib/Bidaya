import { useEffect, useRef, useState } from 'react';
import type { Locale } from '../i18n';
import './narration.css';

interface Recording { voice: string; hash: string; parts: string[] }
interface Manifest { version: number; entries: Record<string, Recording> }
const copy = {
  ar: { listen: 'استمع إلى الحدث', unavailable: 'التسجيل الصوتي غير متاح لهذا الحدث بعد.', failed: 'تعذر تشغيل التسجيل. حاول مرة أخرى.', continuous: 'متابعة القراءة تلقائيًا', speed: 'سرعة القراءة', part: 'جزء', chapter: 'استمع إلى الفصل' },
  en: { listen: 'Listen to this event', unavailable: 'Audio for this event is not available yet.', failed: 'Could not play the recording. Try again.', continuous: 'Continue reading automatically', speed: 'Reading speed', part: 'Part', chapter: 'Listen to this chapter' },
};

/** Static recordings only. One audio element owns playback across all chapter/event chunks. */
export default function NarrationPlayer({ locale, entryId, onNext, onStarted, storyPlaying }: {
  locale: Locale; entryId: string | null; onNext: (() => void) | null; onStarted: () => void; storyPlaying: boolean;
}) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const trackKey = `${locale}/${entryId}`;
  const [position, setPosition] = useState({ key: trackKey, part: 0 });
  const part = position.key === trackKey ? position.part : 0;
  const [speed, setSpeed] = useState(1);
  const [continuous, setContinuous] = useState(false);
  const [error, setError] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const continueIntoNext = useRef(false);
  const previousLocale = useRef(locale);
  const text = copy[locale];
  const base = `${import.meta.env.BASE_URL}audio/narration/`;
  const recording = entryId ? manifest?.entries[`${locale}/${entryId}`] : undefined;
  const source = recording?.parts[part] ? base + recording.parts[part] : undefined;

  useEffect(() => {
    const controller = new AbortController();
    fetch(base + 'manifest.json', { signal: controller.signal }).then(r => {
      if (!r.ok) throw new Error('Manifest unavailable'); return r.json();
    }).then(m => { if (m.version === 1 && m.entries) setManifest(m); }).catch(() => { /* Audio may be generated later. */ });
    return () => controller.abort();
  }, [base]);
  useEffect(() => {
    const player = audio.current;
    const resume = continueIntoNext.current && previousLocale.current === locale;
    continueIntoNext.current = false;
    previousLocale.current = locale;
    player?.pause();
    setPosition({ key: trackKey, part: 0 }); setError(false);
    if (resume && recording) continueIntoNext.current = true;
  }, [entryId, locale]);
  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    player.load();
    player.playbackRate = speed;
    if (source && continueIntoNext.current) {
      continueIntoNext.current = false;
      void player.play().catch(() => setError(true));
    }
    return () => player.pause();
  }, [source]);
  useEffect(() => { if (audio.current) audio.current.playbackRate = speed; }, [speed]);
  useEffect(() => { if (storyPlaying) audio.current?.pause(); }, [storyPlaying]);
  useEffect(() => {
    const pause = () => { continueIntoNext.current = false; audio.current?.pause(); };
    const hidden = () => { if (document.hidden) pause(); };
    window.addEventListener('wheel', pause, { passive: true });
    window.addEventListener('touchstart', pause, { passive: true });
    window.addEventListener('journey-language-changing', pause);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      pause(); window.removeEventListener('wheel', pause); window.removeEventListener('touchstart', pause);
      window.removeEventListener('journey-language-changing', pause); document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  if (!entryId) return null;
  return <section className="narration-player" aria-label={entryId.startsWith('chapter-') ? text.chapter : text.listen}>
    <span className="narration-title">{entryId.startsWith('chapter-') ? text.chapter : text.listen}</span>
    {recording ? <>
      <audio ref={audio} controls preload="metadata" src={source} aria-label={text.listen}
        onPlay={() => { setError(false); onStarted(); }} onError={() => setError(true)} onEnded={() => {
          if (part + 1 < recording.parts.length) { continueIntoNext.current = true; setPosition({ key: trackKey, part: part + 1 }); }
          else if (continuous && onNext) { continueIntoNext.current = true; onNext(); }
        }} />
      <div className="narration-options">
        <label>{text.speed} <select value={speed} onChange={e => setSpeed(Number(e.target.value))}>
          {[.75, 1, 1.25, 1.5].map(rate => <option key={rate} value={rate}>{rate}×</option>)}
        </select></label>
        {recording.parts.length > 1 && <label>{text.part} <select value={part} onChange={e => { continueIntoNext.current = false; setPosition({ key: trackKey, part: Number(e.target.value) }); }}>
          {recording.parts.map((_, i) => <option key={i} value={i}>{i + 1} / {recording.parts.length}</option>)}
        </select></label>}
        <label><input type="checkbox" checked={continuous} onChange={e => setContinuous(e.target.checked)} />{text.continuous}</label>
      </div>
      {error && <p role="alert">{text.failed}</p>}
    </> : <p className="narration-unavailable">{text.unavailable}</p>}
  </section>;
}
