"""Bidaya vs. reading the source pages: two measures computed from the repository's own files.

1. Reading load: for each answered question of the 50-question test (hard-50-2026-10-06.json), the words in Bidaya's
   answer vs. the words in the Dorar event pages that answer cites (same language). Dorar pages only, so the source
   side is a lower bound (al-Raheeq, Bukhari and the other cited books are not counted).
2. Verses with their event: of the verse records linked to a Dorar event (data/3_links_surahs_sirah.csv), how many
   are absent from that event's Dorar page, i.e. the page neither names the surah nor quotes or mentions a revelation.

Run from the repository root:  python3 docs/evaluation/compare_with_sources.py
"""
import csv, json, re, statistics

DATA = 'data/'
words = lambda s: len(re.findall(r'\w+', s or ''))
plain = lambda s: re.sub(r'[ً-ْٰـ]', '', s or '')
events = {int(r['dorar_event_number']): r for r in csv.DictReader(open(DATA + '12_dorar_titles_and_texts_ar_en.csv', encoding='utf-8-sig'))}

# 1. reading load
answered = [q for q in json.load(open('docs/evaluation/hard-50-2026-10-06.json', encoding='utf-8')) if q['kind'] not in ('refusal', 'none')]
pairs, multi = [], 0
for q in answered:
    nums = set()
    for s in q['sources']:
        m = re.search(r'dorar\.net/history/event/(\d+)', s['url']) or re.search(r'#event-(\d+)', s['url'])
        if m: nums.add(int(m.group(1)))
    multi += len(q['sources']) >= 2
    col = 'النص_العربي_الدرر' if q['locale'] == 'ar' else 'text_en_dorar'
    source_words = sum(words(events[n][col]) for n in nums if n in events)
    if source_words: pairs.append((words(q['text']), source_words))
print(f'Answered questions: {len(answered)}; answers citing 2 or more sources: {multi}')
print(f'Answers citing Dorar pages: {len(pairs)}')
print(f'  Bidaya answer, median words:      {statistics.median(a for a, _ in pairs):g}')
print(f'  cited Dorar pages, median words:  {statistics.median(s for _, s in pairs):g}')
print(f'  ratio (pages / answer), median:   {statistics.median(s / a for a, s in pairs):.1f}')

# 2. verses with their event
surahs = {r['المعرف']: r['السورة'] for r in csv.DictReader(open(DATA + '1_related_surahs.csv', encoding='utf-8-sig'))}
links = [r for r in csv.DictReader(open(DATA + '3_links_surahs_sirah.csv', encoding='utf-8-sig')) if r['رقم_حدث_الدرر'].strip()]
absent = 0
for r in links:
    page = plain(events.get(int(float(r['رقم_حدث_الدرر'])), {}).get('النص_العربي_الدرر', ''))
    named = any(p.strip() and p.strip() in page for p in plain(surahs[r['المعرف']]).split('/'))
    revelation = re.search(r'[﴿{]|قال تعالى|قوله تعالى|أنزل الله|نزلت', page)
    absent += not named and not revelation
print(f'Verse records linked to an event: {len(links)}; absent from the event\'s Dorar page: {absent}')
