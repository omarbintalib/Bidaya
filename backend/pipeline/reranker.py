"""Cross-encoder re-ranking of the retrieved candidates (BAAI/bge-reranker-v2-m3, multilingual)."""
import numpy as np

from corpus import norm_index

RERANKERS = {'bge-reranker-v2-m3': 'BAAI/bge-reranker-v2-m3'}


class Reranker:
    def __init__(self, name='bge-reranker-v2-m3'):
        from sentence_transformers import CrossEncoder
        import torch
        self.name = name
        cuda = torch.cuda.is_available()
        self.model = CrossEncoder(RERANKERS[name], device='cuda' if cuda else 'cpu', max_length=1024,
                                  model_kwargs={'torch_dtype': torch.float16} if cuda else {})

    def rerank(self, question, chunks_with_idx, k=10):
        """chunks_with_idx: [(index, chunk)] -> [(index, score)] best first; score in [0, 1] (sigmoid)."""
        pairs = [(norm_index(question), c['embed_text']) for _, c in chunks_with_idx]
        s = np.asarray(self.model.predict(pairs, batch_size=16, show_progress_bar=False), dtype=np.float32)
        if s.min() < 0 or s.max() > 1:
            s = 1 / (1 + np.exp(-s))
        order = np.argsort(-s)[:k]
        return [(chunks_with_idx[o][0], float(s[o])) for o in order]
