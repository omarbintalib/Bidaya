import { useId } from 'react';

/** The Ask icon: a speech bubble holding a crescent moon. */
export default function AskIcon({ className }: { className?: string }) {
  const cut = useId();
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 3.5h14a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-7.5L7 20.5V17H5a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <mask id={cut}><rect width="24" height="24" fill="#fff" /><circle cx="13.7" cy="8.9" r="3.1" fill="#000" /></mask>
    <circle cx="12" cy="10.3" r="3.9" fill="currentColor" mask={`url(#${cut})`} />
  </svg>;
}
