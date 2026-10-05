"""Dense, BM25 and hybrid (reciprocal-rank fusion) retrieval over the chunk corpus."""
import numpy as np

from corpus import load_corpus
from bm25 import BM25
from embedders import load_or_build


def rrf(rankings, k=60, weights=None):
    """Reciprocal rank fusion of several ranked index lists."""
    scores = {}
    for r, ranking in enumerate(rankings):
        w = 1.0 if weights is None else weights[r]
        for pos, i in enumerate(ranking):
            scores[i] = scores.get(i, 0.0) + w / (k + pos + 1)
    return sorted(scores, key=scores.get, reverse=True)


class Retriever:
    def __init__(self, model=None, chunks=None, use_bm25=True):
        self.chunks = chunks or load_corpus()
        self.model = model
        self.vecs, self.embedder = (load_or_build(model, self.chunks) if model else (None, None))
        self.bm25 = BM25([c['embed_text'] for c in self.chunks]) if use_bm25 else None

    def ensure_embedder(self):
        if self.embedder is None:
            from embedders import Embedder
            self.embedder = Embedder(self.model)
        return self.embedder

    def dense(self, qvecs, k=50):
        sims = qvecs @ self.vecs.T
        idx = np.argsort(-sims, axis=1)[:, :k]
        return idx, np.take_along_axis(sims, idx, axis=1)

    def search_multi(self, variants, k=10, pool=50):
        """Each item of `variants` is a list of phrasings of ONE question (e.g. English + its Arabic translation).
        Dense and BM25 rankings of every phrasing are fused with RRF; score = best cosine over the phrasings."""
        flat = [v for vs in variants for v in vs]
        qv = self.ensure_embedder().queries(flat)
        didx, dsc = self.dense(qv, pool)
        out, j = [], 0
        for vs in variants:
            rankings, cos = [], {}
            for _ in vs:
                rankings.append(didx[j].tolist())
                for i, s in zip(didx[j].tolist(), dsc[j].tolist()):
                    cos[i] = max(cos.get(i, -1.0), s)
                rankings.append(np.argsort(-self.bm25.scores(flat[j]))[:pool].tolist())
                j += 1
            fused = rrf(rankings)
            q_rows = qv[j - len(vs):j]
            out.append([(i, cos.get(i, float((q_rows @ self.vecs[i]).max()))) for i in fused[:k]])
        return out

    def search(self, queries, mode='hybrid', k=10, pool=50):
        """-> per query: list of (chunk_index, score). score = cosine for dense, rrf for hybrid."""
        out = []
        qv = self.ensure_embedder().queries(queries) if mode in ('dense', 'hybrid') else None
        if qv is not None:
            didx, dsc = self.dense(qv, pool)
        for qi, q in enumerate(queries):
            if mode == 'dense':
                out.append(list(zip(didx[qi][:k].tolist(), dsc[qi][:k].tolist())))
                continue
            bs = self.bm25.scores(q)
            border = np.argsort(-bs)[:pool].tolist()
            if mode == 'bm25':
                out.append([(i, float(bs[i])) for i in border[:k]])
                continue
            fused = rrf([didx[qi].tolist(), border])
            cos = dict(zip(didx[qi].tolist(), dsc[qi].tolist()))
            out.append([(i, cos.get(i, float(qv[qi] @ self.vecs[i]))) for i in fused[:k]])
        return out
