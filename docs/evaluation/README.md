# Evaluation of "Ask the map"

How the assistant was tested, with the raw answers so every number can be checked. The method behind the
assistant (sources, chunking, retrieval, prompt rules) is in [`../../backend/README.md`](../../backend/README.md).

## 1. Retrieval and answers: 60-question test set (backend toolkit)

60 questions (30 Arabic / 30 English): events 22, verses 14, Companions 8, facts 4, **6 with no source** (unanswerable
or a premise the sources do not establish) and **6 out of scope** (fatwa / personal). The full tables, and how each
step improved them, are in `backend/README.md` → *Evaluation*.

| Measure | Result |
|---|---|
| Retrieval hit@5 (a correct passage in the top 5) | 0.98 |
| Answerable question answered with a correct source | 97.9% (47/48) |
| No-source question → "no source" | 100% (6/6) |
| Fatwa / personal → referred to scholars | 100% (6/6) |
| Latency | 5.3 s mean, 11.2 s p90 |

## 2. 36 everyday questions against the live site (5 Oct 2026)

Arabic and English questions about battles, people, verses, "why / how many / who suggested", comparisons.
All 34 normal questions were answered (no refusals); the 2 follow-ups were not understood, as follow-up support was
not yet deployed. Median 7.5 s. Raw answers: [`benchmark-36-2026-10-05.json`](benchmark-36-2026-10-05.json).
Problems it showed, since fixed: the Companion honorific given to Abdullah ibn Ubayy, "the passages" and English words
in Arabic answers, Arabic source titles in English answers.

## 3. 50 hard questions against the live site (6 Oct 2026)

Nine groups chosen to break the assistant: several events at once, numbers and disputed reports, similar names,
verses, why/how, false premises, follow-ups inside a conversation, questions it must refuse, and messy language
(dialect, typos, Arabic in Latin letters). Graded by hand: right = 1, partly = ½, wrong = 0.

| Group | Score |
|---|---|
| Several events | 5 / 6 |
| Numbers and disputed reports | 5 / 5 |
| Similar names | 5.5 / 6 |
| Verses and their occasions | 6 / 6 |
| Why and how | 5 / 5 |
| False premises | 3.5 / 6 |
| Follow-ups (asked inside the conversation) | 5 / 5 |
| Must refuse or refer (fatwa, personal, opinion, off-topic) | 6 / 6 |
| Messy language | 3 / 5 |
| **Total** | **44 / 50**: 40 right, 8 partly, 2 wrong (both declines); no false statement |

**Wrong information: none.** No answer states anything the sources contradict. The 10 answers not graded right are
7 declines ("not found in the approved sources") rather than guesses, and 3 incomplete answers. One of these was at
first marked as false ("Banu Qaynuqa were granted amnesty"), but that is the wording of the cited Dorar text
(«فمنَّ على بني قينقاع»); the answer is incomplete, as it leaves out their expulsion.

Every question, answer, grade and reason: [`hard-50-2026-10-06.json`](hard-50-2026-10-06.json).

The same 50 questions were also run twice per prompt version in the backend toolkit, with each answer required to
cite a correct passage and to make the group's key point (judged by an LLM): 85–87 / 100 for the deployed prompt.
A further 15 premise questions check that the assistant corrects a premise only when a source states the opposite,
and never "corrects" a true one. Results by prompt version: `backend/README.md` → *Progress*.

## 4. Bidaya vs. reading the source pages

A measured comparison with the current practice (reading the Sirah sources directly), computed from the files in
this repository by [`compare_with_sources.py`](compare_with_sources.py) (`python3 docs/evaluation/compare_with_sources.py`):

| Measure | Reading the sources | Bidaya |
|---|---|---|
| Words to read for an answer (25 answers of the 50-question test that cite Dorar pages; median) | 433 words in the cited Dorar pages | 36 words, with the links (about 10 times less) |
| Answers that draw on two or more sources (36 answered questions) | the reader opens each source | 25 of 36 brought together in one answer |
| Verse records linked to an event (68) | 31 are not in the event's Dorar page: it neither names the surah nor mentions a revelation | all 68 shown on the event's card |

Limits: this measures how much a reader must read and find, not how well they understand; the source side counts
Dorar pages only, so it is a lower bound; the verse check looks for the surah's name or a mention of revelation in the
page text. Understanding with the target audience has not been tested yet (see the presentation's plan).

## Known limits

- Arabic written in Latin letters ("shu sar b ghazwat badr?") is refused about half the time.
- False premises the sources are silent on (a journey to Egypt, the Battle of Yarmouk) get "not found" rather than a
  correction: the assistant only states what a source says.
- Answers vary between runs (the model has no temperature setting); the 2-run consistency is in `backend/README.md`.
- Lists that need many events (everything in year 8 AH) and arithmetic across events (years between two migrations)
  are incomplete.
