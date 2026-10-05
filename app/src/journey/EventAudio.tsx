import { useEffect, useRef, useState } from 'react';
import { digits } from '../data/select';
import type { EventAudio as Audio } from '../data/types';
import type { Locale } from '../i18n';
import { journeyCopy } from './copy';

const clock = (s: number, locale: Locale) => digits(`${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`, locale);

/**
 * A recording on an event's card (e.g. the adhan): play and pause, with a progress bar. It stops when its event is no
 * longer the current one (on phones a read card stays open, so closing alone is not enough) and when the card closes.
 */
export default function EventAudio({ audio, locale, current }: { audio: Audio; locale: Locale; current: boolean }) {
  const text = journeyCopy[locale];
  const el = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ at: 0, length: 0 });
  // Nothing is downloaded until the reader presses play.
  useEffect(() => () => { el.current?.pause(); el.current = null; }, []);
  useEffect(() => { if (!current) el.current?.pause(); }, [current]);
  const toggle = () => {
    if (!el.current) {
      const a = new window.Audio(`${import.meta.env.BASE_URL}sounds/${audio.file}`);
      a.preload = 'auto';
      a.addEventListener('timeupdate', () => setTime({ at: a.currentTime, length: a.duration || 0 }));
      a.addEventListener('loadedmetadata', () => setTime({ at: a.currentTime, length: a.duration || 0 }));
      a.addEventListener('play', () => setPlaying(true));
      a.addEventListener('pause', () => setPlaying(false));
      a.addEventListener('ended', () => { setPlaying(false); a.currentTime = 0; });
      el.current = a;
    }
    if (el.current.paused) void el.current.play().catch(() => setPlaying(false)); else el.current.pause();
  };
  const share = time.length ? time.at / time.length : 0;
  return <div className={`ecard-audio${playing ? ' is-playing' : ''}`}>
    <button type="button" className="ecard-audio-btn" onClick={toggle} aria-pressed={playing}>
      {playing ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4h3v12H6zM11 4h3v12h-3z" fill="currentColor" /></svg>
        : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>}
      <span>{playing ? text.audioPause : audio.label[locale]}</span>
    </button>
    <p className="ecard-audio-note">{audio.description[locale]}</p>
    {time.length > 0 && <div className="ecard-audio-time">
      <span className="ecard-audio-bar" aria-hidden="true"><i style={{ transform: `scaleX(${share})` }} /></span>
      <span>{clock(time.at, locale)} / {clock(time.length, locale)}</span>
    </div>}
  </div>;
}
