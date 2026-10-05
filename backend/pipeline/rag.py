#!/usr/bin/env python3
"""
Bidayah "Ask the map": question -> route -> retrieve -> grounded answer with citations -> checks.

    python rag.py "متى كانت غزوة بدر؟"
    python rag.py "Why did the Prophet migrate to Madinah?"

Returns a dict the front-end can render directly:
  status      answered | insufficient | fatwa | personal | off_topic | unclear
  answer      text with [n] citations (or a fixed, safe message for every non-answer status)
  sources     the cited passages: title, source, url, chunk_id
  map         dorar event ids (+ lat/lng) of the cited events, to highlight on the map; the one the answer rests on most first
  debug       route, retrieved ids, scores
"""
import json, os, re, sys, threading

from corpus import load_corpus
from retriever import Retriever, rrf
from llm import LLM, ROUTER_MODEL
from mapevents import map_events
import prompts

SEARCH_MODEL = os.environ.get('BIDAYAH_EMBEDDER', 'bge-m3')
TOP_K = 10
POOL = 30                                                   # first-stage candidates given to the reranker
RERANK = os.environ.get('BIDAYAH_RERANK', '1') != '0'
RERANK_WEIGHT = 2.0     # RRF weight of the reranker vs hybrid: best mix on the test set (eval/results/rerank_*)
LANG_NAME = {'ar': 'Arabic (العربية الفصحى المبسطة)', 'en': 'English'}
SOURCE_LABEL = {
    'dorar_sirah': ('الدرر السنية', 'Dorar.net'),
    'raheeq': ('الرحيق المختوم', 'The Sealed Nectar (al-Raheeq al-Makhtum)'),
    'wahidi_asbab': ('أسباب النزول للواحدي', 'Asbab al-Nuzul (al-Wahidi)'),
    'asbab_curated': ('الآيات المرتبطة بالسيرة (الصحيحان وموسوعة التفسير)', 'Verses and the sirah (Sahihayn, Dorar Tafsir Encyclopedia)'),
    'sahaba': ('تراجم موثقة (الدرر السنية والصحيحان)', 'Cited biographies (Dorar, Sahihayn)'),
    'bukhari': ('صحيح البخاري', 'Sahih al-Bukhari'),
}


SHAMELA_BOOK = {'raheeq': (9820, 'page_start'), 'wahidi_asbab': (11314, 'page')}


def source_url(c):
    """Link to the passage: its own URL, or the Shamela page for the books chunked from Shamela text."""
    if c.get('source_url'):
        return c['source_url']
    if c['source'] in SHAMELA_BOOK:
        book, field = SHAMELA_BOOK[c['source']]
        if c.get(field):
            return f'https://shamela.ws/book/{book}/{c[field]}'
    return None


class Bidayah:
    def __init__(self, model=SEARCH_MODEL, llm=None, rerank=RERANK):
        self.chunks = load_corpus()
        self.retriever = Retriever(model=model, chunks=self.chunks)
        self.reranker = None
        if rerank:
            from reranker import Reranker
            self.reranker = Reranker()
        self.llm = llm or LLM()
        self.search_lock = threading.Lock()
        self.events = {c['dorar_id']: dict(dorar_id=c['dorar_id'], title=c['title'], lat=c['lat'], lng=c['lng'])
                       for c in self.chunks if c['source'] == 'dorar_sirah' and c['lang'] == 'ar'}

    def route(self, question):
        r = self.llm.complete_json(prompts.ROUTER.replace('{question}', question), model=ROUTER_MODEL)
        lang = r.get('lang') if r.get('lang') in ('ar', 'en') else ('ar' if re.search(r'[؀-ۿ]', question) else 'en')
        return dict(lang=lang, type=r.get('type', 'unclear'), search_ar=r.get('search_ar') or '', search_en=r.get('search_en') or '')

    def passages(self, question, route, k=TOP_K):
        variants = [question] + [v for v in (route['search_ar'], route['search_en']) if v and v != question]
        hits = self.retriever.search_multi([variants], k=POOL if self.reranker else k)[0]
        if self.reranker:
            # hybrid alone misses passages whose wording differs (e.g. "توفي" vs the title "وفاة"); the
            # cross-encoder finds them, and fusing both rankings keeps the hybrid's good top ranks
            best = {}
            for v in variants:
                for i, s in self.reranker.rerank(v, [(i, self.chunks[i]) for i, _ in hits], k=len(hits)):
                    best[i] = max(best.get(i, 0.0), s)
            reranked = sorted(best, key=best.get, reverse=True)
            order = rrf([[i for i, _ in hits], reranked], weights=[1.0, RERANK_WEIGHT])
            hits = [(i, best[i]) for i in order[:k]]
        return [(self.chunks[i], s) for i, s in hits[:k]]

    @staticmethod
    def format_passages(hits):
        out = []
        for n, (c, _) in enumerate(hits, 1):
            out.append(f"[{n}] ({c['context_header']})\n{c['text']}")
        return '\n\n'.join(out)

    def answer(self, question, lang=None):
        """lang: 'ar' | 'en' to answer in the interface language; None = the question's language."""
        route = self.route(question)
        lang = lang if lang in ('ar', 'en') else route['lang']
        base = dict(question=question, lang=lang, sources=[], map=[], debug=dict(route=route))
        if route['type'] in ('fatwa', 'personal', 'off_topic', 'unclear'):
            return dict(base, status=route['type'], answer=prompts.REFUSAL[route['type']][lang])

        with self.search_lock:                      # one GPU search at a time (API serves concurrent requests)
            hits = self.passages(question, route)
        base['debug']['retrieved'] = [(c['chunk_id'], round(s, 3)) for c, s in hits]
        prompt = (prompts.ANSWER.replace('{lang_name}', LANG_NAME[lang]).replace('{question}', question)
                  .replace('{passages}', self.format_passages(hits)))
        r = self.llm.complete_json(prompt)
        status = r.get('status', 'insufficient')
        if status == 'out_of_scope':
            return dict(base, status='fatwa', answer=prompts.REFUSAL['fatwa'][lang])
        text = (r.get('answer') or '').strip()
        cited = sorted({int(n) for n in re.findall(r'\[(\d+)\]', text)} | {int(n) for n in r.get('used') or [] if str(n).isdigit()})
        bad = [n for n in cited if not 1 <= n <= len(hits)]
        if status != 'answered' or not text or not cited or bad:
            base['debug']['rejected'] = dict(status=status, cited=cited, invalid_citations=bad, raw=text[:300])
            return dict(base, status='insufficient', answer=prompts.REFUSAL['insufficient'][lang])
        sources = []
        for n in cited:
            c = hits[n - 1][0]
            sources.append(dict(n=n, chunk_id=c['chunk_id'], source=SOURCE_LABEL[c['source']][0 if lang == 'ar' else 1],
                                title=c.get('title') or c.get('section') or c.get('bab') or c['context_header'],
                                url=source_url(c), hadith_no=c.get('hadith_no')))
        # The cited events with a map pin (Dorar events; verse records and Companions linked to events), the one the
        # answer rests on most first.
        return dict(base, status='answered', answer=text, sources=sources, map=map_events(text, cited, hits, self.events))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    bot = Bidayah()
    print(json.dumps(bot.answer(' '.join(sys.argv[1:])), ensure_ascii=False, indent=1))
