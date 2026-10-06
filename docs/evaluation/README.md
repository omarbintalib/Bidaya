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

## 5. Bidaya vs. a general AI chatbot (6 Oct 2026)

The same 50 hard questions given to a general AI chatbot, Claude Haiku 4.5, run as an ordinary chat assistant: no
sources, no web, the questions only (no mention of Bidaya or of the test), follow-ups inside their conversation. Its
answers were graded by hand the same way as Bidaya's (section 3). Every answer, with each fault named:
[`general-chatbot-2026-10-06.json`](general-chatbot-2026-10-06.json).

| On the 50 hard questions | General chatbot | Bidaya |
|---|---|---|
| Answers with a false statement | 8 of 50 | 0 of 50 |
| Answers that cite a source for their facts (a book, a hadith collection or a link) | 0 of 50 (5 give Quran verse numbers, 1 of them wrong) | 36 of 36 answers, each with links |
| Fatwa, personal, opinion and off-topic questions referred or declined | 0 of 6 (it answered all six itself) | 6 of 6 |
| Follow-up questions understood | 3 of 5 | 5 of 5 |
| Questions answered | 50 of 50 | 36 of 50 |

The chatbot's false statements include wrong dates (the Prophet's death in 10 AH, the Conquest of Makkah a year after
Hudaybiyyah, Khadijah's death ten years before the Hijrah), a wrong verse number (al-Anfal 9:9) and calling Abdullah ibn
Ubayy a Companion. Where it does better: it answers more questions; Bidaya declines when its sources are silent, by design. Limits: one chatbot, one run, graded by the team; the chatbot
answered the 50 questions in one session.

## 6. A first test with users (6 Oct 2026)

The track's success measure is whether the experience improves the user's understanding. A first, small test on the
day of submission: 15 people who want to learn the Sirah answered 6 questions on the Hijrah (from the plot at Dar
al-Nadwah to the brotherhood of the Emigrants and the Ansar), used Bidaya for about 10 minutes (the same 5 events, and
at least one question to "Ask the map"), then answered the same 6 questions again. Anonymous Google Form: no names, no
question about religion; the last 5 answered a version of the form with each question in Arabic and English. The 15
anonymous responses, as exported from the form, are in [`user-test-2026-10-06.csv`](user-test-2026-10-06.csv) (the
correct answers are Dar al-Nadwah, the cave of Thawr, three nights, the route near the Red Sea coast, Quba, and the
brotherhood).

| Measure (15 people) | Before | After |
|---|---|---|
| Correct answers out of 6 (mean) | 2.7 | 5.2 |
| People with all 6 correct | 2 | 10 |
| "I don't know" answers (all people) | 31 | 2 |

11 of 15 improved, 4 stayed the same (two already had 6 of 6), none got worse. Ratings out of 5: order of events clear
4.2, the map helped 4.5, language clear 4.3. 11 of 15 tried "Ask the map" and found the answer useful; the other 4 did
not try it. The first 10 people alone: 2.8 to 5.5, 7 of 10 improved; the 5 who answered later: 2.6 to 4.6, 4 of 5
improved.

Why so few: the form only went out on the last day of the challenge, and the team had a small circle to share it
with in that time.

Limits: a small group recruited by the team; by their own answer, 5 knew "very little" of the Sirah, 8 "somewhat" and
2 "well", and none were asked whether they are new Muslims or non-Muslims. The same questions before and after, right
after reading, so this measures recall of what was shown; unsupervised and online. 10 further submissions made in three
minutes, five answer patterns each sent twice, were removed as duplicates. This is a limited test with few people, not
proof of benefit at scale; one of our goals is to reach many more people, and a larger test with new Muslims and
non-Muslims is the next step.

## Known limits

- Arabic written in Latin letters ("shu sar b ghazwat badr?") was declined in the graded run and answered in both
  repeat runs: handled, but not reliably.
- False premises the sources are silent on (a journey to Egypt, the Battle of Yarmouk) get "not found" rather than a
  correction: the assistant only states what a source says.
- The wording of an answer changes between runs (the model has no temperature setting); the facts stay the same (section 4).
- Lists that need many events (everything in year 8 AH) can be incomplete, and arithmetic across events (years between
  two migrations) can be off by a year.
- The assistant does not see the event the reader has open: it gets the question, the language and the last turns of
  the conversation, so "what happened here?" is not tied to that event. The question the ask bar suggests names the
  event in full. Sending the open event with the question is a next step, re-tested on the 50 questions before release.
