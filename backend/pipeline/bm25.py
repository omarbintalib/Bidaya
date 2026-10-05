"""BM25 over normalised Arabic/English tokens (no external dependency)."""
import math, re
from collections import Counter
import numpy as np

from corpus import loose

AR_PREFIX = re.compile(r'^(?:وال|فال|بال|كال|لل|ال|و)(?=[ء-ي]{3,})')
STOP = set('في من على عن الى إلى ما ماذا متى لماذا كيف هل من هو هي ان أن او أو ثم قد لا لم لن كان كانت الذي التي ذلك هذا هذه '
           'قال قالت صلى الله عليه وسلم ﷺ رضي عنه عنها the a an of to in on at for and or is was were did does do what when '
           'why how who which with by from that this it as be his her he she they'.split())


def tokens(s):
    out = []
    for w in re.findall(r'[ء-ي]+|[a-z0-9]+', loose(s)):
        if w in STOP:
            continue
        w = AR_PREFIX.sub('', w) if re.match(r'[ء-ي]', w) else w
        if len(w) > 1 and w not in STOP:
            out.append(w)
    return out


class BM25:
    def __init__(self, docs, k1=1.5, b=0.75):
        self.k1, self.b = k1, b
        self.tf = [Counter(tokens(d)) for d in docs]
        self.len = np.array([sum(t.values()) for t in self.tf], dtype=np.float32)
        self.avg = float(self.len.mean())
        df = Counter(w for t in self.tf for w in t)
        n = len(docs)
        self.idf = {w: math.log(1 + (n - f + 0.5) / (f + 0.5)) for w, f in df.items()}

    def scores(self, query):
        q = tokens(query)
        s = np.zeros(len(self.tf), dtype=np.float32)
        norm = self.k1 * (1 - self.b + self.b * self.len / self.avg)
        for w in set(q):
            idf = self.idf.get(w)
            if idf is None:
                continue
            f = np.array([t.get(w, 0) for t in self.tf], dtype=np.float32)
            s += idf * f * (self.k1 + 1) / (f + norm)
        return s
