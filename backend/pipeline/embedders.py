"""
Embedding models under test + a disk cache of corpus embeddings (data/index/<model>/).

Each model gets the query/document formatting its authors recommend; a wrong prefix costs several recall points.
"""
import hashlib, json, os
import numpy as np

from corpus import RAG, norm_index

INDEX_DIR = os.path.join(RAG, 'data', 'index')
TASK = ('Given a question about the life of the Prophet Muhammad (sirah) or the occasions of revelation of '
        'Quran verses, retrieve source passages that answer it')

MODELS = {
    # name: (hf id, query formatter, doc formatter, kwargs)
    'bge-m3': ('BAAI/bge-m3', lambda q: q, lambda d: d, dict(max_len=1024)),
    'e5-large-instruct': ('intfloat/multilingual-e5-large-instruct',
                          lambda q: f'Instruct: {TASK}\nQuery: {q}', lambda d: d, dict(max_len=512)),
    'e5-large': ('intfloat/multilingual-e5-large', lambda q: f'query: {q}', lambda d: f'passage: {d}', dict(max_len=512)),
    'qwen3-0.6b': ('Qwen/Qwen3-Embedding-0.6B', lambda q: f'Instruct: {TASK}\nQuery:{q}', lambda d: d, dict(max_len=1024)),
    'qwen3-4b': ('Qwen/Qwen3-Embedding-4B', lambda q: f'Instruct: {TASK}\nQuery:{q}', lambda d: d,
                 dict(max_len=1024, fp16=True, batch=4)),
    'arctic-l-v2': ('Snowflake/snowflake-arctic-embed-l-v2.0', lambda q: f'query: {q}', lambda d: d, dict(max_len=1024)),
}


class Embedder:
    def __init__(self, name):
        from sentence_transformers import SentenceTransformer
        import torch
        self.name = name
        self.hf, self.fq, self.fd, kw = MODELS[name]
        self.batch = kw.get('batch', 16)
        device = 'cuda' if torch.cuda.is_available() else 'cpu'          # CPU works (slower), e.g. in Docker
        model_kwargs = {'torch_dtype': torch.float16} if kw.get('fp16') and device == 'cuda' else {}
        self.model = SentenceTransformer(self.hf, device=device, model_kwargs=model_kwargs, trust_remote_code=True)
        self.model.max_seq_length = kw.get('max_len', 512)

    def encode(self, texts, batch=None):
        return self.model.encode(texts, batch_size=batch or self.batch, normalize_embeddings=True,
                                 convert_to_numpy=True, show_progress_bar=len(texts) > 200).astype(np.float32)

    def queries(self, qs):
        return self.encode([self.fq(norm_index(q)) for q in qs])

    def docs(self, chunks):
        return self.encode([self.fd(c['embed_text']) for c in chunks])


def corpus_signature(chunks):
    h = hashlib.sha1()
    for c in chunks:
        h.update(c['chunk_id'].encode()); h.update(c['embed_text'].encode('utf-8'))
    return h.hexdigest()[:16]


def load_or_build(name, chunks, embedder=None):
    """Corpus embeddings for `name`, rebuilt only when the corpus (ids + embed_text) changed."""
    d = os.path.join(INDEX_DIR, name)
    sig = corpus_signature(chunks)
    meta_p, vec_p = os.path.join(d, 'meta.json'), os.path.join(d, 'vectors.npy')
    if os.path.exists(meta_p) and json.load(open(meta_p))['signature'] == sig:
        return np.load(vec_p), embedder
    embedder = embedder or Embedder(name)
    vecs = embedder.docs(chunks)
    os.makedirs(d, exist_ok=True)
    np.save(vec_p, vecs)
    json.dump(dict(signature=sig, model=MODELS[name][0], n=len(chunks), ids=[c['chunk_id'] for c in chunks]),
              open(meta_p, 'w'), indent=0)
    return vecs, embedder
