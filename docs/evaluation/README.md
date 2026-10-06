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

## 4. Repeatability: the 50 hard questions asked twice (6 Oct 2026)

The same 50 questions, asked twice against the live assistant with
[`rerun_hard50.py`](rerun_hard50.py) (questions in [`hard-50-questions.json`](hard-50-questions.json); every answer of
both runs in [`rerun-2026-10-06.json`](rerun-2026-10-06.json)). Anyone can repeat it: `python3 docs/evaluation/rerun_hard50.py`.

| Same in both runs | Questions |
|---|---|
| Outcome (answered / declined / referred) | 47 / 50 |
| At least one source in common | 45 / 50 |
| Event the map moves to | 40 / 50 |
| Exactly the same sources | 31 / 50 |
| Word-for-word the same text | 0 / 50 (the model has no setting that fixes its wording) |

Every pair of answers was also read by hand: **no answer contradicts its pair**; the facts, numbers and verses are the
same, and the wording and emphasis differ. The 3 different outcomes are borderline cases: an arithmetic question across
two events (q3) and a similar-names question (q13) were answered once and declined once, and the false premise about
Yarmouk (q31) was declined once as "not found" and once as "off topic". Two small faults seen: q3's answer said "about
nine years" where the dates it quotes give about eight, and one English answer (q50) had a stray character in an
honorific.

Every fault found so far, with its cause, fix and commit: [`ERRORS.md`](ERRORS.md).

## Known limits

- Arabic written in Latin letters ("shu sar b ghazwat badr?") is refused about half the time.
- False premises the sources are silent on (a journey to Egypt, the Battle of Yarmouk) get "not found" rather than a
  correction: the assistant only states what a source says.
- The wording of an answer changes between runs (the model has no temperature setting); the facts stay the same (section 4).
- Lists that need many events (everything in year 8 AH) and arithmetic across events (years between two migrations)
  are incomplete.
