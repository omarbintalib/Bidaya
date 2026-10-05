import type { Locale } from '../i18n';

/**
 * The "Ask the map" backend (../backend, POST /api/ask) and the answer shape both engines share (see answer.ts).
 * Kept apart from the in-browser engine so the start page can wake the backend without loading that engine.
 */

export interface AnswerSource { label: string; url: string }
export function sourceLinks(refs: AnswerSource[]): AnswerSource[] {
  return refs.filter((ref, i) => {
    try { return !!ref.label && ['https:', 'http:'].includes(new URL(ref.url).protocol) && refs.findIndex(r => r.url === ref.url) === i; } catch { return false; }
  });
}
export interface Answer {
  sources?: AnswerSource[]; text: string; event?: number; kind: 'event' | 'person' | 'verse' | 'refusal' | 'none';
  /** Set in the browser when the question asks who someone is: their card opens instead of an event (askedPerson). */
  person?: string;
}

/** The backend's URL: VITE_ASK_API at build time (`off` disables it); dev and preview proxy /api to it. */
const ASK_API = (import.meta.env.VITE_ASK_API as string | undefined) ?? '/api/ask';
const ASK_TIMEOUT_MS = 90_000;   // long enough for a serverless cold start (Modal: models load in ~20-60 s)
const KINDS = new Set<Answer['kind']>(['event', 'person', 'verse', 'refusal', 'none']);

/**
 * Wake the backend when the page opens (fire and forget). A serverless backend sleeps when nobody uses it;
 * this starts it while the visitor reads the start page, so their first question rarely waits for it.
 */
export function warmServer(fetcher: typeof fetch = fetch) {
  if (!ASK_API || ASK_API === 'off') return;
  try { fetcher(ASK_API.replace(/\/ask$/, '/health'), { method: 'GET' }).catch(() => { /* offline: the browser answers */ }); } catch { /* no fetch */ }
}

/** A question already on its way (askEarly), for askServer to pick up. */
let early: { question: string; locale: Locale; reply: Promise<Answer | null> } | null = null;

/**
 * Send a question as soon as it is asked, while the orb's opening animation plays (about 2 s on a phone); askServer
 * then picks the reply up when the orb is ready for it, so what the answer does (moving the map) keeps its moment.
 */
export function askEarly(question: string, locale: Locale, fetcher: typeof fetch = fetch) {
  early = { question, locale, reply: request(question, locale, fetcher) };
}

/** Ask the RAG backend. Resolves to null when it is off, unreachable, slow or returns something unexpected. */
export function askServer(question: string, locale: Locale, fetcher: typeof fetch = fetch): Promise<Answer | null> {
  const sent = early;
  early = null;
  return sent && sent.question === question && sent.locale === locale ? sent.reply : request(question, locale, fetcher);
}

async function request(question: string, locale: Locale, fetcher: typeof fetch): Promise<Answer | null> {
  if (!ASK_API || ASK_API === 'off') return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ASK_TIMEOUT_MS);
  try {
    const res = await fetcher(ASK_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, locale }), signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const r = await res.json() as Partial<Answer>;
    if (typeof r?.text !== 'string' || !r.text.trim() || !KINDS.has(r.kind as Answer['kind'])) return null;
    const sources = Array.isArray(r.sources) ? sourceLinks(r.sources.filter(s => s && typeof s.label === 'string' && typeof s.url === 'string')) : [];
    return { kind: r.kind as Answer['kind'], text: r.text.trim(), ...(sources.length ? { sources } : {}), ...(Number.isSafeInteger(r.event) ? { event: r.event } : {}) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
