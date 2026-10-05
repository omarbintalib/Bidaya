import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Locale } from '../i18n';
import { journeyCopy } from './copy';

/** The toolbar's sound button: opens a small panel to turn the background sounds on or off and set their volume. */
export default function SoundMenu({ locale, on, volume, onToggle, onVolume }: {
  locale: Locale; on: boolean; volume: number; onToggle: () => void; onVolume: (v: number) => void;
}) {
  const text = journeyCopy[locale];
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLButtonElement>('.tb-sound')?.focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  // Placed under the button and kept inside the screen, whichever side of the toolbar the button is on.
  const [place, setPlace] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!open) return;
    const fit = () => {
      const b = root.current?.querySelector('.tb-sound')?.getBoundingClientRect();
      if (!b) return;
      const w = Math.min(260, window.innerWidth - 20), rtl = getComputedStyle(root.current!).direction === 'rtl';
      const left = Math.max(10, Math.min(window.innerWidth - 10 - w, rtl ? b.left : b.right - w));
      setPlace({ top: b.bottom + 8, left, width: w });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [open]);
  const pct = Math.round(volume * 100);
  return <div className="sound-menu" ref={root}>
    <button type="button" className={`tb-btn tb-sound${on ? ' is-open' : ''}`} aria-expanded={open} aria-controls={id} aria-label={text.soundTitle} title={text.soundTitle} onClick={() => setOpen(o => !o)}>
      <SpeakerIcon on={on} />
      <span className="tb-long">{text.sound}</span>
    </button>
    {open && <div className="sound-panel" id={id} role="group" aria-label={text.soundTitle} style={place}>
      <label className="sound-row">
        <span>{text.soundOn}</span>
        <input type="checkbox" role="switch" className="sound-switch" checked={on} onChange={onToggle} />
      </label>
      <label className={`sound-row sound-volume${on ? '' : ' is-off'}`}>
        <span>{text.soundVolume}</span>
        <input type="range" min={0} max={100} step={5} value={pct} disabled={!on} aria-valuetext={`${pct}%`}
          onChange={e => onVolume(Number(e.target.value) / 100)} style={{ ['--v' as string]: `${pct}%` }} />
      </label>
      <p className="sound-note">{text.soundNote}</p>
    </div>}
  </div>;
}

function SpeakerIcon({ on }: { on: boolean }) {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 7.5h3l4-3.5v12l-4-3.5h-3z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    {on ? <path d="M13.5 7a4 4 0 0 1 0 6M15.5 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      : <path d="m13.5 8 4 4m0-4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />}</svg>;
}
