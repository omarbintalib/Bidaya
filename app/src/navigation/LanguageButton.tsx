import { createContext, useContext } from 'react';
import { copy, type Locale } from '../i18n';

/** The site's language switch; App provides the switch, so the Journey toolbar can show it beside Search. */
export const LanguageSwitchContext = createContext<() => void>(() => {});

export default function LanguageButton({ locale, className = '' }: { locale: Locale; className?: string }) {
  const toggle = useContext(LanguageSwitchContext);
  return <button type="button" className={`language-switch ${className}`.trim()} onClick={toggle} aria-label={copy[locale].language}>
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" /><ellipse cx="10" cy="10" rx="3" ry="7" stroke="currentColor" /><path d="M3 10h14" stroke="currentColor" /></svg>
    <span lang={locale === 'ar' ? 'en' : 'ar'}>{locale === 'ar' ? 'English' : 'العربية'}</span>
  </button>;
}
