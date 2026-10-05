#!/usr/bin/env python3
"""
Bidayah "Ask the map" API, for the frontend in ../app.

    cd backend && python -m uvicorn server:app --port 8000          (venv with requirements.txt, .env with the key)

POST /api/ask   {"question": "...", "locale": "ar" | "en"}
  -> the frontend's `Answer` (app/src/assistant/answer.ts):
     {"kind": "event"|"person"|"verse"|"refusal"|"none", "text": "...", "sources": [{"label", "url"}], "event": 59}
     plus "status" (answered | insufficient | fatwa | personal | off_topic | unclear) for logging / debugging.
GET  /api/health -> {"ok": true, "chunks": N, "llm": "...", "reranker": true}

The answer text is plain prose: the [n] citation markers the model writes (and rag.py checks) are removed, and
the cited passages become the `sources` links. `event` is the Dorar event with a map pin that the answer rests on
most (pipeline/mapevents.py), so the frontend can move the map there.
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'pipeline'))

from fastapi import FastAPI, HTTPException                       # noqa: E402
from fastapi.middleware.cors import CORSMiddleware               # noqa: E402
from pydantic import BaseModel, Field                            # noqa: E402

from rag import Bidayah, source_url                               # noqa: E402

KIND = {'dorar_sirah': 'event', 'raheeq': 'event', 'sahaba': 'person',
        'asbab_curated': 'verse', 'wahidi_asbab': 'verse', 'bukhari': 'event'}
SOURCE_NAME = {
    'dorar_sirah': ('الدرر السنية', 'Dorar'),
    'raheeq': ('الرحيق المختوم', 'The Sealed Nectar'),
    'wahidi_asbab': ('أسباب النزول للواحدي', 'Asbab al-Nuzul, al-Wahidi'),
    'asbab_curated': ('الآيات المرتبطة بالسيرة', 'Verses and the sirah'),
    'sahaba': ('تراجم موثقة', 'Cited biography'),
    'bukhari': ('صحيح البخاري', 'Sahih al-Bukhari'),
}

app = FastAPI(title='Bidayah Ask the map')
app.add_middleware(CORSMiddleware, allow_methods=['GET', 'POST'], allow_headers=['*'],
                   allow_origins=[o.strip() for o in os.environ.get(
                       'BIDAYAH_CORS', 'http://127.0.0.1:5173,http://localhost:5173').split(',') if o.strip()])
bot = None


@app.on_event('startup')
def load():
    global bot
    if bot is None:                                               # modal_app.py loads it before serving
        bot = Bidayah()                                           # corpus + bge-m3 + reranker (~30 s)


class Turn(BaseModel):
    question: str = Field(max_length=500)
    answer: str = Field(default='', max_length=4000)


class Ask(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    locale: str = 'ar'
    history: list[Turn] = Field(default_factory=list, max_length=6)   # the conversation so far, for follow-ups


def short(s, n=70):
    s = re.sub(r'\s+', ' ', str(s or '')).strip().rstrip('.').strip()
    return s if len(s) <= n else s[:n - 1].rstrip() + '…'


_dorar_en = None


def dorar_en(dorar_id):
    """The English copy of a Dorar event (its first part): its English title and the English page that holds it."""
    global _dorar_en
    if _dorar_en is None:
        _dorar_en = {}
        for c in bot.chunks:
            if c['source'] == 'dorar_sirah' and c['lang'] == 'en':
                _dorar_en.setdefault(str(c['dorar_id']), c)
    return _dorar_en.get(str(dorar_id)) or {}


def source_link(c, lang):
    """A cited chunk -> {label, url} for the answer card's "View source" buttons."""
    ar = lang == 'ar'
    name = SOURCE_NAME[c['source']][0 if ar else 1]
    if c['source'] == 'bukhari':
        return dict(label=f"{name} {c['hadith_no']}", url=f"https://sunnah.com/bukhari:{c['hadith_no']}")
    if c['source'] == 'dorar_sirah':
        if ar:                                                    # the Arabic event (title) for the Arabic interface
            e = bot.events.get(c['dorar_id']) or {}
            return dict(label=f"{name}: {short(e.get('title') or c['title'])}", url=f"https://dorar.net/history/event/{c['dorar_id']}")
        # The English interface: the event's English title and page, whichever copy was cited, so the Arabic and
        # English copies of one event make one link (an Arabic title among English ones read as a different source).
        # The English page lists several events: the fragment keeps one link per event (links are told apart by URL).
        en = c if c['lang'] == 'en' else dorar_en(c['dorar_id'])
        url = en.get('source_url')
        return dict(label=f"{name}: {short(en.get('title') or c.get('title_en') or c['title'])}",
                    url=f"{url}#event-{c['dorar_id']}" if url else f"https://dorar.net/history/event/{c['dorar_id']}")
    if c['source'] in ('asbab_curated', 'sahaba'):
        title = c['title'] if ar else (c.get('title_en') or c['title'])
        return dict(label=f'{name}: {short(title)}', url=c.get('source_url'))
    if c['source'] == 'wahidi_asbab':
        ayah = c.get('ayah_from') not in (None, '', 'None')               # 2 entries are about a whole passage
        title = f"سورة {c['surah_name']}" + (f" {c['ayah_from']}" if ayah else '') if ar else f"Surah {c['surah_no']}" + (f":{c['ayah_from']}" if ayah else '')
    else:
        title = c.get('section') or c.get('title') or ''
    return dict(label=f'{name}: {short(title)}' if title else name, url=source_url(c))


def to_frontend(res):
    lang = res['lang']
    status = res['status']
    out = dict(status=status, text=res['answer'])
    if res.get('asked') and res['asked'] != res['question']:
        out['asked'] = res['asked']                               # a follow-up, as the question it stands for
    if status in ('fatwa', 'personal'):
        return dict(out, kind='refusal')
    if status != 'answered':
        return dict(out, kind='none')
    by_id = {c['chunk_id']: c for c in bot.chunks}
    cited = [by_id[s['chunk_id']] for s in res['sources']]
    links, seen = [], set()
    for c in cited:
        link = source_link(c, lang)
        if link['url'] and link['url'] not in seen:
            seen.add(link['url']); links.append(link)
    text = re.sub(r'\s*(\[\d+\])+', '', res['answer'])
    text = re.sub(r'\s+([.،,؛;:!?؟])', r'\1', text).strip()
    event = next((int(e['dorar_id']) for e in res['map']), None)
    return dict(out, kind=KIND.get(cited[0]['source'], 'event'), text=text, sources=links,
                **({'event': event} if event is not None else {}))


@app.post('/api/ask')
def ask(q: Ask):
    if bot is None:
        raise HTTPException(503, 'loading')
    history = [(t.question.strip(), short(t.answer, 600)) for t in q.history[-3:] if t.question.strip()]
    return to_frontend(bot.answer(q.question.strip(), lang=q.locale if q.locale in ('ar', 'en') else None, history=history))


@app.get('/api/health')
def health():
    return dict(ok=bot is not None, chunks=len(bot.chunks) if bot else 0,
                llm=bot.llm.model if bot else None, reranker=bool(bot and bot.reranker))
