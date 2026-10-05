import { quranpediaRefs } from '../data/quranpedia';
import { dateLine, digits, eventPlaceName, excerpt, hadithLinks, sourceLabel } from '../data/select';
import type { Person, Sirah, SirahEvent, Verse } from '../data/types';
import type { Locale } from '../i18n';

/**
 * "Ask the map" — answers only from the project's sources (slide 5 & 6 of the deck):
 * Dorar event texts (النص), the Companions' cited synopses, and the verse records (وجه_الارتباط).
 * Every answer names its source; questions asking for a ruling are referred to an official
 * fatwa body; questions with no matching source get an apology.
 *
 * Two engines, same rules and the same `Answer` shape:
 * - `askServer()`: the RAG backend (../backend, POST /api/ask) — the books (Dorar, al-Raheeq, Sahih al-Bukhari,
 *   al-Wahidi's sahih/hasan reports) plus these CSVs, an LLM writing only from the retrieved passages, with checks.
 *   The model key stays on the server.
 * - `answer()`: retrieval over the CSVs in the browser. Used when the backend is off or unreachable, and for
 *   the suggested questions (`suggestFor`), which must be instant.
 */

export interface AnswerSource { label: string; url: string }
export function sourceLinks(refs: AnswerSource[]): AnswerSource[] {
  return refs.filter((ref, i) => {
    try { return !!ref.label && ['https:', 'http:'].includes(new URL(ref.url).protocol) && refs.findIndex(r => r.url === ref.url) === i; } catch { return false; }
  });
}
export interface Answer { sources?: AnswerSource[]; text: string; event?: number; kind: 'event' | 'person' | 'verse' | 'refusal' | 'none' }

/** The backend's URL: VITE_ASK_API at build time (`off` disables it); dev and preview proxy /api to it. */
const ASK_API = (import.meta.env.VITE_ASK_API as string | undefined) ?? '/api/ask';
const ASK_TIMEOUT_MS = 45_000;
const KINDS = new Set<Answer['kind']>(['event', 'person', 'verse', 'refusal', 'none']);

/** Ask the RAG backend. Resolves to null when it is off, unreachable, slow or returns something unexpected. */
export async function askServer(question: string, locale: Locale, fetcher: typeof fetch = fetch): Promise<Answer | null> {
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
type Doc = { kind: 'event'; item: SirahEvent; fields: Field[] } | { kind: 'person'; item: Person; fields: Field[] } | { kind: 'verse'; item: Verse; fields: Field[] };
type Field = { weight: number; tokens: Set<string> };

const STOP_WORDS = ['من', 'في', 'على', 'الى', 'الي', 'عن', 'ما', 'ماذا', 'لماذا', 'متى', 'اين', 'كيف', 'هل', 'هو', 'هي', 'كان', 'كانت', 'التي', 'الذي', 'ذلك', 'هذا', 'هذه', 'او', 'ثم', 'مع', 'لم', 'قد', 'بن', 'بنت', 'ابن', 'رضي', 'الله', 'عنه', 'عنها', 'صلي', 'عليه', 'وسلم', 'النبي', 'رسول', 'اخبرني', 'حدثني', 'قصه', 'حدث', 'سوره', 'نزلت', 'نبي', 'كم', 'عدد', 'اذكر', 'اشرح', 'عرفني', 'معني', 'سبب', 'لما',
  'the', 'a', 'an', 'of', 'in', 'on', 'to', 'and', 'or', 'is', 'was', 'were', 'did', 'do', 'does', 'what', 'when', 'where', 'why', 'how', 'who', 'which', 'tell', 'me', 'about', 'with', 'for', 'at', 'by', 'from', 'prophet', 'messenger', 'allah', 'his', 'he', 'she', 'her', 'it', 'that', 'this', 'surah', 'revealed', 'story', 'event', 'al', 'el', 'ibn', 'bin', 'peace', 'upon', 'him', 'be', 'pleased', 'may', 'there', 'they', 'their', 'happen', 'happened'];

export function normalize(s: string) {
  return s.toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[ﷺ]/g, ' ')
    .replace(/[‘’ʿʾ'`´]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');
}

/** English: drop suffixes, then keep a consonant skeleton so "Madinah", "Medina" and Dorar's "Madeenah" meet. */
function englishKey(t: string) {
  const base = t.length > 5 ? t.replace(/(ations?|ions?|ing|ed|es|s)$/, '') : t;
  const key = base[0] + base.slice(1).replace(/[aeiouy]/g, '').replace(/h$/, '').replace(/(.)\1+/g, '$1');
  return key.length >= 2 ? key : base;
}
function stem(t: string) {
  if (/^[a-z0-9]+$/.test(t)) return /^\d+$/.test(t) ? t : englishKey(t);
  // Arabic: strip the definite article with its attached particles.
  return t.replace(/^(وال|بال|فال|كال|لل|ال)(?=\S{2,})/, '');
}

const STOP = new Set(STOP_WORDS.map(w => normalize(w).trim()));
export const tokens = (s: string) => normalize(s).split(/\s+/).filter(t => t.length > 1 && !STOP.has(t)).map(stem).filter(t => t.length > 1 && !STOP.has(t));
const field = (weight: number, ...texts: (string | null | undefined)[]): Field => ({ weight, tokens: new Set(tokens(texts.filter(Boolean).join(' '))) });

const indexes = new WeakMap<Sirah, { docs: Doc[]; idf: Map<string, number>; weight: Map<SirahEvent, number> }>();
function indexFor(data: Sirah) {
  let index = indexes.get(data);
  if (index) return index;
  const docs: Doc[] = [
    ...data.events.map(e => ({ kind: 'event' as const, item: e, fields: [field(4, e.title.ar, e.title.en), field(2, e.placeName.ar, e.placeName.en), field(1, e.text.ar, e.text.en)] })),
    ...data.people.map(p => ({ kind: 'person' as const, item: p, fields: [field(5, p.name.ar, p.name.en, ...p.aliases.flatMap(a => [a.ar, a.en])), field(0.6, p.bio, p.bioEn)] })),
    ...data.verses.filter(v => v.link?.type !== 'placeholder' || v.reason).map(v => ({ kind: 'verse' as const, item: v, fields: [field(4, `سوره ${v.surah}`, v.surah), field(2.5, v.title.ar, v.title.en), field(0.8, v.reason, v.evidence.en)] })),
  ];
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.fields.flatMap(f => [...f.tokens]))) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = new Map([...df].map(([t, n]) => [t, Math.log(1 + docs.length / n)]));
  // Tie-break between events with the same name (e.g. the three Badrs): prefer the one the sources say most about.
  const weight = new Map(data.events.map(e => [e, data.verses.filter(v => v.link?.event === e.n).length + data.people.filter(p => p.events.includes(e.n)).length]));
  index = { docs, idf, weight };
  indexes.set(data, index);
  return index;
}

const RULING = /(حكم|حلال|حرام|يجوز|تجوز|جائز|فتوي|افتني|مكروه|واجب علي|هل علي|is it (halal|haram|allowed|permissible|forbidden)|\bruling\b|\bfatwa\b|\bhalal\b|\bharam\b|am i allowed|can i (pray|fast|eat|drink|marry))/i;

export interface Hit { doc: Doc; score: number; coverage: number; strong: boolean }
export function retrieve(data: Sirah, question: string, limit = 5): Hit[] {
  const { docs, idf, weight } = indexFor(data);
  const q = [...new Set(tokens(question))];
  if (!q.length) return [];
  const nq = normalize(question).trim();
  const wantsPerson = /^(من هو|من هي|من كان|من كانت|who (is|was))\b/.test(nq);
  const wantsVerse = /(سور|ايه|ايات|surah|verse|ayah)/.test(nq);
  const hits: Hit[] = [];
  for (const doc of docs) {
    let score = 0, matched = 0, strong = false;
    for (const t of q) {
      let best = 0;
      for (const f of doc.fields) {
        if (f.tokens.has(t)) { best = Math.max(best, f.weight); if (f.weight >= 2) strong = true; }
        else if (t.length >= 4) for (const w of f.tokens) if (w.length >= 4 && Math.abs(w.length - t.length) <= 3 && (w.startsWith(t) || t.startsWith(w))) { best = Math.max(best, f.weight * 0.6); break; }
      }
      if (best) matched++;
      score += best * (idf.get(t) ?? Math.log(1 + docs.length));
    }
    if (!score) continue;
    if (doc.kind === 'person' && wantsPerson) score *= 1.6;
    if (doc.kind === 'verse') score *= wantsVerse ? (doc.item.whole ? 1.8 : 1.5) : 0.7;
    if (doc.kind === 'event') score += Math.log1p(weight.get(doc.item) ?? 0);
    hits.push({ doc, score: score / Math.sqrt(q.length), coverage: matched / q.length, strong });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

const SOURCE = {
  ar: { dorar: (n: number) => `المصدر: الموسوعة التاريخية – الدرر السنية، حدث ${digits(n, 'ar')}.`, sahaba: 'المصدر: ملخص موثق من مصادر المشروع (الدرر السنية والصحيحان).' },
  en: { dorar: (n: number) => `Source: Dorar Historical Encyclopedia, event ${n}.`, sahaba: "Source: a cited summary from the project's sources (Dorar and the Sahihayn)." },
};

export function answer(data: Sirah, question: string, locale: Locale): Answer {
  const ar = locale === 'ar';
  if (RULING.test(normalize(question))) return {
    kind: 'refusal',
    text: ar ? 'لا أقدّم فتوى أو حكمًا شرعيًا. يُرجى الرجوع إلى الرئاسة العامة للبحوث العلمية والإفتاء، أو إلى أقرب مركز إسلامي.'
      : 'I can’t give a fatwa or religious ruling. Please ask the General Presidency of Scholarly Research and Ifta, or your nearest Islamic centre.',
  };
  const hits = retrieve(data, question);
  const top = hits[0];
  if (!top || !top.strong || top.coverage < 0.5 || top.score < 3) return {
    kind: 'none',
    text: ar ? 'لم أجد في مصادر المشروع ما يجيب عن سؤالك بدقة. جرّب ذكر اسم حدث أو مكان أو صحابي، أو راجع أقرب مركز إسلامي.'
      : 'I couldn’t find an answer to that in the project’s sources. Try naming an event, place or Companion, or ask your nearest Islamic centre.',
  };
  const q = normalize(question);
  const when = /(متي|في اي سنه|when|what year)/.test(q), where = /(اين|where)/.test(q);
  const { doc } = top;

  if (doc.kind === 'event') {
    const e = doc.item, title = e.title[locale] || e.title.ar, date = dateLine(e, locale), place = eventPlaceName(data, e, locale);
    const body = (!ar && e.text.en) || e.text.ar;
    const lead = when && date ? (ar ? `كان ذلك في ${date}.` : `It took place in ${date}.`)
      : where && place ? (ar ? `كان ذلك في ${place}.` : `It took place at ${place}.`)
      : '';
    const facts = lead ? '' : ` (${[date, place].filter(Boolean).join(ar ? '، ' : ', ')})`;
    return { kind: 'event', event: e.n, sources: sourceLinks([{ label: 'Dorar', url: (!ar && e.urlEn) || e.url }]), text: `${title}${facts}. ${lead} ${excerpt(body, 170)} ${SOURCE[locale].dorar(e.n)}`.replace(/\s+/g, ' ').trim() };
  }
  if (doc.kind === 'person') {
    const p = doc.item, first = p.events.find(n => data.byNumber.has(n) && data.byNumber.get(n)!.lat !== null && data.byNumber.get(n)!.lon !== null);
    const name = ar ? p.name.ar : p.name.en;
    return { kind: 'person', event: first, sources: sourceLinks(p.facts.filter(f => f.url).map(f => ({ label: sourceLabel(f.source, locale), url: f.url! }))), text: `${name}: ${excerpt(!ar && p.bioEn ? p.bioEn : p.bio, 190)} ${SOURCE[locale].sahaba}` };
  }
  const v = doc.item, ev = v.link?.event ?? undefined;
  const refs = hadithLinks(v).map(h => `${h.book === 'bukhari' ? (ar ? 'البخاري' : 'Bukhari') : (ar ? 'مسلم' : 'Muslim')} ${h.n}`).join(ar ? '، ' : ', ');
  const src = refs ? (ar ? `المصدر: صحيح ${refs}.` : `Source: Sahih ${refs}.`) : (ar ? 'المصدر: موسوعة التفسير – الدرر السنية.' : 'Source: Dorar Tafsir Encyclopedia.');
  const surah = ar ? `سورة ${v.surah} (${v.whole ? 'السورة كاملة' : v.ref})` : `Surah ${v.surahEn ?? v.surah} (${v.whole ? 'whole surah' : v.ref})`;
  return { kind: 'verse', event: ev ?? undefined, sources: sourceLinks([...hadithLinks(v).map(h => ({ label: ar ? `${h.book === 'bukhari' ? 'صحيح البخاري' : 'صحيح مسلم'} ${h.n}` : `${h.book === 'bukhari' ? 'Sahih al-Bukhari' : 'Sahih Muslim'} ${h.n}`, url: h.url })), ...v.tafseer.map(url => ({ label: ar ? 'موسوعة التفسير' : 'Tafsir Encyclopedia', url })), ...quranpediaRefs(v.ref, v.whole, locale).map(r => ({ label: `${ar ? 'الموسوعة القرآنية' : 'Quranpedia'} ${r.label}`, url: r.url }))]), text: `${surah}: ${v.phrase[locale]} — ${v.title[locale]}. ${src}` };
}

/**
 * Questions to offer under an event card. Each is put to `answer()` first and kept only when the reply is about
 * this event (a person in it, or a verse the sources link to it), so a suggestion never leads to "no answer".
 */
/** Builds the search index ahead of time (it is cached per data set), so the first question is instant. */
export function warmUp(data: Sirah) { indexFor(data); }

export function suggestFor(data: Sirah, e: SirahEvent, locale: Locale, max = 3): string[] {
  const ar = locale === 'ar';
  const clean = (t: string) => t.replace(/\s*\.\s*$/, '').trim();
  const title = clean(e.title[locale] || e.title.ar);
  const out: string[] = [];
  const keep = (q: string, ok: (a: Answer) => boolean) => { if (out.length < max && !out.includes(q) && ok(answer(data, q, locale))) out.push(q); };
  for (const v of data.verses.filter(v => v.link?.event === e.n && v.link.type === 'direct')) {
    const topics = [clean(v.title[locale] || v.title.ar), title];
    const surah = v.surah.includes('/') ? '' : v.surah; // one surah only, by name (Arabic) — English asks without it
    const asks = ar ? topics.map(t => surah ? `ماذا نزل في سورة ${surah} عن «${t}»؟` : `ماذا نزل من القرآن عن «${t}»؟`)
      : topics.map(t => `What was revealed about “${t}”?`);
    for (const q of asks) { keep(q, a => a.kind === 'verse' && a.event === e.n); if (out.length) break; }
    if (out.length) break;
  }
  for (const p of data.people.filter(p => p.events.includes(e.n))) {
    const name = p.name[locale] || p.name.ar;
    const she = /عنها|^أم |بنت /.test(p.name.ar);
    keep(ar ? `من ${she ? 'هي' : 'هو'} ${name}؟` : `Who was ${name}?`, a => a.kind === 'person' && a.text.startsWith(ar ? `${p.name.ar}:` : `${p.name.en} (`));
  }
  return out;
}
