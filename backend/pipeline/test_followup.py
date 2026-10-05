"""Follow-up questions (rag.py route/answer with a conversation). No models: a fake LLM and fake passages.
cd backend/pipeline && python -m unittest test_followup"""
import json
import unittest

import rag


class FakeLLM:
    def __init__(self, *replies):
        self.replies, self.prompts = list(replies), []

    def complete_json(self, prompt, model=None, temperature=0.0):
        self.prompts.append(prompt)
        return self.replies.pop(0)


BADR = {'chunk_id': 'dorar_ar_59', 'source': 'dorar_sirah', 'dorar_id': 59, 'title': 'غزوة بدر', 'context_header': 'Badr',
        'text': 'Abu Jahl led Quraysh at Badr.', 'source_url': 'https://dorar.net/history/event/59'}


def bot(llm):
    b = object.__new__(rag.Bidayah)
    b.llm, b.searched = llm, []
    b.events = {59: dict(dorar_id=59, title='غزوة بدر', lat=23.7, lng=38.8)}
    b.search_lock = __import__('threading').Lock()
    b.passages = lambda q, route: b.searched.append(q) or [(BADR, 1.0)]
    return b


class FollowUp(unittest.TestCase):
    def test_a_follow_up_is_searched_and_answered_as_the_question_it_stands_for(self):
        llm = FakeLLM(dict(lang='en', type='sirah_event', standalone='Who led Quraysh at the Battle of Badr?', search_ar='قائد قريش في بدر', search_en='Quraysh leader Badr'),
                      dict(status='answered', answer='Abu Jahl led Quraysh [1].', used=[1]))
        b = bot(llm)
        r = b.answer('Who led them?', 'en', history=[('What happened at Badr?', 'The Muslims won at Badr.')])
        self.assertIn('Q: What happened at Badr?\nA: The Muslims won at Badr.', llm.prompts[0])
        self.assertTrue(llm.prompts[0].rstrip().endswith('Question: Who led them?'))
        self.assertEqual(b.searched, ['Who led Quraysh at the Battle of Badr?'])
        self.assertIn('Question: Who led Quraysh at the Battle of Badr?', llm.prompts[1])
        self.assertEqual((r['status'], r['question'], r['asked']), ('answered', 'Who led them?', 'Who led Quraysh at the Battle of Badr?'))
        self.assertEqual([e['dorar_id'] for e in r['map']], [59])

    def test_without_a_conversation_the_question_is_used_as_asked(self):
        # Even if the router rewrites it: there is nothing for it to follow on from.
        llm = FakeLLM(dict(lang='en', type='sirah_event', standalone='Something else', search_ar='', search_en=''),
                      dict(status='answered', answer='Badr was in 2 AH [1].', used=[1]))
        b = bot(llm)
        r = b.answer('When was Badr?', 'en')
        self.assertNotIn('conversation so far', llm.prompts[0])
        self.assertNotIn('{history}', llm.prompts[0])
        self.assertEqual(b.searched, ['When was Badr?'])
        self.assertEqual(r['asked'], 'When was Badr?')

    def test_an_empty_rewrite_falls_back_to_the_question(self):
        llm = FakeLLM(dict(lang='ar', type='unclear'))
        r = bot(llm).answer('وماذا بعد؟', 'ar', history=[('ما غزوة بدر؟', 'غزوة.')])
        self.assertEqual((r['status'], r['asked']), ('unclear', 'وماذا بعد؟'))


if __name__ == '__main__':
    unittest.main()
