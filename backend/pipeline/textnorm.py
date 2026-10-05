"""Arabic text normalisation shared by search and indexing (same rules the corpus was built with)."""
import re

INDIC = str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')
DIAC = re.compile(r'[ً-ٰٟۖ-ۭـ]')
BIDI = re.compile(r'[​-‏‪-‮⁦-⁩﻿]')


def norm_index(s):
    """Text used for embedding/BM25: no bidi marks, no tashkeel/tatweel, ASCII digits, one space."""
    s = BIDI.sub('', s or '').translate(INDIC)
    s = DIAC.sub('', s)
    return re.sub(r'[ \t]+', ' ', re.sub(r'\s*\n\s*', '\n', s)).strip()


def norm_key(s):
    """Aggressive normalisation for matching names (alef/ya/ta-marbuta unified, no leading 'ال')."""
    s = norm_index(s)
    s = re.sub(r'[أإآٱ]', 'ا', s).replace('ى', 'ي').replace('ة', 'ه')
    s = re.sub(r'[^ء-ي ]', '', s).strip()
    return re.sub(r'^ال', '', s)
