"""
Which cited events go on the map, and in what order (rag.py's `map`; server.py sends the first as `event`).

The answer's [n] marks show what it rests on. Ordering the events by citation number alone (the first-retrieved
passage first) sent an answer about Uhud to Badr when a Badr passage, cited once for context, had ranked higher.
"""
import re
from collections import Counter


def map_events(text, cited, hits, events):
    """
    The events of the cited passages that have a map pin, the one the answer rests on most first.

    Each [n] mark in `text` counts for the events its passage is about (a passage listed as used but not marked counts
    once), shared between them: a Companion's summary linked to five events is weak evidence for any one of them, a
    Dorar event passage is about one. On a tie, the event of the passage retrieved first (lowest n) comes first, then
    the order the passage lists its events in. `hits` are the (chunk, score) pairs the [n] refer to (1-based);
    `events` maps a Dorar event id to its {dorar_id, title, lat, lng}.
    """
    marks = Counter(int(n) for n in re.findall(r'\[(\d+)\]', text))
    weight, first = Counter(), {}
    for n in cited:
        c = hits[n - 1][0]
        ids = [c['dorar_id']] if c['source'] == 'dorar_sirah' else [int(k.split(':')[1]) for k in c.get('event_keys') or []]
        pinned = [d for d in dict.fromkeys(ids) if events.get(d) and events[d]['lat'] is not None]
        for did in pinned:
            weight[did] += max(1, marks[n]) / len(pinned)
            first.setdefault(did, (n, len(first)))
    return [events[did] for did in sorted(first, key=lambda d: (-weight[d], first[d]))]
