"""Tests for mapevents.py. No models needed: cd backend/pipeline && python -m unittest test_mapevents"""
import unittest

from mapevents import map_events

EVENTS = {n: dict(dorar_id=n, title=f'event {n}', lat=24.0, lng=39.0) for n in (14, 42, 59, 69, 98, 140)}
EVENTS[2] = dict(dorar_id=2, title='no pin', lat=None, lng=None)


def dorar(n):
    return ({'source': 'dorar_sirah', 'dorar_id': n}, 1.0)


def linked(*ns, source='sahaba'):
    return ({'source': source, 'event_keys': [f'dorar:{n}' for n in ns]}, 1.0)


def ids(text, cited, hits):
    return [e['dorar_id'] for e in map_events(text, cited, hits, EVENTS)]


class MapEvents(unittest.TestCase):
    def test_tie_keeps_the_first_retrieved(self):
        self.assertEqual(ids('Badr [1]. Uhud [2].', [1, 2], [dorar(59), dorar(69)]), [59, 69])

    def test_the_event_the_answer_rests_on_comes_first(self):
        # Badr cited once for context, Uhud three times: the answer is about Uhud.
        self.assertEqual(ids('After Badr [1], Quraysh came to Uhud [2]. The archers [2] left the hill [3].', [1, 2, 3],
                             [dorar(59), dorar(69), dorar(69)]), [69, 59])

    def test_a_passage_about_many_events_counts_less_for_each(self):
        # Abu Bakr's summary (five events) cited twice does not outweigh the Hijrah's own passage cited once.
        self.assertEqual(ids('He migrated [1] with Abu Bakr [2], his companion [2].', [1, 2],
                             [dorar(42), linked(14, 42, 59, 98, 140)])[0], 42)
        self.assertEqual(ids('Abu Bakr [1] was among the first to believe [1].', [1], [linked(14, 42, 59, 98, 140)]),
                         [14, 42, 59, 98, 140])

    def test_events_without_a_pin_are_left_out_and_each_event_listed_once(self):
        self.assertEqual(ids('[1] [2] [3]', [1, 2, 3], [dorar(2), dorar(59), linked(59, 2, source='asbab_curated')]), [59])

    def test_a_passage_used_but_not_marked_still_counts(self):
        self.assertEqual(ids('An answer with no marks.', [1], [dorar(69)]), [69])

    def test_passages_from_books_without_events_add_none(self):
        self.assertEqual(ids('[1] [2]', [1, 2], [({'source': 'raheeq'}, 1.0), ({'source': 'bukhari'}, 1.0)]), [])


if __name__ == '__main__':
    unittest.main()
