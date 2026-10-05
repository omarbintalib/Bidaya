/** The Ask icon: a speech bubble holding an eight-pointed star. */
export default function AskIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 3.5h14a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-7.5L7 20.5V17H5a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M9.6 7.9h4.8v4.8H9.6zM12 6.9l3.4 3.4-3.4 3.4-3.4-3.4z" fill="currentColor" />
  </svg>;
}
