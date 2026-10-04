import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export default function PreferenceSelect({ label, value, choices, onChange }: { label: string; value: string; choices: [string, string][]; onChange: (value: string) => void }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const selected = Math.max(0, choices.findIndex(choice => choice[0] === value));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selected);
  const show = () => { setActive(selected); setOpen(true); };
  const choose = (index: number) => { onChange(choices[index][0]); setOpen(false); };
  useLayoutEffect(() => {
    if (!open || !button.current || !list.current) return;
    const box = button.current.getBoundingClientRect();
    const popup = list.current;
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const bottom = top + (viewport?.height ?? window.innerHeight);
    const width = Math.min(Math.max(box.width, 280), window.innerWidth - 32);
    const rtl = getComputedStyle(button.current).direction === 'rtl';
    popup.style.width = `${width}px`;
    popup.style.left = `${Math.max(16, Math.min(window.innerWidth - width - 16, rtl ? box.right - width : box.left))}px`;
    const below = bottom - box.bottom - 24, above = box.top - top - 24;
    const height = popup.scrollHeight;
    const upwards = below < height && above > below;
    popup.style.maxHeight = `${Math.max(44, upwards ? above : below)}px`;
    popup.style.top = `${upwards ? box.top - Math.min(height, above) - 8 : box.bottom + 8}px`;
  }, [open, value]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !list.current?.contains(event.target)) close(); };
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !button.current?.contains(event.target) && !list.current?.contains(event.target)) close(); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); window.removeEventListener('scroll', scroll, true); };
  }, [open]);
  return <div className="accessibility-field">
    <span id={`${id}-label`}>{label}</span>
    <button ref={button} type="button" role="combobox" className="accessibility-select" aria-labelledby={`${id}-label`} aria-describedby={`${id}-value`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open ? `${id}-option-${active}` : undefined} data-value={value} onClick={() => open ? setOpen(false) : show()} onBlur={() => setOpen(false)} onKeyDown={event => {
      if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault();
        if (!open) { show(); return; }
        setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length);
      } else if (open && ['Enter',' '].includes(event.key)) { event.preventDefault(); choose(active); }
      else if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      else if (event.key === 'Tab') setOpen(false);
      else if (event.key.length === 1 && event.key !== ' ') {
        const index = choices.findIndex(choice => choice[1].toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
        if (index >= 0) { event.preventDefault(); if (!open) setOpen(true); setActive(index); }
      }
    }}>
      <span id={`${id}-value`} className="accessibility-select-value">{choices[selected][1]}</span>
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 8 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && <div ref={list} id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="accessibility-options" onMouseDown={event => event.preventDefault()}>{choices.map(([key, title], index) => <div key={key} id={`${id}-option-${index}`} role="option" aria-selected={index === selected} data-value={key} data-active={index === active || undefined} onPointerMove={() => setActive(index)} onClick={() => choose(index)}><span>{title}</span><span aria-hidden="true">{index === selected ? '✓' : ''}</span></div>)}</div>}
  </div>;
}
