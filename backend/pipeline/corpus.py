"""Load the chunk corpus (all sources) and a tiny keyword search used for building / checking the test set."""
import glob, json, os, re, sys

RAG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from textnorm import norm_index, norm_key

CHUNKS_DIR = os.path.join(RAG, 'data', 'chunks')


def load_corpus():
    out = []
    for f in sorted(glob.glob(os.path.join(CHUNKS_DIR, '*_chunks.jsonl'))):
        out += [json.loads(l) for l in open(f, encoding='utf-8')]
    return out


def loose(s):
    """Normalisation for matching: no tashkeel, unified alef/ya/ta-marbuta, lowercase."""
    s = norm_index(s).lower()
    s = re.sub(r'[أإآٱ]', 'ا', s).replace('ى', 'ي').replace('ة', 'ه')
    return s


def grep(corpus, *terms, source=None, lang=None, limit=15):
    """Chunks containing ALL terms (loose match), as (chunk_id, short preview)."""
    ts = [loose(t) for t in terms]
    hits = []
    for c in corpus:
        if source and c['source'] != source:
            continue
        if lang and c.get('lang') != lang:
            continue
        t = loose(c['embed_text'])
        if all(x in t for x in ts):
            hits.append(c)
    return hits[:limit]


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    corpus = load_corpus()
    src = None
    args = sys.argv[1:]
    if args and args[0].startswith('src='):
        src, args = args[0][4:], args[1:]
    for c in grep(corpus, *args, source=src):
        print(c['chunk_id'], '|', c['context_header'][:90], '|', c['text_index'][:110].replace('\n', ' '))
